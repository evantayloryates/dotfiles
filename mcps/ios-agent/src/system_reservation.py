"""Explicit bounded XCTest lifetime, separate from exclusive input ownership.

A reservation grants no input authority. Existing runners are never adopted.
The retained runner checks its own absolute deadline and explicit stop marker.
"""
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import time

MAX_SECONDS = 10 * 60 * 60


def directory(state):
    root = Path(state).resolve() / 'system-reservations'
    root.mkdir(mode=0o700, exist_ok=True)
    if root.is_symlink() or root.stat().st_mode & 0o077:
        raise ValueError('private_reservation_directory_required')
    return root


def read_record(file):
    file = Path(file)
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077 or info.st_size > 8192:
            raise ValueError('private_reservation_required')
        r = json.load(stream)
    if not isinstance(r, dict) or r.get('version') != 1 or not re.fullmatch('[a-f0-9]{32}', r.get('id', '')):
        raise ValueError('invalid_reservation')
    if not all(type(r.get(k)) in (int, float) for k in ('createdAt', 'expiresAt')) or not 1 <= r['expiresAt'] - r['createdAt'] <= MAX_SECONDS:
        raise ValueError('bounded_reservation_required')
    return r


def write_record(file, r):
    file = Path(file)
    temporary = file.with_name(file.name + '.' + secrets.token_hex(6) + '.tmp')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(r, stream)
    os.replace(temporary, file)


def live(r, now=None):
    now = time.time() if now is None else now
    if r.get('active') is not True or now < r['createdAt'] or now >= r['expiresAt']:
        return False
    if type(r.get('pid')) is not int or r['pid'] <= 0:
        return False
    try:
        os.kill(r['pid'], 0)
    except OSError:
        return False
    return True


def owned(r):
    file = Path(r['reservationFile'])
    record = read_record(file)
    return record['id'] == r['reservationId'] and record.get('pid') == os.getpid() and live(record) and not file.with_suffix('.stop').exists()


def public(r):
    return {k: r[k] for k in ('id', 'phase', 'createdAt', 'expiresAt', 'runnerStopped', 'reason', 'ready', 'startupGate') if k in r} | {
        'active': live(r), 'inputAuthority': False, 'indicator': 'Apple Automation Running while retained',
        'acrossTurnRetention': True, 'offLANStartQualified': False,
    }


def existing(state):
    root = directory(state)
    marker = root / 'current.json'
    if not marker.exists():
        return None
    record = read_record(marker)
    file = root / (record['id'] + '.json')
    actual = read_record(file)
    if actual['id'] != record['id']:
        raise ValueError('reservation_identity_changed')
    return actual


def start(r):
    import socket
    from system_runner import validate, input_owned as initial_owned
    state = Path(r['state']).resolve()
    seconds = r.get('durationSeconds', 1800)
    if type(seconds) is not int or not 1 <= seconds <= MAX_SECONDS:
        raise ValueError('bounded_reservation_required')
    old = existing(state)
    if old and (live(old) or old.get('runnerStopped') is not True):
        raise ValueError('existing_reservation_preserved')
    validate(r)
    if not initial_owned(r):
        raise ValueError('system_owner_inactive')
    config = json.loads((state / 'system-driver.json').read_text())
    address = config['address']
    parts = address.split('.')
    if len(parts) != 4 or not all(x.isdigit() and str(int(x)) == x and 0 <= int(x) <= 255 for x in parts) or int(parts[0]) != 100 or not 64 <= int(parts[1]) <= 127:
        raise ValueError('configured_tailnet_address_required')
    probe = socket.socket(); probe.settimeout(1.5)
    try:
        code = probe.connect_ex((address, 8100))
    finally:
        probe.close()
    import errno
    if code == 0:
        raise ValueError('existing_system_runner_preserved')
    if code != errno.ECONNREFUSED:
        raise ValueError('system_endpoint_reachability_unconfirmed')
    root = directory(state); identity = secrets.token_hex(16)
    record = {'version': 1, 'id': identity, 'createdAt': time.time(), 'phase': 'requested', 'active': True, 'ready': False, 'pid': 0}
    record['expiresAt'] = record['createdAt'] + seconds
    file = root / (identity + '.json')
    write_record(file, record); write_record(root / 'current.json', record)
    request = dict(r, reservationFile=str(file), reservationId=identity)
    try:
        child = subprocess.Popen([str(state / 'providers/pymobiledevice3-11.15.5/bin/python'), '-B', str(Path(__file__).with_name('system_runner.py')), json.dumps(request)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError:
        record.update(phase='stopped',active=False,ready=False,runnerStopped=True,reason='worker_not_started')
        write_record(file,record)
        raise ValueError('reservation_worker_not_started')
    deadline = time.monotonic() + 50
    while time.monotonic() < deadline:
        record = read_record(file)
        if record.get('ready') or record.get('phase') == 'stopped' or child.poll() is not None:
            break
        time.sleep(.25)
    return {'ok': record.get('ready') is True and live(record), 'reservation': public(record), 'replay': False,
            'next': 'No input lease is retained. Normal native/browser sessions can run; system fallback attaches only after acquiring the shared input owner. End or expire this reservation to stop the Apple indicator.'}


def stop(r):
    record = existing(r['state'])
    if not record or record['id'] != r.get('reservationId'):
        raise ValueError('matching_reservation_required')
    from system_runner import input_owned as initial_owned
    if not initial_owned(r):
        raise ValueError('system_owner_inactive')
    file = directory(r['state']) / (record['id'] + '.json')
    marker = file.with_suffix('.stop')
    try:
        fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        os.close(fd)
    except FileExistsError:
        pass
    deadline = time.monotonic() + 38
    while time.monotonic() < deadline:
        record = read_record(file)
        if record.get('phase') == 'stopped':
            break
        if not live(record):
            # A dead worker without independent runner cleanup is unconfirmed.
            break
        time.sleep(.25)
    return {'ok': record.get('runnerStopped') is True, 'reservation': public(record), 'replay': False}


def main():
    r = json.loads(sys.stdin.read(16000)); op = r.get('op')
    if op in ('start', 'stop'):
        import fcntl
        lock = directory(r['state']) / 'operation.lock'
        fd = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = start(r) if op == 'start' else stop(r)
        finally:
            os.close(fd)
    elif op == 'status':
        record = existing(r['state'])
        result = {'ok': True, 'reservation': public(record) if record else None}
    else:
        raise ValueError('fixed_reservation_operation_required')
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        allowed = {'private_reservation_directory_required', 'private_reservation_required', 'invalid_reservation', 'bounded_reservation_required', 'existing_reservation_preserved', 'system_owner_inactive', 'configured_tailnet_address_required', 'existing_system_runner_preserved', 'system_endpoint_reachability_unconfirmed', 'matching_reservation_required', 'fixed_reservation_operation_required', 'reservation_worker_not_started'}
        print(json.dumps({'ok': False, 'reason': str(error) if isinstance(error, ValueError) and str(error) in allowed else 'reservation_unconfirmed', 'replay': False}))
        sys.exit(1)
