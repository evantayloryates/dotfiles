"""Compact private iOS-agent host signals. Logging is always best effort."""
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
import json
import os
import re
import secrets
import stat
import time
import hashlib

ROOT = Path(os.environ.get('IOS_AGENT_SIGNAL_STATE_DIR') or Path.home() / 'Library/Application Support/ios-agent')
DIR = ROOT / 'signals'
FILE_BYTES = 128 * 1024
TOTAL_BYTES = 2 * 1024 * 1024
MAX_FILES = 256
MAX_AGE = 7 * 86400
ROTATE_AGE = 86400
IDS = {'connectionId', 'traceId', 'requestId', 'sessionId', 'ownerId', 'pageId', 'buildId', 'bootId', 'epoch', 'backendEpoch', 'clientEpoch', 'sourceHash', 'leaseFingerprint', 'sourceStream', 'documentId', 'observedDocumentId', 'frameLoaderId'}
ALIASES = {'operation':'op', 'document':'documentId', 'observedDocument':'observedDocumentId', 'frameLoader':'frameLoaderId', 'receiverFailure':'errorCode', 'windowMs':'durationMs', 'droppedEvents':'dropCount', 'trace':'traceId', 'request':'requestId', 'session':'sessionId', 'owner':'ownerId', 'page':'pageId', 'build':'buildId', 'boot':'bootId', 'source':'stage', 'sourceStreamId':'sourceStream', 'sourceBootId':'bootId', 'attempts':'attemptCount', 'routeName':'route', 'previousRouteName':'previousRoute', 'operationName':'op', 'errorCount':'count'}
WORDS = {'tool', 'action', 'op', 'kind', 'surface', 'transport', 'provider', 'strategy', 'stage', 'phase', 'state', 'fromState', 'toState', 'outcome', 'reason', 'code', 'version', 'errorName', 'errorCode', 'route', 'previousRoute'}
NUMERIC = {'durationMs', 'count', 'participants', 'sent', 'received', 'drops', 'gaps', 'attemptCount', 'retryCount', 'acceptedCount', 'failedCount', 'frameCount', 'signalCount', 'dropCount', 'droppedCount', 'truncatedCount', 'sourceAtMs', 'sourceSeq', 'bytes', 'domainCount', 'eventCount', 'cleanupFailures', 'nodeCount', 'edgeCount', 'workerCount', 'workersInitialized'}
BOOLEANS = {'dispatched', 'inputSent', 'verified', 'released', 'ready', 'truncated', 'present', 'enabled', 'muted', 'visible', 'pauseObserved', 'resumeConfirmed', 'breakpointRemoved', 'terminated'}
SCOPES = {'mcp', 'browser', 'host', 'native', 'kck-native', 'kck-web', 'kck-call'}
LEVELS = {'info', 'warn', 'error'}
_context = ContextVar('ios_signal_context', default={})
_current = None
_writes = 0


def _safe_dir():
    if not ROOT.is_absolute():
        return False
    try:
        if ROOT.is_symlink():
            return False
        DIR.mkdir(mode=0o700)
    except FileExistsError:
        pass
    except OSError:
        return False
    try:
        mode = DIR.lstat().st_mode
        return stat.S_ISDIR(mode) and not stat.S_ISLNK(mode) and mode & 0o077 == 0
    except OSError:
        return False


def _secret(value):
    return bool(re.search(r'(?:bearer\s+|basic\s+|api[_-]?key|password|passwd|secret|token|authorization|cookie|session[_-]?key|sk-[A-Za-z0-9])', value, re.I)
                or re.search(r'(?:[A-Za-z0-9_-]{16,}\.){2}[A-Za-z0-9_-]{16,}', value)
                or re.search(r'(?:data:[^,\s]+;base64,|[A-Za-z0-9+/]{64,}={0,2})', value))


def _scrub(value, limit=160):
    if not isinstance(value, str):
        return None
    if _secret(value):
        return '[redacted]'
    value = re.sub(r'(?:https?://|wss?://)[^\s)\]]+', '[url]', value, flags=re.I)
    value = re.sub(r'(?:[?&][A-Za-z0-9_-]+=[^\s&#]*)+', '[query]', value)
    value = re.sub(r'[\x00-\x1f\x7f]', ' ', value).strip()
    return value[:limit-13] + '…' + value[-12:] if len(value) > limit else value


def _safe_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,96}', value):
        return None
    if re.fullmatch(r'[a-f0-9]{64}', value):
        return value
    if _secret(value):
        return None
    if len(value) >= 48 and not re.fullmatch(r'[a-f0-9]{64}', value):
        return '[redacted]'
    return value


def _url_template(value):
    if not isinstance(value, str) or len(value) > 2048:
        return None
    if re.fullmatch(r'(relative|loopback|private|public):/[A-Za-z0-9_:/-]{0,110}', value):
        return value
    try:
        parsed = urlsplit(value)
        host = parsed.hostname or ''
        origin = ('relative' if not host else 'loopback' if host == 'localhost' or host.startswith('127.') or host == '::1'
                  else 'private' if host.startswith(('10.', '192.168.')) or re.match(r'172\.(1[6-9]|2[0-9]|3[01])\.', host)
                  else 'public')
        segments = [part if re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,23}', part) else ':id' if part else ''
                    for part in parsed.path.split('/')[:7]]
        return (origin + ':' + '/'.join(segments))[:120]
    except ValueError:
        return '[url]'


def _clean(fields):
    out = {}
    if not isinstance(fields, dict):
        return out
    for raw_key, value in fields.items():
        key = ALIASES.get(raw_key, raw_key)
        if raw_key in ('lease', 'leaseId'):
            if isinstance(value, str) and 0 < len(value) <= 256:
                out['leaseFingerprint'] = hashlib.sha256(value.encode()).hexdigest()[:12]
            continue
        if key == 'leaseFingerprint':
            if isinstance(value, str) and re.fullmatch(r'[a-f0-9]{12}', value):
                out[key] = value
            continue
        if key == 'statusCode':
            if type(value) is int and 100 <= value <= 599:
                out[key] = value
            continue
        if key in IDS:
            v = _safe_id(value)
        elif key in WORDS:
            v = value if key in ('reason', 'code', 'errorCode') and value in ('xctest_authorization_failed', 'xctest_authorization_timed_out') else _scrub(value, 80)
        elif key in NUMERIC:
            v = min(value, 1e15) if type(value) in (int, float) and 0 <= value < float('inf') else None
        elif key in BOOLEANS:
            v = value if type(value) is bool else None
        elif key in ('message', 'detail'):
            v = _scrub(value)
        elif key == 'stack':
            v = _scrub(value, 240)
        elif key == 'url':
            v = _url_template(value)
        else:
            continue
        if v is not None and v != '':
            out[key] = v
    return out


@contextmanager
def signal_context(**fields):
    token = _context.set({**_context.get(), **_clean(fields)})
    try:
        yield
    finally:
        _context.reset(token)


def signal_context_environment(base=None):
    """Forward only scrubbed correlation metadata to a Python/Node child."""
    return {**(os.environ if base is None else base), 'IOS_AGENT_SIGNAL_CONTEXT': json.dumps({**_inherited(), **_clean(_context.get())}, separators=(',', ':'))}


def current_signal_context():
    """Scrubbed current request context, including an async worker's override."""
    return {**_inherited(), **_clean(_context.get())}


def signal_context_from_environment():
    """Use as ``with signal_context(**signal_context_from_environment())``."""
    try:
        value = os.environ.get('IOS_AGENT_SIGNAL_CONTEXT', '')
        return _clean(json.loads(value)) if len(value) <= 1024 else {}
    except (ValueError, TypeError):
        return {}


def _inherited():
    return signal_context_from_environment()


def _files():
    if not _safe_dir():
        return []
    result = []
    for file in DIR.iterdir():
        if not re.fullmatch(r'signal-[a-f0-9]{16}-\d+\.jsonl', file.name):
            continue
        try:
            s = file.lstat()
            if stat.S_ISREG(s.st_mode) and s.st_mode & 0o077 == 0:
                result.append((file, s.st_size, s.st_mtime))
        except OSError:
            continue
    return sorted(result, key=lambda x: (x[2], x[0].name))


def _prune():
    global _current
    try:
        all_files = _files()
        total = sum(size for _, size, _ in all_files)
        count = len(all_files)
        for file, size, modified in all_files:
            if time.time() - modified <= MAX_AGE and total <= TOTAL_BYTES and count <= MAX_FILES:
                break
            if _current and file == _current[0] and time.time() - modified <= MAX_AGE:
                continue
            if _current and file == _current[0]:
                _current = None
            file.unlink()
            total -= size
            count -= 1
    except OSError:
        pass


def _target(size):
    global _current
    now = time.time()
    if _current and now - _current[2] < ROTATE_AGE and _current[1] + size <= FILE_BYTES:
        try:
            mode = _current[0].lstat().st_mode
            if stat.S_ISREG(mode) and not stat.S_ISLNK(mode) and mode & 0o077 == 0:
                return _current[0]
        except OSError:
            pass
        _current = None  # Another process may have pruned this idle writer.
    file = DIR / f'signal-{secrets.token_hex(8)}-{int(now * 1000)}.jsonl'
    fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    os.close(fd)
    _current = [file, 0, now]
    _prune()
    return file


def emit_signal(scope, event, **fields):
    global _writes, _current
    try:
        if scope not in SCOPES or not isinstance(event, str) or len(event) > 64 or not re.fullmatch(r'[a-z][a-z0-9_]*(?:[.-][a-z0-9_]+)*', event) or not _safe_dir():
            return False
        data = {**_inherited(), **_clean(_context.get()), **_clean(fields)}
        level = fields.get('level') if fields.get('level') in LEVELS else 'info'
        row = {'v': 1, 'time': datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
               'id': secrets.token_hex(8), 'scope': scope, 'event': event, 'level': level, **data}
        line = (json.dumps(row, separators=(',', ':'), ensure_ascii=False) + '\n').encode()
        for key in ('stack', 'detail', 'message', 'url', 'route', 'previousRoute', 'sourceHash', 'backendEpoch', 'clientEpoch', 'buildId', 'ownerId', 'pageId', 'bootId', 'version', 'provider', 'transport', 'surface', 'stage', 'phase'):
            if len(line) <= 1200:
                break
            row.pop(key, None)
            line = (json.dumps(row, separators=(',', ':'), ensure_ascii=False) + '\n').encode()
        if len(line) > 1200:
            return False
        file = _target(len(line))
        fd = os.open(file, os.O_WRONLY | os.O_APPEND | getattr(os, 'O_NOFOLLOW', 0))
        try:
            if os.write(fd, line) != len(line):
                return False
        finally:
            os.close(fd)
        _current[1] += len(line)
        _writes += 1
        if _writes % 32 == 0:
            _prune()
        return True
    except (OSError, ValueError, TypeError):
        _current = None
        return False
