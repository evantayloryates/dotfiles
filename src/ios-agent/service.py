#!/usr/bin/env python3
"""Personal dev-app broker. No system UI control; no credential/body logging."""
import argparse
import hashlib
import hmac
import json
import os
import math
import stat
from pathlib import Path
import secrets
import signal
import subprocess
import socket
import socketserver
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = 1
MAX_BODY = 8 * 1024 * 1024
OWNER_TIMEOUT = 20 * 60
DEVICE_TIMEOUT = 30
OPERATIONS = {"capabilities", "tree", "image", "tap", "gesture", "text", "react", "state", "diagnostics-probe", "diagnostics-matrix", "reload", "wifi"}
STATE = Path.home() / "Library/Application Support/ios-agent"
SOURCE_HASH = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


class Rejected(Exception):
    pass


class Broker:
    def __init__(self, config, clock=time.monotonic, state=None):
        self.config, self.clock = config, clock
        self.cv = threading.Condition(threading.RLock())
        self.native_priority_until = 0.0
        self.epoch = uuid.uuid4().hex
        self.lease = None
        self.device = None
        self.commands = {}
        self.queue = []
        self.last_release = None
        self.state = state
        self.frontend = None
        self.frontend_port = None
        self.stopping_frontends = []

    def revoke(self, reason):
        with self.cv:
            if self.lease:
                self.last_release = {"reason": reason, "thread": self.lease["thread"], "turn": self.lease["turn"]}
            self.lease = None
            self.native_priority_until = 0.0
            if self.frontend and self.frontend.poll() is None:
                try:
                    os.killpg(self.frontend.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                self.stopping_frontends.append((self.frontend, self.clock() + 2))
            self.frontend = None
            self.frontend_port = None
            for cmd in self.commands.values():
                if cmd["status"] in ("queued", "sent"):
                    cmd.update(status="cancelled" if cmd["status"] == "queued" else "unknown", reason=reason)
            self.queue.clear()
            self.cv.notify_all()

    def tick(self):
        with self.cv:
            remaining = []
            for process, deadline in self.stopping_frontends:
                if process.poll() is None:
                    if self.clock() >= deadline:
                        try:
                            os.killpg(process.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    remaining.append((process, deadline))
            self.stopping_frontends = remaining
            if self.frontend and self.frontend.poll() is not None:
                self.revoke("react_frontend_stopped")
            if self.lease and any(c["status"] in ("queued", "sent") and self.clock() > c["deadline"] for c in self.commands.values()):
                self.revoke("command_timeout")
            if self.lease and self.clock() >= self.lease["expires"]:
                self.revoke("owner_expired")
            if self.device and self.clock() - self.device["seen"] > DEVICE_TIMEOUT:
                self.device = None
                self.revoke("device_disconnected")

    def lease_wire(self):
        self.tick()
        if not self.lease:
            return None
        return {"id": self.lease["id"], "epoch": self.epoch,
                "remainingMs": int(min(DEVICE_TIMEOUT, max(0, self.lease["expires"] - self.clock())) * 1000)}

    def control(self, request):
        with self.cv:
            self.tick()
            op = request.get("op")
            if op == "status":
                return {"version": VERSION, "sourceHash": SOURCE_HASH, "epoch": self.epoch,
                        "reactFrontendRunning": bool(self.frontend and self.frontend.poll() is None),
                        "reactFrontendCleanupPending": bool(self.stopping_frontends),
                        "reactFrontendPort": self.frontend_port,
                        "device": None if not self.device else {k: self.device[k] for k in ("build", "bundle", "boot")},
                        "deviceFeedback": None if not self.device else self.device.get("feedback"),
                        "lease": None if not self.lease else {k: self.lease[k] for k in ("id", "thread", "turn")},
                        "lastRelease": self.last_release,
                        "commands": {k: v["status"] for k, v in self.commands.items()}}
            if op == "acquire":
                owner_file = request.get("ownerFile")
                if owner_file:
                    if request.get("rollout") or not self.state:
                        raise Rejected("one_owner_source_required")
                    path = Path(owner_file)
                    metadata = mcp_owner_state(path, self.state)
                    thread, turn, active = metadata["id"], metadata["turn"], True
                else:
                    path = Path(request.get("rollout", "")).resolve()
                    base = (Path.home() / ".codex/sessions").resolve()
                    if base not in path.parents or not path.is_file():
                        raise Rejected("owner_rollout_required")
                    thread, turn, active = owner_state(path)
                if not active or (thread, turn) != (request.get("thread"), request.get("turn")):
                    raise Rejected("owner_not_current_active_turn")
                if self.lease:
                    raise Rejected("device_already_leased")
                if self.stopping_frontends:
                    raise Rejected("frontend_cleanup_in_progress")
                if not self.device:
                    raise Rejected("device_not_connected")
                self.lease = {"id": secrets.token_hex(16), "thread": thread, "turn": turn,
                              "rollout": str(path), "offset": path.stat().st_size,
                              "expires": self.clock() + OWNER_TIMEOUT}
                if owner_file:
                    self.lease.update(ownerFile=str(path), activityAt=metadata["activityAt"])
                if self.state and self.config.get("node"):
                    relay = Path(__file__).parent / "react/relay.mjs"
                    try:
                        with socket.socket() as available:
                            available.bind(("127.0.0.1", 0))
                            self.frontend_port = available.getsockname()[1]
                        self.frontend = subprocess.Popen([self.config["node"], str(relay), str(self.state)], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True, umask=0o077)
                        self.frontend.stdin.write(encode({"lease": self.lease["id"], "port": self.frontend_port}))
                        self.frontend.stdin.close()
                    except OSError:
                        if self.frontend and self.frontend.stdin:
                            try:
                                self.frontend.stdin.close()
                            except OSError:
                                pass
                        self.revoke("frontend_start_failed")
                        raise Rejected("frontend_start_failed")
                self.cv.notify_all()
                return self.lease_wire()
            if op == "result":
                cmd = self.commands.get(request.get("id"))
                if cmd and cmd["lease"] == request.get("lease") and cmd["status"] not in ("queued", "sent"):
                    # The original capability can recover its terminal outcome after
                    # revocation, but cannot read another owner's result or send input.
                    return {k: cmd[k] for k in ("id", "status", "result", "reason") if k in cmd}
            if not self.lease or request.get("lease") != self.lease["id"]:
                raise Rejected("lease_required")
            if op == "release":
                self.revoke("owner_released")
                return {"released": True}
            if op == "action":
                action = request.get("action")
                if action not in OPERATIONS:
                    raise Rejected("unsupported_action")
                args = request.get("args", {})
                if not isinstance(args, dict) or len(json.dumps(args)) > 65536:
                    raise Rejected("invalid_arguments")
                if action == "wifi" and (set(args) != {"state"} or args["state"] not in ("on", "off")):
                    raise Rejected("wifi_state_on_or_off_required")
                if action in ("diagnostics-probe", "diagnostics-matrix") and args:
                    raise Rejected("diagnostic_arguments_not_allowed")
                # Give a just-delivered native tree a short opportunity for its
                # caller's follow-up. Empty React polling must not consume that
                # snapshot's entire age budget on a slow wireless transport.
                if action == "react" and self.clock() < self.native_priority_until:
                    raise Rejected("command_in_flight")  # not accepted; relay already waits
                # Single flight: a timeout is an unknown mutation outcome, never a replay.
                if any(c["status"] in ("queued", "sent") for c in self.commands.values()):
                    raise Rejected("command_in_flight")
                if len(self.commands) >= 128:
                    self.commands = {k: v for k, v in list(self.commands.items())[-64:]}
                if action != "react":
                    self.native_priority_until = 0.0
                cid = uuid.uuid4().hex
                self.commands[cid] = {"id": cid, "action": action, "args": args,
                                      "lease": self.lease["id"], "epoch": self.epoch,
                                      "status": "queued", "deadline": self.clock() + 15}
                self.queue.append(cid)
                self.cv.notify_all()
                return {"id": cid}
            if op == "result":
                cmd = self.commands.get(request.get("id"))
                if not cmd or cmd["lease"] != self.lease["id"]:
                    raise Rejected("unknown_command")
                if cmd["status"] in ("queued", "sent") and self.clock() > cmd["deadline"]:
                    self.revoke("command_timeout")
                return {k: cmd[k] for k in ("id", "status", "result", "reason") if k in cmd}
            raise Rejected("unsupported_control")

    def device_request(self, request):
        with self.cv:
            self.tick()
            if request.get("device") != self.config["device"] or request.get("bundle") != self.config["bundle"]:
                raise Rejected("target_mismatch")
            boot = request.get("boot")
            if not isinstance(boot, str) or not 1 <= len(boot) <= 128:
                raise Rejected("boot_required")
            op = request.get("op")
            handoff = None
            if op == "hello":
                if self.device and self.device["boot"] != boot:
                    self.revoke("device_restarted")
                self.device = {"boot": boot, "bundle": request["bundle"],
                               "build": str(request.get("build", "unknown"))[:64], "seen": self.clock()}
            elif not self.device or self.device["boot"] != boot:
                raise Rejected("hello_required")
            else:
                self.device["seen"] = self.clock()
            feedback = request.get("feedback")
            if isinstance(feedback, dict):
                # Objective-C boolean expressions may serialize as NSNumber 0/1.
                # Normalize only those exact primitive values; metadata is not auth.
                self.device["feedback"] = {k: bool(feedback[k]) for k in ("foreground", "indicator", "leased") if type(feedback.get(k)) in (bool, int) and feedback[k] in (0, 1)}
            if op == "cancel":
                if self.lease and request.get("lease") == self.lease["id"] and request.get("epoch") == self.epoch:
                    self.revoke("device_foreground_lost")
                elif self.lease:
                    raise Rejected("stale_cancel")
            elif op == "result":
                cmd = self.commands.get(request.get("id"))
                if not self.lease or not cmd or cmd["status"] != "sent" or cmd["lease"] != self.lease["id"] or request.get("epoch") != self.epoch or self.clock() > cmd["deadline"]:
                    raise Rejected("stale_result")
                cmd.update(status="completed", result=request.get("result"))
                result = request.get("result")
                if cmd["action"] == "tree" and isinstance(result, dict) and "error" not in result:
                    self.native_priority_until = self.clock() + 2.0
                if cmd["action"] == "wifi" and isinstance(result, dict) and result.get("delivery") == "prepared-shortcut-handoff" and result.get("requested") == cmd["args"]["state"] and "error" not in result:
                    # Retire normal control before a settings change can drop the
                    # network. The acknowledgment authorizes only this prepared ID.
                    handoff = cmd["id"]
                    self.revoke("device_wifi_handoff")
                self.cv.notify_all()
            elif op == "next":
                # Wake immediately on revocation; bounded idle responses renew app-side expiry.
                if not self.queue:
                    self.cv.wait(2)
                self.tick()
                if not self.device or self.device["boot"] != boot:
                    raise Rejected("device_replaced_during_poll")
            elif op != "hello":
                raise Rejected("unsupported_device_operation")
            response = {"version": VERSION, "epoch": self.epoch, "lease": self.lease_wire()}
            if handoff:
                response["handoff"] = handoff
            while self.queue:
                cmd = self.commands[self.queue.pop(0)]
                if not self.lease or self.clock() > cmd["deadline"]:
                    self.revoke("command_expired")
                    break
                cmd["status"] = "sent"
                response["command"] = {k: cmd[k] for k in ("id", "action", "args", "lease", "epoch")}
                response["command"]["remainingMs"] = int((cmd["deadline"] - self.clock()) * 1000)
                break
            response["lease"] = self.lease_wire()
            return response

    def observe_owner(self):
        with self.cv:
            self.tick()
            if not self.lease:
                return
            lease = self.lease
            if lease.get("ownerFile"):
                try:
                    metadata = mcp_owner_state(Path(lease["ownerFile"]), self.state)
                    if (metadata["id"], metadata["turn"]) != (lease["thread"], lease["turn"]):
                        raise Rejected("mcp_owner_changed")
                    if metadata["activityAt"] > lease["activityAt"]:
                        lease["activityAt"] = metadata["activityAt"]
                        lease["expires"] = self.clock() + OWNER_TIMEOUT
                except (OSError, ValueError, Rejected):
                    self.revoke("mcp_owner_unavailable")
                return
            try:
                path = Path(lease["rollout"])
                if path.stat().st_size < lease["offset"]:
                    self.revoke("owner_log_replaced")
                    return
                with path.open("rb") as f:
                    f.seek(lease["offset"])
                    for raw in f:
                        if not raw.endswith(b"\n"):
                            break
                        lease["offset"] += len(raw)
                        try:
                            entry = json.loads(raw)
                        except (ValueError, UnicodeError):
                            continue
                        # Only structural lifecycle metadata is inspected; messages discarded.
                        p = entry.get("payload", {})
                        if entry.get("type") == "event_msg":
                            kind = p.get("type")
                            if kind in ("task_complete", "turn_aborted") and (p.get("turn_id") == lease["turn"] or not p.get("turn_id")):
                                self.revoke("turn_finished")
                                return
                            if kind == "task_started" and p.get("turn_id") != lease["turn"]:
                                self.revoke("turn_replaced")
                                return
                            if kind in ("token_count", "item_completed"):
                                lease["expires"] = self.clock() + OWNER_TIMEOUT
            except OSError:
                self.revoke("owner_log_unavailable")


def mcp_owner_state(path, state):
    """Local stdio clients own a private heartbeat, never synthetic Codex logs.

    Heartbeats prove connection liveness; only tool activity renews the 20-minute
    silence lease. Same-user control socket remains the existing trust boundary.
    """
    root = Path(state).resolve() / "mcp-sessions"
    if (path.name != "owner.json" or len(path.parent.name) != 32 or
            any(c not in "0123456789abcdef" for c in path.parent.name) or
            path.parent.parent != root or path.resolve() != path or
            any(p.stat().st_mode & 0o077 for p in (root, path.parent))):
        raise Rejected("private_mcp_owner_required")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_size > 1024 or info.st_uid != os.getuid():
            raise Rejected("private_mcp_owner_required")
        value = json.load(stream)
    if not isinstance(value, dict):
        raise Rejected("mcp_owner_invalid")
    now = time.time()
    if (value.get("version") != 1 or value.get("active") is not True or
            value.get("id") != path.parent.name or
            not isinstance(value.get("turn"), str) or len(value["turn"]) != 32 or
            any(c not in "0123456789abcdef" for c in value["turn"]) or
            type(value.get("pid")) is not int or value["pid"] <= 1 or
            any(type(value.get(k)) not in (int, float) or not math.isfinite(value[k]) or
                not 0 <= now - value[k] <= limit for k, limit in (("heartbeatAt", 30), ("activityAt", OWNER_TIMEOUT)))):
        raise Rejected("mcp_owner_inactive")
    os.kill(value["pid"], 0)
    return value


def owner_state(path):
    thread = turn = None
    active = False
    with path.open() as f:
        for raw in f:
            try:
                d = json.loads(raw)
            except ValueError:
                continue
            p = d.get("payload", {})
            if d.get("type") == "session_meta":
                thread = p.get("id")
            if d.get("type") == "event_msg":
                if p.get("type") == "task_started":
                    turn, active = p.get("turn_id"), True
                elif p.get("type") in ("task_complete", "turn_aborted"):
                    active = False
    return thread, turn, active


def encode(value):
    return json.dumps(value, separators=(",", ":")).encode()


def run_server(config, state=STATE):
    os.umask(0o077)
    broker = Broker(config, state=state)

    class HTTP(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_POST(self):
            if self.path != "/v1/device" or not hmac.compare_digest(self.headers.get("Authorization", "").encode(), ("Bearer " + config["token"]).encode()):
                self.send_error(403)
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= MAX_BODY:
                    raise Rejected("invalid_size")
                self.connection.settimeout(5)
                request = json.loads(self.rfile.read(size))
                if not isinstance(request, dict):
                    raise Rejected("invalid_request")
                result = broker.device_request(request)
                code = 200
            except (ValueError, KeyError, TypeError, OSError, Rejected) as e:
                result, code = {"error": str(e) if isinstance(e, Rejected) else "invalid_request"}, 400
            payload = encode(result)
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Connection", "close")
            self.end_headers()
            try:
                self.wfile.write(payload)
            except (OSError, TimeoutError):
                pass

    class Control(socketserver.StreamRequestHandler):
        def handle(self):
            self.request.settimeout(10)
            try:
                raw = self.rfile.readline(131073)
                if len(raw) > 131072:
                    raise Rejected("invalid_size")
                request = json.loads(raw)
                if not isinstance(request, dict):
                    raise Rejected("invalid_request")
                result = broker.control(request)
            except (ValueError, KeyError, TypeError, OSError, Rejected) as e:
                result = {"error": str(e) if isinstance(e, Rejected) else "invalid_request"}
            self.wfile.write(encode(result) + b"\n")

    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(state, 0o700)
    path = state / "control.sock"
    if path.exists():
        # Refuse to replace a live broker; installer owns service restarts.
        probe = socket.socket(socket.AF_UNIX)
        try:
            probe.connect(str(path))
        except ConnectionRefusedError:
            path.unlink()
        else:
            raise RuntimeError("broker_already_running")
        finally:
            probe.close()
    unix = socketserver.ThreadingUnixStreamServer(str(path), Control)
    unix.daemon_threads = True
    os.chmod(path, 0o600)
    http = ThreadingHTTPServer(("127.0.0.1", config.get("port", 19403)), HTTP)
    http.daemon_threads = True
    for server in (unix, http):
        threading.Thread(target=server.serve_forever, daemon=True).start()
    stopping = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stopping.set())
    try:
        while not stopping.wait(0.25):
            broker.observe_owner()
    finally:
        broker.revoke("service_stopped")
        # Allow a waiting device poll to receive the explicit revocation.
        time.sleep(0.1)
        http.shutdown()
        unix.shutdown()
        http.server_close()
        unix.server_close()
        path.unlink(missing_ok=True)
        deadline = time.monotonic() + 3
        while broker.stopping_frontends and time.monotonic() < deadline:
            broker.tick()
            time.sleep(0.05)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, default=STATE)
    args = parser.parse_args()
    config_path = args.state / "config.json"
    if config_path.stat().st_mode & 0o077:
        raise SystemExit("config must have mode 0600")
    config = json.loads(config_path.read_text())
    if config.get("bundle") != "com.dev.kudos.fit" or len(config.get("token", "")) < 32:
        raise SystemExit("dev target and strong token required")
    run_server(config, args.state)


if __name__ == "__main__":
    main()
