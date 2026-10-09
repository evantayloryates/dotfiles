#!/usr/bin/env python3
"""Bounded passive AGX registry observations; no root, UI, guard or GPU attribution."""
import argparse
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import plistlib
import resource
import selectors
import signal
import subprocess
import time

MAX_BYTES = 1024 * 1024
UTILIZATION = ('Device Utilization %', 'Renderer Utilization %', 'Tiler Utilization %')
COUNTERS = ('Alloc system memory', 'In use system memory', 'In use system memory (driver)',
            'Allocated PB Size', 'SplitSceneCount', 'TiledSceneBytes', 'lastRecoveryTime', 'recoveryCount')


def cpu_seconds():
    """Cumulative CPU of this observer and its reaped children, kept separate."""
    own = resource.getrusage(resource.RUSAGE_SELF)
    children = resource.getrusage(resource.RUSAGE_CHILDREN)
    return {'observer': own.ru_utime + own.ru_stime,
            'reaped_query_children': children.ru_utime + children.ru_stime}


def bounded_output(command, deadline_s=2, max_bytes=MAX_BYTES):
    child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, start_new_session=True)
    data = bytearray()
    until = time.monotonic() + deadline_s
    try:
        os.set_blocking(child.stdout.fileno(), False)
        with selectors.DefaultSelector() as selector:
            selector.register(child.stdout, selectors.EVENT_READ)
            while True:
                remaining = until - time.monotonic()
                if remaining <= 0:
                    raise RuntimeError('deadline')
                if not selector.select(min(remaining, .1)):
                    continue
                chunk = os.read(child.stdout.fileno(), 65536)
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > max_bytes:
                    raise RuntimeError('output_budget')
        if child.wait(timeout=max(.001, until-time.monotonic())) != 0:
            raise RuntimeError('command_failed')
        return bytes(data)
    except subprocess.TimeoutExpired:
        raise RuntimeError('deadline') from None
    finally:
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait(timeout=2)
        child.stdout.close()


def extract(raw):
    if len(raw) > MAX_BYTES:
        raise RuntimeError('output_budget')
    try:
        nodes = plistlib.loads(raw)
    except Exception:
        raise RuntimeError('invalid_registry_payload') from None
    if not isinstance(nodes, list) or any(not isinstance(n, dict) for n in nodes):
        raise RuntimeError('invalid_registry_payload')
    accelerators = []
    for node in nodes[:4]:
        stats = node.get('PerformanceStatistics')
        stats = stats if isinstance(stats, dict) else {}
        invalid, utilization, counters = [], {}, {}
        for key in UTILIZATION:
            v = stats.get(key)
            valid = type(v) in (int, float) and math.isfinite(v) and 0 <= v <= 100
            utilization[key] = v if valid else None
            if key in stats and not valid:
                invalid.append(key)
        for key in COUNTERS:
            v = stats.get(key)
            valid = type(v) is int and v >= 0
            # Preserve integers exactly; units/rate/reset semantics unqualified.
            counters[key] = str(v) if valid else None
            if key in stats and not valid:
                invalid.append(key)
        identity = node.get('IORegistryEntryID')
        klass = node.get('IOObjectClass')
        accelerators.append({'registry_entry_id': str(identity) if type(identity) is int and identity >= 0 else None,
                             'registry_class': klass if isinstance(klass, str) and len(klass) <= 128 else None,
                             'reported_utilization_percent': utilization, 'reported_counters': counters,
                             'invalid_fields': invalid})
    return {'accelerators': accelerators, 'nodes_reported': len(nodes), 'truncated': len(nodes) > 4,
            'state': 'observed' if nodes else 'unavailable', 'reason': None if nodes else 'no_agx_accelerator'}


def observe():
    begin = time.monotonic_ns()
    try:
        value = extract(bounded_output(['/usr/sbin/ioreg', '-r', '-c', 'AGXAccelerator', '-a']))
    except (OSError, RuntimeError) as error:
        value = {'state': 'unavailable', 'reason': str(error) if isinstance(error, RuntimeError) else 'command_unavailable',
                 'accelerators': [], 'nodes_reported': None, 'truncated': None}
    return {'schema': 'passive-gpu-observation/v1', 'pid': os.getpid(),
            'timestamp': datetime.now(timezone.utc).isoformat(), 'observer_begin_monotonic_ns': str(begin),
            'observer_end_monotonic_ns': str(time.monotonic_ns()), **value,
            'qualification': 'Host-wide reported registry fields, not calibrated GPU work, encoder occupancy, recorder cost or capacity. Counter units/reset/rate unknown; observer clock is not capture clock.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seconds', type=float, required=True)
    parser.add_argument('--interval-ms', type=int, default=1000)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not math.isfinite(args.seconds) or not 1 <= args.seconds <= 600 or not 1000 <= args.interval_ms <= 10000 or not args.output.is_absolute():
        parser.error('Use1–600 seconds,1000–10000ms interval and an absolute fresh output directory')
    args.output.mkdir(mode=0o700, exist_ok=False)
    interrupted = False
    def stop(_signal, _frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, stop)
    begin = time.monotonic_ns()
    cpu_begin = cpu_seconds()
    until = begin + round(args.seconds * 1e9)
    samples, unavailable = 0, 0
    print(json.dumps({'state': 'sampling', 'pid': os.getpid(), 'output': str(args.output)}), flush=True)
    try:
        with os.fdopen(os.open(args.output/'samples.jsonl', os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600), 'w') as file:
            while time.monotonic_ns() < until:
                value = observe()
                file.write(json.dumps(value, allow_nan=False)+'\n'); file.flush()
                samples += 1
                unavailable += value['state'] != 'observed'
                remaining = (until-time.monotonic_ns()) / 1e9
                if remaining > 0:
                    time.sleep(min(args.interval_ms/1000, remaining))
    except KeyboardInterrupt:
        interrupted = True
    finally:
        cpu_end = cpu_seconds()
        result = {'schema': 'passive-gpu-observer-result/v1', 'pid': os.getpid(), 'state': 'terminal',
                  'samples': samples, 'unavailable_samples': unavailable, 'interrupted': interrupted,
                  'duration_s': (time.monotonic_ns()-begin)/1e9, 'max_registry_bytes': MAX_BYTES,
                  'query_deadline_s': 2, 'max_accelerators': 4, 'roots_or_permissions_requested': False,
                  'cpu_seconds': {key: max(0, cpu_end[key]-cpu_begin[key]) for key in cpu_begin},
                  'cpu_scope': 'Observer and its reaped ioreg children only; excludes WindowServer, kernel/device work and other host processes. Earlier results without this field have unknown child CPU.',
                  'qualification': 'Passive host observations only; missing fields are null, not zero. No recorder attribution, calibrated averaging window, guard threshold or P80/capacity proof.'}
        with os.fdopen(os.open(args.output/'result.json', os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600), 'w') as file:
            json.dump(result, file, indent=2)
        print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
