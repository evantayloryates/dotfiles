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
import shlex
import re

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


def episode_id(value):
    return isinstance(value, str) and (valid_uuid(value) is not None or re.fullmatch(r'[0-9a-f]{64}', value) is not None)


def release_authorized(episode):
    row = read_json(CACHE / 'notification.json')
    return episode_id(episode) and row.get('episode') == episode and bool(row.get('clicked_at'))


def notify_if_due(evidence, reminder=False):
    """One alert per episode, repeated hourly until the first release click."""
    CACHE.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(CACHE / 'notification.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return False
        row = read_json(CACHE / 'notification.json')
        if reminder:
            if not row or row.get('clicked_at'):
                return False
            receipt = read_json(CACHE / 'repair-incident.json')
            if receipt.get('episode') == row.get('episode') and receipt.get('incidentDir'):
                report = read_json(Path(receipt['incidentDir']) / 'settled.json')
                if report.get('outcome') == 'no_change':
                    row['completed_without_change'] = True
                    row['clicked_at'] = None
                    row['last_attempt'] = time.time()
                    save(CACHE / 'notification.json', row)
                    return False
            evidence = row.get('evidence', {})
        episode = evidence.get('episode')
        if not episode_id(episode):
            return False
        if row.get('episode') == episode:
            if row.get('clicked_at') or row.get('completed_without_change') or time.time() - row.get('last_attempt', 0) < 3600:
                return False
        else:
            row = {'episode': episode, 'evidence': evidence, 'clicked_at': None, 'created_at': time.time()}
        row['last_attempt'] = time.time()
        save(CACHE / 'notification.json', row) # Failure is bounded to one attempt/hour.
        helper = Path.home() / '.codex/skills/notify-macos/scripts/notify.py'
        action = shlex.join(['/usr/bin/python3', '-B', str(ROOT / 'src/onepassword/recovery.py'), '--click', episode])
        try:
            result = subprocess.run(['/usr/bin/python3', str(helper), '--backend', 'terminal-notifier',
                '--title', '1Password repair' if not reminder else '1Password repair — reminder',
                '--message', 'Diagnosis starts automatically. Click once to release a verified fix and open 1Password. No second fix approval.',
                '--group', 'op-broker-recovery', '--execute', action],
                env={'HOME': str(Path.home()), 'PATH': '/opt/homebrew/bin:/usr/bin:/bin'},
                capture_output=True, timeout=25)
            if result.returncode == 0:
                row['notified_at'] = time.time()
                save(CACHE / 'notification.json', row)
                return True
        except (OSError, subprocess.TimeoutExpired):
            pass
        return False


def recover(automatic=False, click_episode=None):
    CACHE.mkdir(mode=0o700, parents=True, exist_ok=True)
    evidence = diagnostics()
    if automatic:
        receipt = read_json(CACHE / 'repair-incident.json')
        if receipt.get('incidentDir') and episode_id(receipt.get('episode')):
            # New auth observations belong to the same pending repair until it
            # settles; they must not invalidate its original release click.
            if not (Path(receipt['incidentDir']) / 'settled.json').exists():
                evidence['observedEpisode'] = evidence['episode']
                evidence['episode'] = receipt['episode']
        notify_if_due(evidence)
    else:
        # A stale banner cannot release a different incident's fix.
        fd = os.open(CACHE / 'notification.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            pending = read_json(CACHE / 'notification.json')
            target = click_episode or pending.get('episode') # migration of old fixed click commands
            if not episode_id(target) or pending.get('episode') != target:
                return {'dispatch': 'stale_notification', 'kick': 'not_requested'}
            pending['clicked_at'] = pending.get('clicked_at') or time.time()
            save(CACHE / 'notification.json', pending)
            evidence['episode'] = target
    evidence['releaseAuthorized'] = release_authorized(evidence['episode'])
    try:
        wake = 'not_requested' if automatic else request_wake()
    except OSError:
        wake = 'unconfirmed'
    fd = os.open(CACHE / 'recovery.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        try:
            # A release click waits for bounded automatic preparation dispatch;
            # otherwise that click would be lost without a follow-up turn.
            fcntl.flock(lock, fcntl.LOCK_EX | (fcntl.LOCK_NB if automatic else 0))
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
    elif sys.argv[1:] == ['--remind']:
        print(json.dumps({'notified': notify_if_due({}, reminder=True)}))
    elif len(sys.argv) == 3 and sys.argv[1] == '--gate':
        print(json.dumps({'releaseAuthorized': release_authorized(sys.argv[2])}))
    elif len(sys.argv) == 3 and sys.argv[1] == '--click':
        print(json.dumps(recover(click_episode=sys.argv[2])))
    else:
        print(json.dumps(recover(automatic=sys.argv[1:] == ['--automatic'])))
