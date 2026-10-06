#!/usr/bin/python3
"""Fixed notification click: sanitized incident dispatch + independent auth wake.

No broker signals, credential reads, raw error/log forwarding, or replay after
an ambiguous dispatch. The flock covers concurrent and double notification clicks.
"""
import fcntl
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path.home() / 'dotfiles'
CACHE = Path.home() / 'Library/Caches/com.taylor.op-keepalive'
SUCCESS = {'ok', 'ok_queued', 'ok_prompted'}
STATUSES = SUCCESS | {'prompt_timeout', 'broker_unavailable', 'error'}


def read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def save(path, data):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.' + str(os.getpid()) + '.tmp')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as out:
        json.dump(data, out)
        out.flush()
        os.fsync(out.fileno())
    os.replace(tmp, path)


def valid_uuid(value):
    try:
        return str(uuid.UUID(value))
    except (ValueError, TypeError, AttributeError):
        return None


def safe_epoch(value):
    try:
        try:
            parsed = datetime.datetime.fromisoformat(value)
        except ValueError:
            # The hosted system Python rejects compact offsets emitted by now().
            parsed = datetime.datetime.strptime(value, '%Y-%m-%dT%H:%M:%S%z')
        if parsed.tzinfo is None:
            return None
        stamp = parsed.timestamp()
        return int(stamp) if 0 <= stamp <= time.time() + 60 else None
    except (ValueError, TypeError, OverflowError):
        return None


def diagnostics():
    state = read_json(CACHE / 'state.json')
    broker = read_json(Path.home() / 'Library/Caches/com.taylor.op-agent/status.json')
    alive = False
    try:
        os.kill(int(broker['pid']), 0)
        alive = True
    except (OSError, ValueError, KeyError, TypeError):
        pass
    accounts = []
    for i, acct in enumerate(state.get('accounts', [])[:8]):
        accounts.append({'slot': i, 'status': acct.get('last_status') if acct.get('last_status') in STATUSES else 'unknown', 'last_ok': safe_epoch(acct.get('last_ok')), 'last_prompt': safe_epoch(acct.get('last_prompt'))})
    locked = state.get('app_locked') if type(state.get('app_locked')) is bool else None
    console = state.get('console_locked') if type(state.get('console_locked')) is bool else None
    try:
        age = max(0, int(time.time() - (CACHE / 'state.json').stat().st_mtime))
    except OSError:
        age = None
    kind = 'broker_unavailable' if not alive else ('watchdog_stale' if age is None or age > 180 else
           'app_locked' if locked else 'authorization_or_unknown')
    # No caller argv/cwd, vault/account names, arbitrary detail/error strings.
    return {'broker_alive': alive, 'keepalive_age_seconds': age, 'app_locked': locked,
            'episode': valid_uuid(state.get('fault_episode')) or hashlib.sha256(json.dumps([kind, [a['last_ok'] for a in accounts]]).encode()).hexdigest(),
            'console_locked': console, 'kind': kind, 'accounts': accounts}


def kick(request_id):
    # Persist before opening the app, even when open fails. The approved child
    # consumes it, resets backoff, waits for unlock and performs metadata calls.
    save(CACHE / 'recovery-request.json', {'id': request_id, 'at': time.time()})
    try:
        result = subprocess.run(['/usr/bin/open', '-b', 'com.1password.1password'],
                                capture_output=True, timeout=10)
        return {'retry_requested': True, 'app_open_accepted': result.returncode == 0}
    except (OSError, subprocess.TimeoutExpired):
        return {'retry_requested': True, 'app_open_accepted': False}


def dispatch(evidence, incident):
    node = subprocess.run(['/bin/sh', str(ROOT / 'src/lib/resolve-binary.sh'), 'node'],
                          capture_output=True, text=True, timeout=5, check=True).stdout.strip()
    # State is owned by dispatch.mjs; stdin carries only our bounded allowlist.
    proc = subprocess.run([node, str(ROOT / 'src/onepassword/recovery-dispatch.mjs'), str(incident)],
                          input=json.dumps(evidence), capture_output=True, text=True, timeout=75,
                          env={'HOME': str(Path.home()), 'PATH': '/opt/homebrew/bin:/usr/bin:/bin'})
    if proc.returncode:
        return 'unavailable_or_uncertain'
    result = json.loads(proc.stdout)
    return result['status'] if result.get('status') in {
        'queued', 'started', 'already_dispatched', 'uncertain', 'unavailable', 'claude_submitted'} else 'uncertain'


def request_wake():
    """One independent wake per click burst, even during automatic dispatch."""
    fd = os.open(CACHE / 'wake.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 'wake_in_progress'
        previous = read_json(CACHE / 'wake-result.json')
        if 0 <= time.time() - previous.get('at', 0) < 30:
            return previous.get('kick', 'unconfirmed')
        request_id = str(uuid.uuid4())
        save(CACHE / 'wake-result.json', {'at': time.time(), 'kick': 'unconfirmed'})
        worker = subprocess.Popen(['/usr/bin/python3', '-B', str(Path(__file__).resolve()),
                                   '--kick', request_id], stdin=subprocess.DEVNULL,
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                  start_new_session=True)
        try:
            output, _ = worker.communicate(timeout=12)
            wake = json.loads(output)
            result = {k: wake.get(k) is True for k in ('retry_requested', 'app_open_accepted')}
        except (subprocess.TimeoutExpired, ValueError, TypeError):
            result = 'unconfirmed'
        save(CACHE / 'wake-result.json', {'at': time.time(), 'kick': result})
        return result


def recover(automatic=False):
    CACHE.mkdir(mode=0o700, parents=True, exist_ok=True)
    # A user's click must still wake auth while an automatic dispatch holds its
    # own lock. Automatic diagnosis never adds a competing authorization retry.
    evidence = diagnostics()
    try:
        wake = 'not_requested' if automatic else request_wake()
    except OSError:
        wake = 'unconfirmed'
    fd = os.open(CACHE / 'recovery.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'dispatch': 'click_in_progress', 'kick': wake}
        result = {'at': int(time.time()), 'request_id': str(uuid.uuid4()), 'kick': wake}
        try:
            result['dispatch'] = dispatch(evidence, CACHE / 'repair-incident.json')
        except Exception:
            result['dispatch'] = 'unavailable_or_uncertain'
        save(CACHE / 'recovery-result.json', result)
        return result


if __name__ == '__main__':
    import sys
    os.umask(0o077)
    if len(sys.argv) == 3 and sys.argv[1] == '--kick':
        print(json.dumps(kick(str(uuid.UUID(sys.argv[2])))))
    else:
        print(json.dumps(recover(automatic=sys.argv[1:] == ['--automatic'])))
