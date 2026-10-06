#!/usr/bin/python3
"""Keep the shared 1Password CLI authorization alive and the desktop app present.

Runs as a child of the broker app host (op_agent.py serve) from login, so it
shares the broker's macOS app-data approval and can read 1Password's log.
Every tick it:

  1. relaunches the 1Password desktop app if it is not running (the CLI's
     app integration cannot work without it), in the background;
  2. reads the app lock state from 1Password's own log; while the app or the
     Mac console is locked nothing is attempted, so no prompt piles up while
     Taylor is away. The first time a lock episode is seen with the console
     unlocked, the app is brought forward once so its unlock prompt appears;
  3. for each configured account whose authorization is older than the
     interval, makes one metadata-only broker call (`op vault list`). While the
     authorization is valid this is silent and extends 1Password's 10 minute
     inactivity window. When it is not (login, app relaunch, app lock, the 12
     hour cap) it raises the Touch ID prompt right away, preemptively, and a
     notification says the prompt is the keepalive's.

Everything is logged as JSONL to ~/Library/Logs/op-broker/keepalive-YYYY-MM.jsonl
and the latest state to ~/Library/Caches/com.taylor.op-keepalive/state.json for
`op-audit`. No vault item is ever read and no output is kept.

Config: ~/.config/op-keepalive.json
  {"accounts": [{"id": "<user id or email>", "label": "personal"}, ...],
   "interval_minutes": 7, "notify": true}
"""
import json
import hashlib
import datetime
import os
import re
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path

OP = Path.home() / "dotfiles/bin/op"
CONFIG = Path.home() / ".config/op-keepalive.json"
LOG_DIR = Path.home() / "Library/Logs/op-broker"
STATE = Path.home() / "Library/Caches/com.taylor.op-keepalive/state.json"
RECOVERY = STATE.parent / "recovery-request.json"
ONEPASSWORD_LOGS = Path.home() / ("Library/Group Containers/2BUA8C4S2C.com.1password/"
                                  "Library/Application Support/1Password/Data/logs")
BUNDLE = "com.1password.1password"
TICK = 20
PROMPT_SECONDS = 2.5      # a call slower than this met a human at the prompt
OP_TIMEOUT = 90           # op itself gives up after 60 s of unanswered prompt
MAX_BACKOFF_MINUTES = 30
SOURCE_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
LOG_SUMMARIZED = []


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def load_config():
    try:
        data = json.loads(CONFIG.read_text())
    except (OSError, ValueError):
        return None
    accounts = []
    for entry in data.get("accounts", []):
        if isinstance(entry, str):
            accounts.append({"id": entry, "label": entry[-4:]})
        elif isinstance(entry, dict) and entry.get("id"):
            accounts.append({"id": entry["id"], "label": entry.get("label") or entry["id"][-4:]})
    return {"accounts": accounts, "interval": float(data.get("interval_minutes", 7)) * 60,
            "notify": bool(data.get("notify", True))}


class Log:
    def __init__(self, directory=LOG_DIR):
        self.directory = directory

    def event(self, kind, **fields):
        record = dict(ts=now(), event=kind, **fields)
        try:
            self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
            path = self.directory / ("keepalive-%s.jsonl" % time.strftime("%Y-%m"))
            fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, "a") as handle:
                handle.write(json.dumps(record, separators=(",", ":")) + "\n")
        except (OSError, ValueError, TypeError):
            pass
        return record


def app_running():
    return subprocess.run(["/usr/bin/pgrep", "-x", "1Password"], capture_output=True).returncode == 0


def relaunch_app():
    # -g: do not bring to foreground, -j: hidden. The app starts locked.
    subprocess.run(["/usr/bin/open", "-g", "-j", "-b", BUNDLE], capture_output=True)


def activate_app():
    subprocess.run(["/usr/bin/open", "-b", BUNDLE], capture_output=True)


def console_locked():
    try:
        out = subprocess.run(["/usr/sbin/ioreg", "-n", "Root", "-d1"], capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.TimeoutExpired):
        return None
    match = re.search(r'"IOConsoleLocked" = (Yes|No)', out)
    return None if not match else match.group(1) == "Yes"


def app_lock_state(lines):
    """True locked / False unlocked / None unknown, from 1Password log lines (oldest first)."""
    return app_lock_info(lines)[0]


def event_time(line):
    try:
        value = datetime.datetime.fromisoformat(line.split()[1].replace("Z", "+00:00"))
        return value.replace(tzinfo=datetime.timezone.utc) if value.tzinfo is None else value
    except (ValueError, IndexError):
        return None


def app_lock_info(lines):
    """(state, timestamp of the latest lock event). A lock that came and went between
    two ticks still revoked the CLI authorization, so the timestamp matters too."""
    state, last_lock = None, None
    # Rotation mtime and interleaved client logs are not event chronology.
    events = [(event_time(line), line) for line in lines]
    for _, line in sorted((t, line) for t, line in events if t is not None):
        if "Lock state changed: Locked" in line:
            state = True
            last_lock = line.split()[1] if len(line.split()) > 1 else last_lock
        elif "Lock state changed: Unlocked" in line or "unlock succeeded" in line:
            state = False
    return state, last_lock


def latest_event_time(lines):
    return max((event_time(line) for line in lines if event_time(line) is not None and
                any(s in line for s in ("Lock state changed:", "unlock succeeded"))), default=None)


UNREADABLE = []


def onepassword_tail(max_bytes=300_000, log=None):
    try:
        files = sorted(ONEPASSWORD_LOGS.glob("*.log"), key=lambda p: p.stat().st_mtime)[-12:]
        text = ""
        tails = []
        for path in files:
            with path.open("rb") as handle:
                handle.seek(max(0, path.stat().st_size - max_bytes))
                tail = handle.read().decode("utf-8", "replace")
                text += "\n" + tail
                tails.append(tail)
        if not files:
            raise OSError("no 1Password log files visible")
        UNREADABLE.clear()
        if log is not None and not LOG_SUMMARIZED:
            legacy = None
            legacy_lock = None
            for line in "\n".join(tails[-2:]).splitlines():
                if "Lock state changed: Locked" in line or "Client starting" in line:
                    legacy = True
                    stamp = event_time(line)
                    legacy_lock = stamp.isoformat() if stamp else None
                elif "Lock state changed: Unlocked" in line or "unlock succeeded" in line:
                    legacy = False
            current, last_lock = app_lock_info(text.splitlines())
            log.event("lock_parser_snapshot", files=len(files), legacy_locked=legacy,
                      chronological_locked=current, legacy_last_lock=legacy_lock,
                      chronological_last_lock=last_lock)
            LOG_SUMMARIZED.append(True)
        return text.splitlines()
    except OSError as exc:
        if not UNREADABLE and log is not None:
            # Usually macOS app-data permission: the lock state is then unknown
            # and the keepalive falls back to console state plus backoff.
            log.event("onepassword_log_unreadable", error=type(exc).__name__)
        UNREADABLE.append(True)
        return []


def notify(title, body):
    # One fixed user-authorized command, never derived from log/error text.
    helper = Path.home() / ".codex/skills/notify-macos/scripts/notify.py"
    import shlex
    action = shlex.join(["/usr/bin/python3", "-B", str(Path.home() / "dotfiles/src/onepassword/recovery.py")])
    # Standing authorization: diagnose immediately, without a click or another
    # auth wake. The independent worker is bounded and duplicate-safe.
    try:
        subprocess.Popen(["/usr/bin/python3", "-B", str(Path.home() / "dotfiles/src/onepassword/recovery.py"), "--automatic"],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            env={"HOME": str(Path.home()), "PATH": "/opt/homebrew/bin:/usr/bin:/bin"}, start_new_session=True)
    except OSError:
        pass # The click remains an independent recovery entry point.
    try:
        result = subprocess.run(["/usr/bin/python3", str(helper), "--backend", "terminal-notifier",
            "--title", title, "--message", body + " Repair runs automatically. Click to open 1Password and retry authorization.",
            "--group", "op-broker-recovery", "--execute", action],
            env={"HOME": str(Path.home()), "PATH": "/opt/homebrew/bin:/usr/bin:/bin"},
            capture_output=True, timeout=25)
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


CHALLENGE = "System unlock proceeding"


def challenges_since(stamp):
    """UTC timestamps of 1Password Touch ID challenges at or after `stamp` (ISO, UTC)."""
    found = []
    for line in onepassword_tail(60_000):
        if CHALLENGE in line:
            parts = line.split()
            if len(parts) > 1 and parts[1] >= stamp:
                found.append(parts[1])
    return found


def utc_now():
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())


def keepalive_call(account, notify_enabled, log_readable=True):
    """One metadata-only broker call. Returns (status, seconds, exit, detail).

    A prompt is recognised from 1Password's own log (a challenge during the
    call), so a call that merely waited behind a long agent command in the
    broker queue is not mistaken for one. Without the log, duration decides.
    """
    env = {"HOME": str(Path.home()), "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
           "LANG": "en_US.UTF-8", "OP_BROKER_CALLER": "keepalive"}
    args = [str(OP), "vault", "list", "--account", account["id"], "--format", "json"]
    stamp = utc_now()
    started = time.monotonic()
    proc = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE, env=env, cwd=str(Path.home()))
    notified = prompted = False
    while True:
        try:
            _, err = proc.communicate(timeout=1)
            break
        except subprocess.TimeoutExpired:
            elapsed = time.monotonic() - started
            if not prompted and elapsed > PROMPT_SECONDS:
                prompted = bool(challenges_since(stamp)) if log_readable else True
            if prompted and not notified and notify_enabled:
                notify("1Password keepalive", "Touch ID keeps the CLI authorized for %s. "
                       "No agent is reading a secret." % account["label"])
                notified = True
            if elapsed > OP_TIMEOUT:
                proc.kill()
                _, err = proc.communicate()
                break
    seconds = round(time.monotonic() - started, 2)
    if not prompted and seconds > 1.0:
        # A fast approval can finish inside PROMPT_SECONDS; the log still knows.
        prompted = bool(challenges_since(stamp)) if log_readable else seconds > PROMPT_SECONDS
    detail = (err or b"").decode("utf-8", "replace").strip().splitlines()
    detail = "authorization timeout" if any("authorization timeout" in s for s in detail) else ""
    if proc.returncode == 0:
        status = "ok_prompted" if prompted else ("ok_queued" if seconds > PROMPT_SECONDS else "ok")
    elif proc.returncode == 125:
        status = "broker_unavailable"
    elif "authorization timeout" in detail:
        status = "prompt_timeout"
    else:
        status = "error"
    return status, seconds, proc.returncode, detail or ("" if proc.returncode == 0 else status)


class Keepalive:
    def __init__(self, config, log):
        self.config = config
        self.log = log
        self.accounts = {a["id"]: dict(a, last_ok=None, last_prompt=None, next_due=0.0,
                                      interval=config["interval"], last_status=None)
                         for a in config["accounts"]}
        self.app_locked = None
        self.console = None
        self.nudged = False
        self.started = now()
        self.last_relaunch = None
        self.last_lock = None
        self.recovery_id = None
        self.last_event = None
        self.fault_episode = None
        try:
            self.fault_episode = str(uuid.UUID(json.loads(STATE.read_text()).get('fault_episode')))
        except (OSError, ValueError, TypeError, AttributeError):
            pass

    def fault(self):
        if self.fault_episode is None:
            self.fault_episode = str(uuid.uuid4())
            self.log.event('fault_started', episode=self.fault_episode)

    def save_state(self):
        try:
            STATE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            temporary = STATE.with_name(STATE.name + '.tmp')
            temporary.write_text(json.dumps({
                "updated": now(), "started": self.started, "pid": os.getpid(),
                "source_sha256": SOURCE_SHA256,
                "recovery_id": self.recovery_id, "last_lock": self.last_lock, "app_locked": self.app_locked,
                "fault_episode": self.fault_episode,
                "console_locked": self.console, "last_relaunch": self.last_relaunch,
                "accounts": [{k: v for k, v in a.items() if k != "next_due"} for a in self.accounts.values()]},
                indent=1))
            os.chmod(temporary, 0o600)
            os.replace(temporary, STATE)
        except OSError:
            pass

    def reset_backoff(self, reason):
        for acct in self.accounts.values():
            acct["interval"] = self.config["interval"]
            acct["next_due"] = 0.0
        self.log.event("backoff_reset", reason=reason)

    def tick(self):
        try:
            request = json.loads(RECOVERY.read_text())
            if request.get("id") != self.recovery_id and time.time() - request["at"] < 300:
                self.recovery_id = request["id"]
                self.reset_backoff("notification click")
                self.nudged = False
                self.log.event("recovery_kick", request_id=self.recovery_id)
        except (OSError, ValueError, KeyError, TypeError):
            pass
        if not app_running():
            relaunch_app()
            self.last_relaunch = now()
            self.log.event("app_relaunch")
            self.app_locked = True
            self.nudged = False
            self.save_state()
            return
        console = console_locked()
        if console != self.console:
            self.log.event("console", locked=console)
            if console is False and self.console is True:
                self.reset_backoff("console unlocked")
            self.console = console
        lines = onepassword_tail(log=self.log)
        locked, last_lock = app_lock_info(lines)
        latest = latest_event_time(lines)
        if self.last_event and (latest is None or latest < self.last_event):
            # Losing a rotated file cannot roll the known state backwards.
            locked, last_lock = self.app_locked, self.last_lock
        elif latest:
            self.last_event = latest
        if last_lock and (self.last_lock is None or event_time("INFO " + last_lock) > event_time("INFO " + self.last_lock)):
            if self.last_lock is not None:
                # A lock happened since the previous tick (even if already undone):
                # authorization is gone, so re-authorize as soon as the app is open.
                self.log.event("app_lock_event", at=last_lock)
                self.reset_backoff("1Password locked since last tick")
                self.nudged = False
            self.last_lock = last_lock
        if locked != self.app_locked:
            self.log.event("app_lock", locked=locked)
            if locked is False:
                self.reset_backoff("1Password unlocked")
            if locked is True:
                self.nudged = False
            self.app_locked = locked
        if console is not False:
            self.save_state()
            return
        if locked:
            self.fault()
            self.save_state()
            if not self.nudged:
                # One nudge per lock episode: show the unlock screen now rather
                # than letting the next agent call be the first to ask.
                activate_app()
                if self.config["notify"]:
                    notify("1Password keepalive", "1Password is locked. Unlock it so agents do not stall.")
                self.log.event("unlock_nudge")
                self.nudged = True
            self.save_state()
            return
        for acct in self.accounts.values():
            if time.monotonic() < acct["next_due"]:
                continue
            status, seconds, code, detail = keepalive_call(acct, self.config["notify"], log_readable=not UNREADABLE)
            acct["last_status"] = status
            self.log.event("keepalive", account=acct["label"], status=status, seconds=seconds, exit=code,
                           detail=detail if status != "ok" else "")
            if status in ("ok", "ok_queued", "ok_prompted"):
                acct["last_ok"] = now()
                acct["interval"] = self.config["interval"]
                if status == "ok_prompted":
                    acct["last_prompt"] = now()
            elif status == "prompt_timeout":
                acct["interval"] = min(acct["interval"] * 2, MAX_BACKOFF_MINUTES * 60)
            if status not in ("ok", "ok_queued", "ok_prompted") and self.config["notify"]:
                self.fault()
                self.save_state()
                notify("1Password keepalive", "Authorization needs attention (%s)." % status)
            acct["next_due"] = time.monotonic() + acct["interval"]
        if self.fault_episode and all(a['last_status'] in ('ok', 'ok_queued', 'ok_prompted') for a in self.accounts.values()):
            self.log.event('fault_resolved', episode=self.fault_episode)
            self.fault_episode = None
        self.save_state()


def main():
    log = Log()
    config = load_config()
    if not config or not config["accounts"]:
        log.event("config_missing", path=str(CONFIG))
        print("op keepalive: no accounts configured in %s" % CONFIG, file=sys.stderr)
        return 78
    log.event("start", accounts=[a["label"] for a in config["accounts"]],
              interval_minutes=config["interval"] / 60, pid=os.getpid())
    runner = Keepalive(config, log)
    stop = []
    signal.signal(signal.SIGTERM, lambda *_: stop.append(True))
    while not stop:
        try:
            runner.tick()
        except Exception as exc:  # keep the agent alive; never log request details
            log.event("tick_error", error=type(exc).__name__)
        for _ in range(TICK):
            if stop:
                break
            time.sleep(1)
    log.event("stop")
    return 0


if __name__ == "__main__":
    sys.exit(main())
