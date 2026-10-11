#!/usr/bin/env python3
"""Durable, serialized simulator qualification jobs; never operates a phone."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parent
SIMULATOR = '8F5D9771-2224-482D-8A96-C0315640BA9C'
NAME = 'Kickoff iOS POC'
LOCK_ROOT = Path.home() / 'Library/Application Support/ios-agent/qualification-locks'
SCOPE = 'compiled synthetic UIKit simulator only; not physical iOS, React Native, browser, IME or off-LAN proof'


def write(file, data):
    temp = file.with_suffix('.next')
    with os.fdopen(os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as stream:
        json.dump(data, stream, indent=2)
    temp.replace(file)


def private_base(state):
    base = state / 'qualification-jobs'
    base.mkdir(parents=True, exist_ok=True, mode=0o700)
    if base.is_symlink() or base.stat().st_mode & 0o077:
        raise RuntimeError('private_job_directory_required')
    return base


def inventory():
    data = json.loads(subprocess.check_output(['/usr/bin/xcrun', 'simctl', 'list', 'devices', 'available', '-j'], timeout=15))
    return next((d for group in data['devices'].values() for d in group if d['udid'] == SIMULATOR), None)


def plan():
    return {'ok': True, 'recipe': 'native-input-matrix', 'scope': SCOPE,
            'simulator': SIMULATOR, 'steps': ['start once', 'poll status with returned jobId', 'require completed, passed and cleanupVerified'],
            'coverage': ['touch callbacks', 'gesture competition and cancellation', 'text responders', 'occlusion and stale targets', 'lease expiry and glow fidelity', 'idle-timer restoration'],
            'cleanup': 'Removes only its fixture and restores the initial simulator boot state. Jobs survive MCP reconnect for cleanup; no phone lease, network changes or XCTest.',
            'limits': ['No periodic execution.', 'No arbitrary simulator, command or output path.', 'Do not start again after an uncertain response; inspect jobs first.']}


def status(base, job_id=None):
    if job_id is None:
        jobs = sorted(base.glob('*/request.json'), key=lambda p: p.stat().st_mtime, reverse=True)[:10]
        return {'ok': True, 'jobs': [status(base, p.parent.name) for p in jobs], 'scope': SCOPE}
    if not re.fullmatch('[a-f0-9]{32}', job_id):
        raise RuntimeError('invalid_job_id')
    folder = base / job_id
    if folder.is_symlink() or not (folder / 'request.json').is_file():
        return {'ok': False, 'reason': 'job_not_found', 'jobId': job_id}
    request = json.loads((folder / 'request.json').read_text())
    if (folder / 'result.json').exists():
        return json.loads((folder / 'result.json').read_text())
    pid = request.get('workerPid')
    try:
        command = subprocess.check_output(['/bin/ps', '-p', str(pid), '-o', 'command='], text=True, timeout=3).strip()
        alive = str(ROOT / 'fixture_jobs.py') in command and '--worker' in command and job_id in command
    except (subprocess.SubprocessError, OSError):
        alive = False
    return {'ok': alive, 'jobId': job_id, 'state': 'running' if alive else 'unconfirmed',
            'scope': SCOPE, 'startedAt': request['startedAt'], 'cleanupVerified': False,
            'next': 'Poll this job; never replay start.' if alive else 'Worker is not confirmed live; inspect private job artifacts and simulator before a new start.'}


def start(base):
    # The lock is common across custom MCP state roots, like the fixed simulator.
    lock_root = LOCK_ROOT
    lock_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock = os.open(lock_root / 'native-input.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'ok': False, 'reason': 'fixture_job_already_running', 'actionSent': False, 'next': 'Inspect status; do not launch a second runner.'}
        device = inventory()
        if not device or device['name'] != NAME or device['state'] not in ('Shutdown', 'Booted'):
            return {'ok': False, 'reason': 'dedicated_simulator_unavailable', 'actionSent': False}
        job_id = uuid.uuid4().hex
        folder = base / job_id
        folder.mkdir(mode=0o700)
        request = {'jobId': job_id, 'startedAt': time.time(), 'initialState': device['state'], 'simulator': SIMULATOR}
        write(folder / 'request.json', request)
        with (folder / 'worker.log').open('xb') as log:
            child = subprocess.Popen([sys.executable, '-B', str(ROOT / 'fixture_jobs.py'), '--state', str(base.parent), '--worker', job_id, '--lock-fd', str(lock)],
                                     stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True, pass_fds=(lock,))
        request['workerPid'] = child.pid
        write(folder / 'request.json', request)
        # The worker retains the flock until cleanup and its terminal receipt.
        return {'ok': True, 'jobId': job_id, 'state': 'started', 'scope': SCOPE, 'replay': False,
                'next': 'Poll status with this jobId. This is an isolated simulator job; keep using the phone normally.'}
    finally:
        os.close(lock)


def work(base, job_id, lock_fd):
    folder = base / job_id
    request = json.loads((folder / 'request.json').read_text())
    child = None
    def stop(_signum, _frame):
        if child and child.poll() is None:
            child.send_signal(signal.SIGINT)  # Python finally verifies fixture uninstall/shutdown.
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    result = {'ok': False, 'jobId': job_id, 'state': 'failed', 'passed': False, 'cleanupVerified': False, 'scope': SCOPE}
    try:
        with (folder / 'runner.log').open('xb') as log:
            child = subprocess.Popen([sys.executable, '-B', str(ROOT / 'tests/run_fixture.py'), '--simulator', SIMULATOR, '--output', str(folder / 'evidence.json'), '--lock-fd', str(lock_fd)], stdin=subprocess.DEVNULL, stdout=log, stderr=log, pass_fds=(lock_fd,))
            try:
                code = child.wait(timeout=600)
            except subprocess.TimeoutExpired:
                child.send_signal(signal.SIGINT)
                # Do not declare terminal or drop the lock while cleanup is live.
                code = child.wait()
        evidence = json.loads((folder / 'evidence.json').read_text()) if (folder / 'evidence.json').exists() else {}
        device = inventory()
        cleanup = code == 0 and device is not None and device['state'] == request['initialState']
        gates = evidence.get('gates', {})
        passed = bool(gates) and all(x is True for x in gates.values()) and evidence.get('passed') is True and cleanup
        result.update(ok=passed, state='completed' if passed else 'failed', passed=passed, exitCode=code,
                      cleanupVerified=cleanup, gateCount=len(gates), failedGates=[k for k,v in gates.items() if v is not True],
                      sourceChangedDuringRun=evidence.get('sourceChangedDuringRun'), sourceHashes=evidence.get('sourceHashes', {}),
                      fixtureExecutableHash=evidence.get('fixtureExecutableHash'), restoredState=device['state'] if device else None)
    except Exception as error:
        result['reason'] = type(error).__name__  # Details stay in private logs.
    finally:
        result['finishedAt'] = time.time()
        write(folder / 'result.json', result)
        os.close(lock_fd)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--worker')
    parser.add_argument('--lock-fd', type=int)
    args = parser.parse_args()
    base = private_base(args.state)
    if args.worker:
        work(base, args.worker, args.lock_fd)
        return
    query = json.load(sys.stdin)
    action = query.get('action', 'plan')
    try:
        if action == 'plan': result = plan()
        elif action == 'status': result = status(base, query.get('jobId'))
        elif action == 'start': result = start(base)
        else: result = {'ok': False, 'reason': 'fixed_action_required'}
    except Exception as error:
        result = {'ok': False, 'reason': type(error).__name__, 'actionSent': False}
    print(json.dumps(result))


if __name__ == '__main__':
    main()
