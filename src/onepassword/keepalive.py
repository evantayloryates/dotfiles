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
import os
import re
import signal
import subprocess
import sys
import time
from pathlib import Path

OP = Path.home() / "dotfiles/bin/op"
CONFIG = Path.home() / ".config/op-keepalive.json"
LOG_DIR = Path.home() / "Library/Logs/op-broker"
STATE = Path.home() / "Library/Caches/com.taylor.op-keepalive/state.json"
ONEPASSWORD_LOGS = Path.home() / ("Library/Group Containers/2BUA8C4S2C.com.1password/"
                                  "Library/Application Support/1Password/Data/logs")
BUNDLE = "com.1password.1password"
TICK = 20
PROMPT_SECONDS = 2.5      # a call slower than this met a human at the prompt
OP_TIMEOUT = 90           # op itself gives up after 60 s of unanswered prompt
MAX_BACKOFF_MINUTES = 30


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


def app_lock_info(lines):
    """(state, timestamp of the latest lock event). A lock that came and went between
    two ticks still revoked the CLI authorization, so the timestamp matters too."""
    state, last_lock = None, None
    for line in lines:
        if "Lock state changed: Locked" in line or "Client starting" in line:
            state = True
            last_lock = line.split()[1] if len(line.split()) > 1 else last_lock
        elif "Lock state changed: Unlocked" in line or "unlock succeeded" in line:
            state = False
    return state, last_lock


UNREADABLE = []


def onepassword_tail(max_bytes=300_000, log=None):
    try:
        files = sorted(ONEPASSWORD_LOGS.glob("*.log"), key=lambda p: p.stat().st_mtime)[-2:]
        text = ""
        for path in files:
            with path.open("rb") as handle:
                handle.seek(max(0, path.stat().st_size - max_bytes))
                text += handle.read().decode("utf-8", "replace")
        if not files:
            raise OSError("no 1Password log files visible")
        UNREADABLE.clear()
        return text.splitlines()
    except OSError as exc:
        if not UNREADABLE and log is not None:
            # Usually macOS app-data permission: the lock state is then unknown
            # and the keepalive falls back to console state plus backoff.
            log.event("onepassword_log_unreadable", error=type(exc).__name__)
        UNREADABLE.append(True)
        return []


def notify(title, body):
    script = 'display notification "%s" with title "%s"' % (body.replace('"', "'"), title.replace('"', "'"))
    subprocess.run(["/usr/bin/osascript", "-e", script], capture_output=True)


def keepalive_call(account, notify_enabled):
    """One metadata-only broker call. Returns (status, seconds, exit, detail)."""
    env = {"HOME": str(Path.home()), "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
           "LANG": "en_US.UTF-8", "OP_BROKER_CALLER": "keepalive"}
    args = [str(OP), "vault", "list", "--account", account["id"], "--format", "json"]
    started = time.monotonic()
    proc = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE, env=env, cwd=str(Path.home()))
    notified = False
    while True:
        try:
            _, err = proc.communicate(timeout=1)
            break
        except subprocess.TimeoutExpired:
            elapsed = time.monotonic() - started
            if elapsed > PROMPT_SECONDS and not notified and notify_enabled:
                notify("1Password keepalive", "Touch ID keeps the CLI authorized for %s. "
                       "No agent is reading a secret." % account["label"])
                notified = True
            if elapsed > OP_TIMEOUT:
                proc.kill()
                _, err = proc.communicate()
                break
    seconds = round(time.monotonic() - started, 2)
    detail = (err or b"").decode("utf-8", "replace").strip().splitlines()
    detail = detail[-1][:120] if detail else ""
    if proc.returncode == 0:
        status = "ok_prompted" if seconds > PROMPT_SECONDS else "ok"
    elif proc.returncode == 125:
        status = "broker_unavailable"
    elif "authorization timeout" in detail:
        status = "prompt_timeout"
    else:
        status = "error"
    return status, seconds, proc.returncode, detail


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

    def save_state(self):
        try:
            STATE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            STATE.write_text(json.dumps({
                "updated": now(), "started": self.started, "app_locked": self.app_locked,
                "console_locked": self.console, "last_relaunch": self.last_relaunch,
                "accounts": [{k: v for k, v in a.items() if k != "next_due"} for a in self.accounts.values()]},
                indent=1))
        except OSError:
            pass

    def reset_backoff(self, reason):
        for acct in self.accounts.values():
            acct["interval"] = self.config["interval"]
            acct["next_due"] = 0.0
        self.log.event("backoff_reset", reason=reason)

    def tick(self):
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
        locked, last_lock = app_lock_info(onepassword_tail(log=self.log))
        if last_lock and last_lock != self.last_lock:
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
        if console:
            self.save_state()
            return
        if locked:
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
            status, seconds, code, detail = keepalive_call(acct, self.config["notify"])
            acct["last_status"] = status
            self.log.event("keepalive", account=acct["label"], status=status, seconds=seconds, exit=code,
                           detail=detail if status != "ok" else "")
            if status in ("ok", "ok_prompted"):
                acct["last_ok"] = now()
                acct["interval"] = self.config["interval"]
                if status == "ok_prompted":
                    acct["last_prompt"] = now()
            elif status == "prompt_timeout":
                acct["interval"] = min(acct["interval"] * 2, MAX_BACKOFF_MINUTES * 60)
            acct["next_due"] = time.monotonic() + acct["interval"]
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
