"""Adversarial acceptance gates: no live phone, service, DB, or provider required."""
import json
from pathlib import Path
import socket
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from verify import Verifier, VerificationError, evaluate, exchange, read_lease

LEASE = 'a' * 32


def active_status(epoch='epoch-1', boot='boot-1'):
    return {'epoch': epoch, 'device': {'boot': boot, 'bundle': 'com.dev.kudos.fit'},
            'lease': {'id': LEASE}, 'reactFrontendRunning': True, 'reactFrontendCleanupPending': False}


def state(route='ClientDashboard', age=0):
    return {'ready': True, 'domain': {'active': True, 'ageMs': age, 'navigation': {'registered': True, 'route': route}}}


class ScriptedIPC:
    """Real acceptance/terminal result separation with independently varied reads."""
    def __init__(self, observations, statuses=None, terminal='completed'):
        self.now = 0.0
        self.observations = iter(observations)
        self.statuses = iter(statuses) if statuses else None
        self.terminal = terminal
        self.messages = []
        self.value = None

    def clock(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds

    def exchange(self, path, message, deadline, clock):
        self.messages.append(message)
        if message.get('op') == 'status':
            return next(self.statuses) if self.statuses else active_status()
        if message.get('op') == 'action':
            self.value = next(self.observations)
            return {'id': 'command-1'}
        if message.get('op') == 'result':
            return {'id': 'command-1', 'status': self.terminal, 'result': self.value}
        return self.value

    def verifier(self):
        return Verifier('/unused', self.exchange, self.clock, self.sleep)


class VerificationTests(unittest.TestCase):
    def test_stale_domain_and_unknown_route_never_pass(self):
        self.assertFalse(evaluate('route', state(age=3001), 'ClientDashboard')[0])
        self.assertFalse(evaluate('route', state(route='unknown'), 'ClientDashboard')[0])
        self.assertFalse(evaluate('ready', {'ready': True})[0])
        self.assertFalse(evaluate('ready', state(age=float('nan')))[0])
        self.assertFalse(evaluate('ready', state(age=True))[0])
        self.assertFalse(evaluate('ready', {'ready': 'true', 'domain': {'active': True, 'ageMs': 0}})[0])

    def test_wait_observes_new_route_instead_of_accepting_old_snapshot(self):
        ipc = ScriptedIPC([state('unknown'), state('ClientDashboard')])
        result = ipc.verifier().run('route', LEASE, 'ClientDashboard', 2)
        self.assertEqual(result['status'], 'passed')
        self.assertEqual(result['attempts'], 2)
        self.assertEqual([m['action'] for m in ipc.messages if m.get('op') == 'action'], ['state', 'state'])
        self.assertNotIn(LEASE, json.dumps(result))

    def test_wait_timeout_is_bounded_and_never_delivers_input(self):
        ipc = ScriptedIPC([state('unknown')] * 8)
        result = ipc.verifier().run('route', LEASE, 'ClientDashboard', 1)
        self.assertEqual(result['reason'], 'deadline_exceeded')
        self.assertEqual(ipc.now, 1)
        self.assertTrue(all(m.get('action', 'state') == 'state' for m in ipc.messages))

    def test_terminal_unknown_outcome_is_not_replayed_even_for_read(self):
        ipc = ScriptedIPC([state()], terminal='cancelled')
        result = ipc.verifier().run('ready', LEASE, timeout=3)
        self.assertEqual(result['reason'], 'observation_not_confirmed')
        self.assertEqual(sum(m.get('op') == 'action' for m in ipc.messages), 1)

    def test_host_restart_or_device_reboot_invalidates_completed_result(self):
        for changed in (active_status(epoch='epoch-2'), active_status(boot='boot-2')):
            ipc = ScriptedIPC([state()], [active_status(), active_status(), changed])
            result = ipc.verifier().run('ready', LEASE, timeout=3)
            self.assertEqual(result['reason'], 'host_or_device_changed')
            self.assertNotEqual(result['status'], 'passed')

    def test_collision_revocation_invalidates_completed_result(self):
        revoked = active_status()
        revoked['lease'] = {'id': 'b' * 32}
        ipc = ScriptedIPC([state()], [active_status(), active_status(), revoked])
        self.assertEqual(ipc.verifier().run('ready', LEASE, timeout=3)['reason'], 'lease_changed')

    def test_cleanup_waits_for_native_feedback_and_pending_frontend(self):
        idle = {'epoch': 'epoch-1', 'device': {'boot': 'boot-1', 'bundle': 'com.dev.kudos.fit'},
                'lease': None, 'reactFrontendRunning': False, 'reactFrontendCleanupPending': False,
                'deviceFeedback': {'leased': False, 'indicator': False}}
        cleanup = {**idle, 'reactFrontendCleanupPending': True}
        missing = {**idle, 'deviceFeedback': None}
        ipc = ScriptedIPC([], [cleanup, missing, idle])
        result = ipc.verifier().run('idle', timeout=2)
        self.assertEqual(result['attempts'], 3)
        self.assertEqual(result['status'], 'passed')
        self.assertFalse(any(m.get('op') in ('action', 'release', 'acquire') for m in ipc.messages))
        self.assertFalse(evaluate('idle', {**idle, 'device': None})[0])
        self.assertTrue(evaluate('host-idle', {**idle, 'device': None})[0])
        self.assertFalse(evaluate('idle', {**idle, 'deviceFeedback': {'leased': 'false', 'indicator': False}})[0])

    def test_tree_count_or_device_connection_alone_is_not_readiness(self):
        self.assertFalse(evaluate('react-tree', {'ok': True, 'data': {'totalCount': 900, 'connectedApps': 1, 'nodes': []}})[0])
        self.assertFalse(evaluate('native-tree', {'nodes': [{}], 'truncated': True, 'applicationState': 0, 'scope': 'app-owned-main-window'})[0])
        self.assertTrue(evaluate('react-tree', {'ok': True, 'data': {'totalCount': 900, 'connectedApps': 1, 'nodes': [{'secret': 'private'}]}})[0])
        receipt = evaluate('react-tree', {'ok': True, 'data': {'totalCount': 900, 'connectedApps': 1, 'nodes': [{'secret': 'private'}]}})[1]
        self.assertNotIn('private', json.dumps(receipt))

    def test_cached_provider_tree_rejected_when_connection_drops(self):
        calls = []
        def ipc(path, message, deadline, clock):
            calls.append((path, message))
            if message.get('op') == 'status':
                return active_status()
            if message.get('op') == 'action':
                return {'id': 'read-1'}
            if message.get('op') == 'result':
                return {'id': 'read-1', 'status': 'completed', 'result': state()}
            if message.get('type') == 'get-tree':
                return {'ok': True, 'data': {'nodes': [{}], 'totalCount': 900}}
            connected = 1 if sum(m.get('type') == 'status' for _, m in calls) == 1 else 0
            return {'ok': True, 'data': {'connectedApps': connected}}
        verifier = Verifier('/unused', ipc)
        self.assertEqual(verifier.observe('react-tree', LEASE, time.monotonic() + 2), {})

    def test_pending_result_waits_same_id_until_deadline_without_replay(self):
        ipc = ScriptedIPC([state()], terminal='sent')
        result = ipc.verifier().run('ready', LEASE, timeout=1)
        self.assertEqual(result['reason'], 'deadline_exceeded')
        self.assertEqual(sum(m.get('op') == 'action' for m in ipc.messages), 1)
        self.assertEqual({m['id'] for m in ipc.messages if m.get('op') == 'result'}, {'command-1'})

    def test_wrong_terminal_command_identity_refused(self):
        ipc = ScriptedIPC([state()])
        original = ipc.exchange
        def changed(*args):
            value = original(*args)
            if args[1].get('op') == 'result':
                value['id'] = 'some-other-command'
            return value
        ipc.exchange = changed
        self.assertEqual(ipc.verifier().run('ready', LEASE, timeout=1)['reason'], 'command_identity_changed')

    def test_native_foreground_and_snapshot_unknown_never_pass(self):
        value = {'nodes': [{}], 'snapshot': 'fresh', 'truncated': False,
                 'applicationState': 0, 'scope': 'app-owned-main-window'}
        self.assertTrue(evaluate('native-tree', value)[0])
        self.assertFalse(evaluate('native-tree', {**value, 'applicationState': False})[0])
        self.assertFalse(evaluate('native-tree', {**value, 'snapshot': None})[0])
        self.assertFalse(evaluate('native-tree', {**value, 'nodes': ['unknown']})[0])

    def test_network_requires_current_domain_and_exact_success(self):
        value = state()
        value['domain']['probe'] = {'httpStatus': 200, 'graphqlReady': True, 'outcome': 'ready', 'ageMs': 0}
        self.assertTrue(evaluate('network', value)[0])
        value['domain']['probe']['ageMs'] = 4000
        self.assertFalse(evaluate('network', value)[0])
        value['domain']['probe']['ageMs'] = float('nan')
        self.assertFalse(evaluate('network', value)[0])
        value['domain']['probe']['ageMs'] = 0
        self.assertFalse(evaluate('network', state())[0])
        value['domain']['active'] = False
        self.assertFalse(evaluate('network', value)[0])
        self.assertFalse(evaluate('network', {'ready': True, 'domain': {'active': True, 'ageMs': 0, 'probe': {'httpStatus': 200, 'graphqlReady': 'true', 'outcome': 'ready'}}})[0])

    def test_unsupported_gate_and_arbitrary_expectation_refused(self):
        verifier = ScriptedIPC([]).verifier()
        for gate, expected in [('eval', None), ('route', 'unknown'), ('route', 'foo();'), ('bundle-source', 'http://remote')]:
            with self.assertRaises(VerificationError):
                verifier.run(gate, LEASE, expected)
        for timeout in (-1, 0, 121, float('inf')):
            with self.assertRaises(VerificationError):
                verifier.run('ready', LEASE, timeout=timeout)

    def test_lease_permissions_and_symlinks_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'lease.json'
            path.write_text(json.dumps({'lease': LEASE}))
            path.chmod(0o644)
            with self.assertRaises(VerificationError):
                read_lease(path)
            path.chmod(0o600)
            self.assertEqual(read_lease(path), LEASE)
            link = Path(temp) / 'symlink'
            link.symlink_to(path)
            with self.assertRaises(OSError):
                read_lease(link)

    def test_transport_enforces_deadline_on_partial_response(self):
        with tempfile.TemporaryDirectory(dir='/tmp') as temp:
            path = Path(temp) / 'socket'
            ready = threading.Event()
            def serve():
                with socket.socket(socket.AF_UNIX) as server:
                    server.bind(str(path))
                    server.listen(1)
                    ready.set()
                    connection, _ = server.accept()
                    with connection:
                        connection.recv(1024)
                        connection.sendall(b'{"ready":')
                        time.sleep(0.2)
            worker = threading.Thread(target=serve)
            worker.start()
            ready.wait(1)
            start = time.monotonic()
            with self.assertRaises((VerificationError, TimeoutError)):
                exchange(path, {'op': 'status'}, start + 0.05)
            self.assertLess(time.monotonic() - start, 0.18)
            worker.join(1)

    def test_provider_secret_error_never_enters_receipt(self):
        def reject(*args):
            raise RuntimeError('Authorization: Bearer highly-private-token')
        result = Verifier('/unused', reject).run('ready', LEASE)
        self.assertEqual(result['reason'], 'transport_or_shape_error')
        self.assertNotIn('highly-private-token', json.dumps(result))


if __name__ == '__main__':
    unittest.main()
