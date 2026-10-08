#!/usr/bin/env python3
"""Fixed read-only acceptance gates; receipts contain booleans/counts, never models.

Does not acquire/release control, deliver input, run probes, or replay commands.
Callers retain lifecycle ownership and must release in their own finally block.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import socket
import stat
import time
from service import STATE

GATES = ('ready', 'route', 'bundle-source', 'network', 'native-tree', 'react-tree', 'host-idle', 'idle')
LIMIT = 8 * 1024 * 1024


class VerificationError(RuntimeError):
    pass


def remaining(deadline, clock=time.monotonic):
    value = deadline - clock()
    if value <= 0:
        raise VerificationError('deadline_exceeded')
    return value


def exchange(path, message, deadline, clock=time.monotonic):
    """One bounded IPC request. No raw provider/host errors escape this module."""
    with socket.socket(socket.AF_UNIX) as connection:
        connection.settimeout(remaining(deadline, clock))
        connection.connect(str(path))
        connection.settimeout(remaining(deadline, clock))
        connection.sendall(json.dumps(message).encode() + b'\n')
        body = bytearray()
        while b'\n' not in body:
            connection.settimeout(remaining(deadline, clock))
            part = connection.recv(min(65536, LIMIT + 1 - len(body)))
            if not part:
                raise VerificationError('response_incomplete')
            body.extend(part)
            if len(body) > LIMIT:
                raise VerificationError('response_limit')
        value = json.loads(body.split(b'\n', 1)[0])
        if not isinstance(value, dict):
            raise VerificationError('response_shape')
        if 'error' in value:
            # These known rejection codes are safe enums; all other error bodies
            # may originate in model providers and remain private/unused.
            code = value['error']
            if code in ('command_in_flight', 'lease_required', 'unknown_command'):
                raise VerificationError(code)
            raise VerificationError('request_rejected')
        return value


def read_lease(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_size > 1024:
            raise VerificationError('lease_file_not_private')
        value = json.load(stream)
    lease = value.get('lease') if isinstance(value, dict) else None
    if not isinstance(lease, str) or not re.fullmatch('[a-f0-9]{32}', lease):
        raise VerificationError('lease_file_invalid')
    return lease


def current_binding(status, lease=None):
    epoch = status.get('epoch')
    if not isinstance(epoch, str) or not epoch:
        raise VerificationError('host_identity_unknown')
    device = status.get('device')
    boot = device.get('boot') if isinstance(device, dict) else None
    bundle = device.get('bundle') if isinstance(device, dict) else None
    if lease is not None:
        active_lease = status.get('lease')
        if not isinstance(active_lease, dict) or active_lease.get('id') != lease:
            raise VerificationError('lease_changed')
        if not isinstance(boot, str) or not boot or bundle != 'com.dev.kudos.fit':
            raise VerificationError('development_device_required')
    return epoch, boot, bundle


def evaluate(gate, value, expected=None, max_age_ms=3000):
    """Typed, fail-closed interpretation of one fixed observation."""
    if not isinstance(value, dict):
        return False, {'known': False}
    if gate in ('host-idle', 'idle'):
        host = (value.get('lease', 'missing') is None and
                value.get('reactFrontendRunning') is False and
                value.get('reactFrontendCleanupPending') is False)
        feedback = value.get('deviceFeedback')
        device_known = isinstance(value.get('device'), dict) and isinstance(feedback, dict)
        device = device_known and feedback.get('leased') is False and feedback.get('indicator') is False
        return bool(host and (gate == 'host-idle' or device)), {
            'hostIdle': bool(host), 'deviceFeedbackKnown': bool(device_known),
            'nativeLeaseOff': bool(device_known and feedback.get('leased') is False),
            'nativeIndicatorOff': bool(device_known and feedback.get('indicator') is False)}
    if gate == 'native-tree':
        nodes = value.get('nodes')
        valid = isinstance(nodes, list) and 0 < len(nodes) <= 2500 and all(isinstance(node, dict) for node in nodes)
        foreground = type(value.get('applicationState')) is int and value.get('applicationState') == 0
        snapshot = value.get('snapshot')
        snapshot_known = isinstance(snapshot, str) and bool(snapshot)
        # Normal app window only; a developer screenshot/tree cannot prove
        # absence of system-level occlusion.
        ok = valid and snapshot_known and value.get('truncated') is False and foreground and value.get('scope') == 'app-owned-main-window'
        return bool(ok), {'nodes': len(nodes) if valid else 0, 'complete': value.get('truncated') is False,
                          'foreground': foreground, 'snapshotKnown': snapshot_known, 'systemOcclusionVerified': False}
    if gate == 'react-tree':
        data = value.get('data')
        nodes = data.get('nodes') if isinstance(data, dict) else None
        count = data.get('totalCount') if isinstance(data, dict) else None
        connected = data.get('connectedApps') if isinstance(data, dict) else None
        valid = isinstance(nodes, list) and 0 < len(nodes) <= 2500 and all(isinstance(node, dict) for node in nodes) and type(count) is int and count > 0 and type(connected) is int and connected > 0
        return bool(value.get('ok') is True and valid), {'reconstructedRoots': len(nodes) if valid else 0,
                                                         'totalComponents': count if valid else 0, 'depthLimit': 8, 'providerConnected': valid}
    domain = value.get('domain')
    age = domain.get('ageMs') if isinstance(domain, dict) else None
    fresh = (isinstance(domain, dict) and domain.get('active') is True and
             type(age) in (int, float) and math.isfinite(age) and 0 <= age <= max_age_ms)
    ready = value.get('ready') is True and fresh
    if gate == 'ready':
        return bool(ready), {'runtimeReady': value.get('ready') is True, 'domainFresh': bool(fresh)}
    if gate == 'bundle-source':
        match = value.get('bundleSource') == expected
        return bool(ready and match), {'runtimeReady': bool(ready), 'expectedSourceMatched': bool(match)}
    if gate == 'route':
        navigation = domain.get('navigation') if isinstance(domain, dict) else None
        match = isinstance(navigation, dict) and navigation.get('registered') is True and navigation.get('route') == expected
        return bool(ready and match), {'runtimeReady': bool(ready), 'expectedRouteMatched': bool(match)}
    if gate == 'network':
        probe = domain.get('probe') if isinstance(domain, dict) else None
        known = isinstance(probe, dict)
        probe_age = probe.get('ageMs') if known else None
        probe_fresh = type(probe_age) in (int, float) and math.isfinite(probe_age) and 0 <= probe_age <= max_age_ms
        ok = known and probe_fresh and probe.get('httpStatus') == 200 and probe.get('graphqlReady') is True and probe.get('outcome') == 'ready'
        return bool(ready and ok), {'runtimeReady': bool(ready), 'probeKnown': known, 'graphqlReady': bool(ok),
                                  'probeFreshnessVerified': bool(probe_fresh)}
    raise VerificationError('unsupported_gate')


class Verifier:
    def __init__(self, state=STATE, exchange_fn=exchange, clock=time.monotonic, sleep=time.sleep):
        self.state, self.exchange, self.clock, self.sleep = Path(state), exchange_fn, clock, sleep
        self.binding = None

    def call(self, message, deadline):
        return self.exchange(self.state / 'control.sock', message, deadline, self.clock)

    def status(self, lease, deadline):
        value = self.call({'op': 'status'}, deadline)
        binding = current_binding(value, lease)
        if self.binding is None:
            self.binding = binding
        elif binding != self.binding:
            raise VerificationError('host_or_device_changed')
        return value

    def pause(self, deadline):
        self.sleep(min(0.25, remaining(deadline, self.clock)))

    def action(self, name, lease, deadline):
        # Retry only an explicit pre-admission rejection. Once admitted, read
        # the same command ID until terminal; an unknown result never resubmits.
        while True:
            self.status(lease, deadline)
            try:
                admitted = self.call({'op': 'action', 'action': name, 'args': {}, 'lease': lease}, deadline)
                break
            except VerificationError as error:
                if str(error) != 'command_in_flight':
                    raise
                self.pause(deadline)
        cid = admitted.get('id')
        if not isinstance(cid, str) or not cid:
            raise VerificationError('command_identity_unknown')
        while True:
            answer = self.call({'op': 'result', 'id': cid, 'lease': lease}, deadline)
            if answer.get('id') != cid:
                raise VerificationError('command_identity_changed')
            status = answer.get('status')
            if status == 'completed':
                self.status(lease, deadline)  # Results from retired epochs never pass.
                result = answer.get('result')
                if not isinstance(result, dict) or 'error' in result:
                    raise VerificationError('observation_failed')
                return result
            if status not in ('queued', 'sent'):
                raise VerificationError('observation_not_confirmed')
            self.pause(deadline)

    def observe(self, gate, lease, deadline):
        status = self.status(lease, deadline)
        if gate in ('idle', 'host-idle'):
            return status
        if gate == 'react-tree':
            if status.get('reactFrontendRunning') is not True:
                return {}
            runtime = self.action('state', lease, deadline)
            if not evaluate('ready', runtime)[0]:
                return {}
            fingerprint = hashlib.sha256(lease.encode()).hexdigest()[:16]
            path = self.state / 'react' / fingerprint / 'daemon.sock'
            try:
                before = self.exchange(path, {'type': 'status'}, deadline, self.clock)
                before_data = before.get('data')
                before_count = before_data.get('connectedApps') if isinstance(before_data, dict) else None
                if before.get('ok') is not True or type(before_count) is not int or before_count < 1:
                    return {}
                value = self.exchange(path, {'type': 'get-tree', 'depth': 8}, deadline, self.clock)
                after = self.exchange(path, {'type': 'status'}, deadline, self.clock)
                after_data = after.get('data')
                after_count = after_data.get('connectedApps') if isinstance(after_data, dict) else None
                if after.get('ok') is not True or type(after_count) is not int or after_count < 1:
                    return {}
                if isinstance(value.get('data'), dict):
                    value['data']['connectedApps'] = after_count
            except (FileNotFoundError, ConnectionRefusedError):
                return {}  # Nothing submitted to a provider; readiness can wait.
            self.status(lease, deadline)
            return value
        return self.action('tree' if gate == 'native-tree' else 'state', lease, deadline)

    def run(self, gate, lease=None, expected=None, timeout=30):
        if gate not in GATES or type(timeout) not in (int, float) or not math.isfinite(timeout) or not 0 < timeout <= 120:
            raise VerificationError('invalid_gate_or_timeout')
        if gate in ('idle', 'host-idle'):
            if lease is not None:
                raise VerificationError('idle_requires_no_lease_argument')
        elif lease is None:
            raise VerificationError('lease_required')
        if gate == 'route' and (not isinstance(expected, str) or not re.fullmatch('[A-Za-z_][A-Za-z0-9_]{0,63}', expected) or expected == 'unknown'):
            raise VerificationError('fixed_route_name_required')
        if gate == 'bundle-source' and expected not in ('tailnet-Metro', 'embedded'):
            raise VerificationError('fixed_bundle_source_required')
        self.binding = None
        start, attempts, summary = self.clock(), 0, {}
        deadline = start + timeout
        try:
            while True:
                remaining(deadline, self.clock)
                attempts += 1
                value = self.observe(gate, lease, deadline)
                passed, summary = evaluate(gate, value, expected)
                if passed:
                    return {'version': 1, 'gate': gate, 'status': 'passed', 'attempts': attempts,
                            'elapsedMs': round((self.clock() - start) * 1000), 'observation': summary}
                self.pause(deadline)
        except (OSError, ValueError, RuntimeError) as error:
            # Fixed categories only; never serialize raw socket/provider/model
            # exceptions, paths, capabilities, or message bodies into receipts.
            safe = 'deadline_exceeded' if self.clock() >= deadline else str(error) if isinstance(error, VerificationError) else 'transport_or_shape_error'
            allowed = {'deadline_exceeded', 'lease_changed', 'host_or_device_changed', 'host_identity_unknown',
                       'development_device_required', 'command_identity_unknown', 'command_identity_changed',
                       'observation_failed', 'observation_not_confirmed', 'lease_required', 'unknown_command',
                       'response_incomplete', 'response_limit', 'response_shape', 'request_rejected'}
            return {'version': 1, 'gate': gate, 'status': 'failed', 'reason': safe if safe in allowed else 'transport_or_shape_error',
                    'attempts': attempts, 'elapsedMs': round((self.clock() - start) * 1000), 'observation': summary}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('gate', choices=GATES)
    parser.add_argument('--state', type=Path, default=STATE)
    parser.add_argument('--lease-file', type=Path)
    parser.add_argument('--expect')
    parser.add_argument('--timeout', type=float, default=30)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.parent.stat().st_mode & 0o077:
        raise VerificationError('private_output_directory_required')
    lease = read_lease(args.lease_file) if args.lease_file else None
    # Reserve before any observation; never truncate an existing receipt.
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'w') as stream:
            receipt = Verifier(args.state).run(args.gate, lease, args.expect, args.timeout)
            json.dump(receipt, stream, indent=2)
            stream.write('\n')
    except Exception:
        args.output.unlink(missing_ok=True)
        raise
    print(json.dumps({'gate': args.gate, 'status': receipt['status'], 'output': str(args.output.resolve())}))
    return 0 if receipt['status'] == 'passed' else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError):
        # Argument/path/IPC failures must not expose inherited data or secrets.
        print('verification_setup_failed', file=__import__('sys').stderr)
        raise SystemExit(1)
