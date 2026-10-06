#!/usr/bin/env python3
"""notify-curator: show only the Claude desktop notifications Taylor wants.

The Claude app posts its own "agent lifecycle" notifications (Claude archived /
cleared / stopped / unarchived / changed the effort for ...) with no setting to
turn them off, and it posts turn-complete notifications for automation
sessions (claude-driver pool recycles, broker, pressure probes). This daemon
lets the app keep deciding *when* to notify (it already skips the session
being viewed, self-resume wakeups, scheduled-task sessions and so on) and
re-shows only what matters:

  1. Claude's alert style is set to None in System Settings, so its
     notifications land silently in Notification Center (and in usernoted's
     database) instead of popping up.
  2. This daemon watches that database for new Claude records, drops lifecycle
     ones and automation-session turns, and re-posts the rest with
     terminal-notifier: same title and body, click opens that session.
  3. When the app withdraws a notification (Taylor opened the session, or a
     newer turn replaced it), the mirrored one is withdrawn too.

Until Claude's alert style is None the daemon runs in *shadow* mode: it logs
what it would show or hide but posts nothing, so nothing is ever doubled.

Reading usernoted's database needs a TCC grant the bundled `claude` CLI holds,
so the daemon is started from Claude Code hooks (SessionStart / Stop), not
launchd. See README.md.
"""

import argparse
import fcntl
import glob
import json
import os
import plistlib
import re
import signal
import sqlite3
import subprocess
import sys
import time

HOME = os.path.expanduser('~')


def _env_path(name, default):
    return os.path.expanduser(os.environ.get(name) or default)


DB = _env_path('NOTIFY_CURATOR_DB', '~/Library/Group Containers/group.com.apple.usernoted/db2/db')
NC_PREFS = _env_path('NOTIFY_CURATOR_NCPREFS',
                     '~/Library/Group Containers/group.com.apple.usernoted/Library/Preferences/group.com.apple.usernoted.plist')
STATE_DIR = _env_path('NOTIFY_CURATOR_STATE', '~/.local/state/notify-curator')
CONFIG = _env_path('NOTIFY_CURATOR_CONFIG', '~/.config/notify-curator.json')
NOTIFIER = _env_path('NOTIFY_CURATOR_NOTIFIER', '/opt/homebrew/bin/terminal-notifier')
OSASCRIPT = _env_path('NOTIFY_CURATOR_OSASCRIPT', '/usr/bin/osascript')
SESSIONS_ROOT = _env_path('NOTIFY_CURATOR_SESSIONS', '~/Library/Application Support/Claude/claude-code-sessions')
DRIVER_STATE = _env_path('NOTIFY_CURATOR_DRIVER_STATE', '~/.local/state/claude-driver')
PROJECTS = _env_path('NOTIFY_CURATOR_PROJECTS', '~/.claude/projects')
APP_ICON = '/Applications/Claude.app/Contents/Resources/electron.icns'

CLAUDE_BUNDLE = 'com.anthropic.claudefordesktop'
GROUP_PREFIX = 'ncur:'
LOCK = os.path.join(STATE_DIR, 'daemon.lock')
PIDFILE = os.path.join(STATE_DIR, 'daemon.pid')
DECISIONS = os.path.join(STATE_DIR, 'decisions.jsonl')
DAEMON_LOG = os.path.join(STATE_DIR, 'daemon.log')
ICON_PNG = os.path.join(STATE_DIR, 'claude-icon.png')

POLL_S = 0.4
MODE_REFRESH_S = 3.0
STARTUP_GRACE_S = 30.0  # records this fresh at startup are treated as new
LOG_MAX_BYTES = 2_000_000
APPLE_EPOCH = 978307200  # 2001-01-01 in unix time

# Identifier prefixes the app uses for session-management notifications
# (index.chunk-*.js: agent-archive-<id>, agent-delete-<id>,
# agent-session-<action>-<id>, scheduled-task-<source>-<taskId>).
LIFECYCLE_PREFIXES = ('agent-archive-', 'agent-delete-', 'agent-session-', 'scheduled-task-')
# Notifications that belong to one session and may be automation turns.
SESSION_SCOPED_PREFIXES = ('idle-', 'ask-question-', 'permission-', 'scheduled-local_')
AUTOMATION_TITLE_PATTERNS = (
    r'^pool · .+ · idle$',                 # claude-driver parked pool session
    r'^claude-driver\b.*\b(pressure|probe)\b',  # driver pressure/probe fixtures
    r'^claude-driver-broker$',
    r'^cd-perm\b',                         # driver permission-mode probes
)
RECYCLE_MARKER = "Pool recycle v1 — this session's work is finished"
SESSION_ID_RE = re.compile(r'(local_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')
UNSAFE_LEAD = re.compile(r'^[^\w\s]')


# ---------------------------------------------------------------- config / io

def load_config():
    try:
        with open(CONFIG) as f:
            cfg = json.load(f)
        return cfg if isinstance(cfg, dict) else {}
    except FileNotFoundError:
        return {}
    except Exception as e:  # a broken config must not silently change behavior
        log_line(f'config unreadable ({e!r}); using defaults')
        return {}


def _rotate(path):
    try:
        if os.path.getsize(path) > LOG_MAX_BYTES:
            os.replace(path, path + '.1')
    except FileNotFoundError:
        pass


def log_line(msg):
    os.makedirs(STATE_DIR, exist_ok=True)
    _rotate(DAEMON_LOG)
    with open(DAEMON_LOG, 'a') as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} [{os.getpid()}] {msg}\n")


def log_decision(entry):
    os.makedirs(STATE_DIR, exist_ok=True)
    _rotate(DECISIONS)
    entry = {'ts': time.strftime('%Y-%m-%dT%H:%M:%S'), **entry}
    with open(DECISIONS, 'a') as f:
        f.write(json.dumps(entry, ensure_ascii=False) + '\n')


# ------------------------------------------------------------ usernoted reads

def _unarchive_dict(blob):
    """Decode the NSKeyedArchiver NSDictionary the app stores as userInfo."""
    try:
        p = plistlib.loads(blob)
        objs = p['$objects']
        root = objs[p['$top']['root'].data]
        resolve = lambda u: objs[u.data] if isinstance(u, plistlib.UID) else u
        keys = [resolve(k) for k in root.get('NS.keys', [])]
        vals = [resolve(v) for v in root.get('NS.objects', [])]
        return {k: v for k, v in zip(keys, vals) if isinstance(k, str) and isinstance(v, (str, int, float, bool))}
    except Exception:
        return {}


class DBUnavailable(Exception):
    pass


def read_records(db=DB):
    """Claude's records in Notification Center: {identifier: record dict}."""
    try:
        con = sqlite3.connect(f'file:{db}?mode=ro', uri=True, timeout=2)
        try:
            rows = con.execute(
                'select r.rec_id, r.data, r.delivered_date from record r join app a on a.app_id = r.app_id '
                'where a.identifier = ?', (CLAUDE_BUNDLE,)).fetchall()
        finally:
            con.close()
    except sqlite3.DatabaseError as e:
        raise DBUnavailable(str(e))
    out = {}
    for rec_id, data, delivered in rows:
        try:
            req = plistlib.loads(data).get('req', {})
        except Exception:
            continue
        iden = req.get('iden')
        if not iden:
            continue
        info = _unarchive_dict(req['usda']) if isinstance(req.get('usda'), bytes) else {}
        out[iden] = {
            'rec_id': rec_id,
            'delivered': (delivered or 0) + APPLE_EPOCH,
            'iden': iden,
            'title': req.get('titl') or '',
            'subtitle': req.get('subt') or '',
            'body': req.get('body') or '',
            'thread': req.get('thre') or '',
            'sound': 'soun' in req,
            'info': info,
        }
    return out


_style_cache = {}


def claude_alert_style(prefs=None):
    """0 = None, 1 = Banners, 2 = Alerts; None if unknown.

    Decoded from usernoted's per-app flags ((flags >> 3) & 7), checked against
    Apple's defaults on this Mac: Calendar and Reminders 2, Mail and FaceTime 1.
    """
    prefs = prefs or NC_PREFS
    try:
        m = os.stat(prefs).st_mtime_ns
    except OSError:
        return None
    if _style_cache.get(prefs, (None,))[0] == m:
        return _style_cache[prefs][1]
    style = None
    try:
        with open(prefs, 'rb') as f:
            p = plistlib.load(f)
        for a in p.get('apps', []):
            if a.get('bundle-id') == CLAUDE_BUNDLE:
                style = (int(a.get('flags', 0)) >> 3) & 7
                break
    except Exception:
        return None
    _style_cache[prefs] = (m, style)
    return style


# --------------------------------------------------------- session knowledge

class Sessions:
    """Cached facts about desktop sessions, for the automation filter."""

    def __init__(self, ttl=20.0):
        self.ttl = ttl
        self._cache = {}
        self._registry = (0.0, {})

    def registry(self):
        path = os.path.join(DRIVER_STATE, 'registry.json')
        try:
            m = os.path.getmtime(path)
        except OSError:
            return {}
        if m != self._registry[0]:
            try:
                with open(path) as f:
                    self._registry = (m, json.load(f))
            except Exception:
                return self._registry[1]
        return self._registry[1]

    def record(self, sid):
        for f in glob.glob(os.path.join(glob.escape(SESSIONS_ROOT), '*', '*', f'{sid}.json')):
            try:
                with open(f) as fh:
                    return json.load(fh)
            except Exception:
                continue
        return {}

    def last_turn(self, cli_id):
        """(last real user prompt, assistant text after it) from a CLI transcript.

        Tool results and attachments (which quote CLAUDE.md, recycle rule
        included) are not prompts. Returns ('', '') when nothing is found.
        """
        if not cli_id:
            return '', ''
        files = glob.glob(os.path.join(glob.escape(PROJECTS), '*', f'{cli_id}.jsonl'))
        if not files:
            return '', ''
        path = max(files, key=os.path.getmtime)
        try:
            size = os.path.getsize(path)
            with open(path, 'rb') as f:
                f.seek(max(0, size - 1_500_000))
                lines = f.read().decode('utf-8', 'replace').splitlines()
        except OSError:
            return '', ''
        replies = []
        for line in reversed(lines):
            if '"type":"user"' not in line and '"type":"assistant"' not in line:
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            if d.get('isSidechain'):
                continue
            c = (d.get('message') or {}).get('content')
            if d.get('type') == 'assistant':
                if isinstance(c, list):
                    replies.extend(b.get('text', '') for b in c if isinstance(b, dict) and b.get('type') == 'text')
                continue
            if d.get('type') != 'user':
                continue
            if isinstance(c, str):
                return c, '\n'.join(reversed(replies))
            if isinstance(c, list):
                if any(isinstance(b, dict) and b.get('type') == 'tool_result' for b in c):
                    continue
                texts = [b.get('text', '') for b in c if isinstance(b, dict) and b.get('type') == 'text']
                if texts:
                    return '\n'.join(texts), '\n'.join(reversed(replies))
        return '', ''

    def facts(self, sid):
        hit = self._cache.get(sid)
        now = time.time()
        if hit and now - hit[0] < self.ttl:
            return hit[1]
        rec = self.record(sid)
        reg = self.registry()
        facts = {
            'title': rec.get('title') or '',
            'cwds': [c for c in (rec.get('cwd'), rec.get('originCwd'),
                                 (reg.get('sessions', {}).get(sid) or {}).get('cwd')) if c],
            'kind': (reg.get('sessions', {}).get(sid) or {}).get('kind'),
            'pool': reg.get('pool', {}).get(sid) or {},
            'cli': rec.get('cliSessionId'),
        }
        self._cache[sid] = (now, facts)
        return facts

    def forget(self, sid):
        self._cache.pop(sid, None)


# ------------------------------------------------------------- classification

def session_of(rec):
    sid = rec['info'].get('sessionId')
    if isinstance(sid, str) and SESSION_ID_RE.fullmatch(sid):
        return sid
    m = SESSION_ID_RE.search(rec['iden']) or SESSION_ID_RE.search(rec['thread'])
    return m.group(1) if m else None


def classify(rec, sessions, cfg=None):
    """Return (show, reason). Unknown notification kinds are shown."""
    cfg = cfg or {}
    iden = rec['iden']
    show_prefixes = tuple(cfg.get('show_prefixes', ()))
    hide_prefixes = LIFECYCLE_PREFIXES + tuple(cfg.get('hide_prefixes', ()))
    if show_prefixes and iden.startswith(show_prefixes):
        return True, 'config show_prefixes'
    if iden.startswith(hide_prefixes):
        return False, 'session management'
    if cfg.get('filter_automation', True) and iden.startswith(SESSION_SCOPED_PREFIXES):
        sid = session_of(rec)
        if sid:
            reason = automation_reason(sid, rec, sessions, cfg)
            if reason:
                return False, f'automation: {reason}'
    if iden.startswith('idle-'):
        return True, 'turn finished'
    if iden.startswith(('ask-question-', 'permission-')):
        return True, 'needs input'
    if iden.startswith('scheduled-local_'):
        return True, 'scheduled task finished'
    return True, 'other (shown by default)'


def automation_reason(sid, rec, sessions, cfg):
    f = sessions.facts(sid)
    driver_root = os.path.realpath(DRIVER_STATE) + os.sep
    for c in f['cwds']:
        if os.path.realpath(c).startswith(driver_root) or c.startswith(DRIVER_STATE + os.sep):
            return 'claude-driver fixture folder'
    if f['kind'] == 'probe':
        return 'claude-driver probe'
    patterns = AUTOMATION_TITLE_PATTERNS + tuple(cfg.get('automation_title_patterns', ()))
    titles = [t for t in (f['title'], rec['title'] if rec['iden'].startswith('idle-') else '') if t]
    for t in titles:
        for p in patterns:
            if re.search(p, t):
                return 'automation title'
    return recycle_reason(f, sessions)


def recycle_reason(f, sessions, now=None):
    """A claude-driver pool recycle turn, unless the session declined it.

    The recycle turn clears the session as its last act, so by the time the
    app posts that turn's notification the record may already point at a new,
    empty transcript. The pool entry keeps the transcript the recycle was sent
    to (cliAtRequest); check that one too.
    """
    now = time.time() if now is None else now
    pool = f['pool']
    seen_prompt = False
    for cli in dict.fromkeys(c for c in (pool.get('cliAtRequest'), f['cli']) if c):
        prompt, reply = sessions.last_turn(cli)
        if RECYCLE_MARKER in prompt:
            if 'recycle declined' in reply:
                return None  # it is holding something for Taylor: show it
            return 'pool recycle turn'
        seen_prompt = seen_prompt or bool(prompt)
    # No transcript evidence either way (unreadable or not flushed yet): trust
    # a fresh recycle request. A real prompt after the recycle wins above.
    requested = (pool.get('requestedAt') or 0) / 1000
    if not seen_prompt and pool.get('state') == 'recycling' and now - requested < 15 * 60:
        return 'pool recycle in progress'
    return None


# ------------------------------------------------------------------- posting

def _safe(s):
    # terminal-notifier reads values through NSUserDefaults, which parses a
    # leading "(", "{", "<", "[", "-" or quote as a plist or a flag and then
    # falls back to its default ("Terminal"). A leading backslash is its own
    # escape: it is stripped and the rest shown literally.
    s = s.replace('\x00', '').lstrip()
    return '\\' + s if UNSAFE_LEAD.match(s) else s


def ensure_icon():
    if os.path.exists(ICON_PNG):
        return ICON_PNG
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        subprocess.run(['/usr/bin/sips', '-s', 'format', 'png', APP_ICON, '--resampleWidth', '256',
                        '--out', ICON_PNG], capture_output=True, timeout=20)
    except Exception:
        pass
    return ICON_PNG if os.path.exists(ICON_PNG) else None


def notifier_argv(rec, sid, cfg=None):
    cfg = cfg or {}
    title = rec['title'] or 'Claude'
    body = rec['body'].strip() or ('Claude finished a task' if rec['iden'].startswith('idle-') else 'Open in Claude')
    argv = [NOTIFIER, '-title', _safe(title), '-message', _safe(body), '-group', GROUP_PREFIX + rec['iden']]
    if rec['subtitle']:
        argv += ['-subtitle', _safe(rec['subtitle'])]
    if sid:
        argv += ['-open', f'claude://claude.ai/epitaxy/{sid}']
    else:
        argv += ['-activate', CLAUDE_BUNDLE]
    icon = ensure_icon()
    if icon:
        argv += ['-contentImage', 'file://' + icon]
    if rec['sound'] and cfg.get('sound', True):
        argv += ['-sound', 'default']
    return argv


def post(rec, sid, cfg):
    argv = notifier_argv(rec, sid, cfg)
    try:
        r = subprocess.run(argv, capture_output=True, text=True, timeout=15)
        if r.returncode == 0:
            return True, None
        err = (r.stderr or r.stdout).strip()[:200]
    except Exception as e:
        err = repr(e)[:200]
    # Fallback: a plain banner (no click target) beats a silent miss.
    try:
        script = 'on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run'
        r = subprocess.run([OSASCRIPT, '-e', script, rec['title'] or 'Claude', rec['body'] or ''],
                           capture_output=True, text=True, timeout=15)
        if r.returncode == 0:
            return True, f'terminal-notifier failed, used osascript: {err}'
        return False, f'{err}; osascript: {(r.stderr or "").strip()[:100]}'
    except Exception as e:
        return False, f'{err}; osascript: {e!r}'[:300]


def withdraw(iden):
    try:
        subprocess.run([NOTIFIER, '-remove', GROUP_PREFIX + iden], capture_output=True, timeout=15)
    except Exception as e:
        log_line(f'withdraw {iden} failed: {e!r}')


# -------------------------------------------------------------------- daemon

class Curator:
    def __init__(self, cfg=None):
        self.cfg = cfg if cfg is not None else load_config()
        self.sessions = Sessions()
        self.known = {}      # iden -> (rec_id, delivered)
        self.mirrored = set()
        self.mode = None
        self._mode_at = 0.0
        self._sig = None

    def desired_mode(self):
        forced = self.cfg.get('mode', 'auto')
        if forced in ('active', 'shadow', 'off'):
            return forced
        return 'active' if claude_alert_style() == 0 else 'shadow'

    def refresh_mode(self, force=False):
        now = time.time()
        if not force and now - self._mode_at < MODE_REFRESH_S:
            return
        self._mode_at = now
        self.cfg = load_config()
        new = self.desired_mode()
        if new != self.mode:
            log_line(f'mode {self.mode} -> {new} (Claude alert style {claude_alert_style()})')
            if self.mode == 'active' and new != 'active':
                for iden in list(self.mirrored):
                    withdraw(iden)
                self.mirrored.clear()
            self.mode = new

    def db_signature(self):
        sig = []
        for suffix in ('', '-wal'):
            try:
                st = os.stat(DB + suffix)
                sig.append((st.st_mtime_ns, st.st_size))
            except OSError:
                sig.append(None)
        return tuple(sig)

    def handle(self, rec):
        sid = session_of(rec)
        if sid:
            self.sessions.forget(sid)  # fresh facts for a fresh notification
        show, reason = classify(rec, self.sessions, self.cfg)
        entry = {'iden': rec['iden'], 'session': sid, 'title': rec['title'][:90], 'reason': reason}
        if self.mode == 'off':
            return
        if self.mode == 'shadow':
            log_decision({**entry, 'action': 'would-show' if show else 'would-hide'})
            return
        if show:
            ok, note = post(rec, sid, self.cfg)
            if ok:
                self.mirrored.add(rec['iden'])
            log_decision({**entry, 'action': 'show' if ok else 'show-failed', **({'note': note} if note else {})})
        else:
            if rec['iden'] in self.mirrored:
                withdraw(rec['iden'])
                self.mirrored.discard(rec['iden'])
            log_decision({**entry, 'action': 'hide'})

    def step(self, records=None):
        records = read_records() if records is None else records
        for iden, rec in records.items():
            key = (rec['rec_id'], rec['delivered'])
            if self.known.get(iden) != key:
                self.known[iden] = key
                self.handle(rec)
        for iden in [i for i in self.known if i not in records]:
            del self.known[iden]
            if iden in self.mirrored:
                withdraw(iden)
                self.mirrored.discard(iden)
                log_decision({'iden': iden, 'action': 'withdraw', 'reason': 'Claude withdrew its notification'})

    def baseline(self, records):
        now = time.time()
        for iden, rec in records.items():
            if now - rec['delivered'] > STARTUP_GRACE_S:
                self.known[iden] = (rec['rec_id'], rec['delivered'])

    def run(self):
        self.refresh_mode(force=True)
        records = read_records()
        self.baseline(records)  # older records are history, not news
        self.step(records)
        log_line(f'started: mode={self.mode}, {len(records)} Claude records in Notification Center')
        self._sig = self.db_signature()
        failures = 0
        while True:
            time.sleep(POLL_S)
            self.refresh_mode()
            sig = self.db_signature()
            if sig == self._sig:
                continue
            try:
                records = read_records()
                failures = 0
            except DBUnavailable as e:
                failures += 1
                if 'authorization' in str(e) or failures >= 10:
                    raise
                continue
            self._sig = sig
            self.step(records)


def acquire_lock():
    os.makedirs(STATE_DIR, exist_ok=True)
    fd = os.open(LOCK, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        return None
    return fd


def cmd_daemon(_args):
    fd = None
    for _ in range(20):  # status/ensure probe the lock for an instant; ride that out
        fd = acquire_lock()
        if fd is not None:
            break
        time.sleep(0.05)
    if fd is None:
        return 0  # another instance owns it
    with open(PIDFILE, 'w') as f:
        json.dump({'pid': os.getpid(), 'script_mtime': os.path.getmtime(__file__), 'started': time.time()}, f)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    try:
        Curator().run()
    except DBUnavailable as e:
        # Terminal, never silent: the next hook-driven `ensure` starts a fresh
        # instance from a live Claude Code process, which carries the grant.
        log_line(f'BROKEN: cannot read Notification Center database: {e}')
        return 3
    except SystemExit:
        log_line('stopped')
        raise
    except Exception as e:
        log_line(f'BROKEN: {e!r}')
        raise
    return 0


def running_pid():
    try:
        with open(PIDFILE) as f:
            info = json.load(f)
    except Exception:
        return None, None
    fd = acquire_lock()
    if fd is not None:  # nobody holds the lock: not running
        os.close(fd)
        return None, info
    return info.get('pid'), info


def spawn_daemon():
    with open(os.devnull, 'rb') as dn, open(DAEMON_LOG, 'ab') as out:
        subprocess.Popen([sys.executable, os.path.abspath(__file__), 'daemon'], stdin=dn, stdout=out,
                         stderr=out, start_new_session=True, close_fds=True, cwd=STATE_DIR)


def cmd_ensure(_args):
    os.makedirs(STATE_DIR, exist_ok=True)
    pid, info = running_pid()
    if pid:
        if info and info.get('script_mtime', 0) < os.path.getmtime(__file__):
            log_line(f'restarting {pid}: code changed')
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            for _ in range(50):
                if running_pid()[0] is None:
                    break
                time.sleep(0.05)
        else:
            return 0
    spawn_daemon()
    return 0


def cmd_stop(_args):
    pid, _ = running_pid()
    if not pid:
        print('not running')
        return 0
    os.kill(pid, signal.SIGTERM)
    print(f'stopped {pid}')
    return 0


def cmd_classify(args):
    cfg = load_config()
    sessions = Sessions()
    recs = sorted(read_records().values(), key=lambda r: -r['delivered'])
    for rec in recs[:args.n]:
        show, reason = classify(rec, sessions, cfg)
        when = time.strftime('%m-%d %H:%M', time.localtime(rec['delivered']))
        print(f"{'SHOW' if show else 'hide'}  {when}  {rec['title'][:60]:60s}  [{reason}]")
    return 0


def cmd_status(args):
    pid, info = running_pid()
    style = claude_alert_style()
    names = {0: 'None', 1: 'Banners', 2: 'Alerts', None: 'unknown'}
    mode = load_config().get('mode', 'auto')
    effective = mode if mode != 'auto' else ('active' if style == 0 else 'shadow')
    print(f"daemon: {'running pid %s' % pid if pid else 'NOT running'}")
    print(f"Claude alert style: {names.get(style, style)}  ->  mode: {effective}"
          + ('' if effective == 'active' else '  (set Claude to None in System Settings > Notifications to go live)'))
    try:
        with open(DECISIONS) as f:
            lines = f.readlines()[-args.n:]
    except FileNotFoundError:
        lines = []
    for l in lines:
        d = json.loads(l)
        print(f"  {d['ts'][5:]}  {d['action']:11s} {d.get('title', '')[:60]:60s} [{d.get('reason', '')}]")
    try:
        with open(DAEMON_LOG) as f:
            broken = [l.strip() for l in f.readlines()[-200:] if 'BROKEN' in l]
        if broken:
            print('last error:', broken[-1])
    except FileNotFoundError:
        pass
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog='notify-curator', description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('daemon', help='run in the foreground (normally started by ensure)')
    sub.add_parser('ensure', help='start the daemon if it is not running (used by hooks)')
    sub.add_parser('stop', help='stop the daemon')
    p = sub.add_parser('status', help='mode, health and recent decisions')
    p.add_argument('-n', type=int, default=15)
    p = sub.add_parser('classify', help='dry-run the filter over what is in Notification Center now')
    p.add_argument('-n', type=int, default=40)
    args = ap.parse_args(argv)
    return {'daemon': cmd_daemon, 'ensure': cmd_ensure, 'stop': cmd_stop, 'status': cmd_status,
            'classify': cmd_classify}[args.cmd](args)


if __name__ == '__main__':
    sys.exit(main())
