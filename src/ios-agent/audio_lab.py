#!/usr/bin/env python3
"""On-demand per-user receiver, isolated from the3043 guidance gateway."""
import fcntl
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys
import time
from urllib.request import urlopen
from urllib.parse import urlparse

STATE = Path.home() / 'Library/Application Support/ios-agent'
LABEL = 'com.taylor.ios-audio-lab'
DOMAIN = f'gui/{os.getuid()}'
TARGET = Path.home() / 'Library/LaunchAgents' / f'{LABEL}.plist'
JOB = f'{DOMAIN}/{LABEL}'

def command(*args):
    return subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10)

def job_pid():
    r = command('launchctl', 'print', JOB)
    match = re.search(rb'\n\s*pid = ([0-9]+)', r.stdout) if r.returncode == 0 else None
    return r.returncode == 0, int(match[1]) if match else None

def health():
    try:
        with urlopen('http://127.0.0.1:3044/audio-lab/health', timeout=1) as r:
            data = json.load(r)
        return data if data.get('service') == 'ios-audio-lab-v1' else None
    except Exception:
        return None

def configuration():
    runtime = json.loads((STATE / 'dev-runtime.json').read_text())
    checkout = Path(runtime['mobile']).resolve().parent
    if checkout != Path('/Users/taylor/src/github/kickoff').resolve():
        raise RuntimeError('configured_checkout_required')
    branch = command('git', '-C', str(checkout), 'branch', '--show-current')
    if branch.returncode or branch.stdout.strip() != b'ety/local-dev-foundation':
        raise RuntimeError('local_dev_foundation_branch_required')
    url = urlparse(runtime['webURL'])
    if url.scheme != 'https' or not url.hostname or not url.hostname.endswith('.ts.net') or url.port != 10446 or url.username or url.query:
        raise RuntimeError('configured_private_web_origin_required')
    python = STATE / 'providers/transport-lab/bin/python'
    source = checkout / 'dev-tools/call-rig/transport-lab/server.py'
    if not python.is_file() or not source.is_file():
        raise RuntimeError('pinned_receiver_dependency_or_source_missing')
    work = STATE / 'audio-lab'
    work.mkdir(mode=0o700, exist_ok=True)
    os.chmod(work, 0o700)
    for name in ['stdout.log', 'stderr.log']:
        file = work / name
        file.touch(mode=0o600, exist_ok=True)
        os.chmod(file, 0o600)
    return {'Label': LABEL, 'ProgramArguments': [str(python), '-B', str(source)],
        'WorkingDirectory': str(checkout), 'EnvironmentVariables': {
            'CALL_RIG_PRIVATE_ORIGIN': f'https://{url.hostname}:10520',
            'PYTHONUNBUFFERED': '1'}, 'RunAtLoad': False, 'KeepAlive': False,
        'StandardOutPath': str(work / 'stdout.log'), 'StandardErrorPath': str(work / 'stderr.log')}

def main(action):
    desired = configuration()
    registered, pid = job_pid()
    current = health()
    same = TARGET.is_file() and plistlib.loads(TARGET.read_bytes()) == desired
    if action == 'status':
        owned = same and pid is not None and current is not None and current.get('pid') == pid
        return {'ok': owned, 'registered': registered, 'running': owned,
            'active': current.get('active') if owned else None,
            'peerConnections': current.get('peerConnections') if owned else None,
            'reason': 'ready' if owned else 'receiver_not_running_or_not_owned'}
    if registered and not same:
        raise RuntimeError('existing_launch_configuration_differs')
    if current is not None and (pid is None or current.get('pid') != pid):
        raise RuntimeError('receiver_port_owned_by_other_process')
    if action == 'stop':
        if pid is None:
            return {'ok': True, 'alreadyStopped': True}
        if current is None or current.get('pid') != pid or current.get('active') != 0 or current.get('peerConnections') != 0:
            raise RuntimeError('receiver_idle_ownership_unconfirmed')
        if command('launchctl', 'kill', 'SIGTERM', JOB).returncode:
            raise RuntimeError('receiver_stop_not_accepted')
    else:
        if pid is not None and current is not None:
            return {'ok': True, 'alreadyRunning': True, 'active': current['active']}
        if not registered:
            TARGET.parent.mkdir(parents=True, exist_ok=True)
            TARGET.write_bytes(plistlib.dumps(desired))
            if command('launchctl', 'bootstrap', DOMAIN, str(TARGET)).returncode:
                raise RuntimeError('receiver_registration_failed')
        if command('launchctl', 'kickstart', JOB).returncode:
            raise RuntimeError('receiver_start_not_accepted')
    deadline = time.monotonic() + (55 if action == 'start' else 8)
    while time.monotonic() < deadline:
        _, pid = job_pid()
        current = health()
        if action == 'start' and pid is not None and current is not None and current.get('pid') == pid:
            return {'ok': True, 'running': True, 'active': current['active'], 'peerConnections': current['peerConnections']}
        if action == 'stop' and pid is None and current is None:
            return {'ok': True, 'running': False, 'idleVerified': True}
        time.sleep(.15)
    raise RuntimeError('receiver_transition_unconfirmed_no_replay')

if __name__ == '__main__':
    os.umask(0o077)
    action = sys.argv[1] if len(sys.argv) == 2 else ''
    if action not in {'start', 'status', 'stop'}:
        print(json.dumps({'ok': False, 'reason': 'use_start_status_or_stop'}));sys.exit(2)
    STATE.mkdir(mode=0o700, exist_ok=True)
    with (STATE / 'audio-lab-control.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            result = main(action)
        except Exception as error:
            allowed = {'configured_checkout_required', 'local_dev_foundation_branch_required', 'configured_private_web_origin_required', 'pinned_receiver_dependency_or_source_missing', 'existing_launch_configuration_differs', 'receiver_port_owned_by_other_process', 'receiver_idle_ownership_unconfirmed', 'receiver_stop_not_accepted', 'receiver_registration_failed', 'receiver_start_not_accepted', 'receiver_transition_unconfirmed_no_replay'}
            result = {'ok': False, 'reason': str(error) if str(error) in allowed else 'receiver_operation_failed'}
        print(json.dumps(result))
        sys.exit(0 if result.get('ok') else 1)
