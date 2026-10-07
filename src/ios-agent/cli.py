#!/usr/bin/env python3
"""Local control client. Lease files stay private; output excludes credentials."""
import argparse
import json
import os
from pathlib import Path
import socket
import sys
import time
from service import STATE, owner_state

INSPECTION = {"ping", "status", "get-tree", "get-component", "find", "count", "errors",
              "profile-start", "profile-stop", "profile-report", "profile-slow",
              "profile-rerenders", "profile-timeline", "profile-commit", "profile-export"}


def inspect(message, state):
    status = request({"op": "status"}, state)
    if not status.get("reactFrontendRunning") or (status.get("lease") or {}).get("id") != message["lease"]:
        raise RuntimeError("active_React_frontend_lease_required")
    command = message["args"]
    if not isinstance(command, dict) or command.get("type") not in INSPECTION or len(json.dumps(command)) > 4096:
        raise RuntimeError("unsupported_inspection")
    with socket.socket(socket.AF_UNIX) as s:
        s.settimeout(15)
        s.connect(str(state / "react/daemon.sock"))
        s.sendall(json.dumps(command).encode() + b"\n")
        with s.makefile("rb") as f:
            body = f.readline(8 * 1024 * 1024 + 1)
        if len(body) > 8 * 1024 * 1024:
            raise RuntimeError("inspection_response_limit")
        result = json.loads(body)
    # Revocation during inspection invalidates the result, including model reads.
    status = request({"op": "status"}, state)
    if (status.get("lease") or {}).get("id") != message["lease"]:
        raise RuntimeError("inspection_lease_ended")
    if not result.get("ok"):
        raise RuntimeError("inspection_failed")
    return result


def request(message, state):
    with socket.socket(socket.AF_UNIX) as s:
        s.settimeout(15)
        s.connect(str(state / "control.sock"))
        s.sendall(json.dumps(message).encode() + b"\n")
        with s.makefile("rb") as f:
            response = json.loads(f.readline(9 * 1024 * 1024))
    if "error" in response:
        raise RuntimeError(response["error"])
    return response


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--state", type=Path, default=STATE)
    sub = p.add_subparsers(dest="op", required=True)
    sub.add_parser("status")
    acquire = sub.add_parser("acquire")
    acquire.add_argument("--rollout", type=Path, required=True)
    acquire.add_argument("--lease-file", type=Path, required=True)
    release = sub.add_parser("release")
    release.add_argument("--lease-file", type=Path, required=True)
    action = sub.add_parser("action")
    action.add_argument("action")
    action.add_argument("--args", default="{}")
    action.add_argument("--lease-file", type=Path, required=True)
    action.add_argument("--output", type=Path)
    inspection = sub.add_parser("inspect")
    inspection.add_argument("--args", required=True, help='provider command JSON, e.g. {"type":"status"}')
    inspection.add_argument("--lease-file", type=Path, required=True)
    inspection.add_argument("--output", type=Path)
    a = p.parse_args()
    message = {"op": a.op}
    if a.op == "acquire":
        thread, turn, active = owner_state(a.rollout)
        if not active:
            raise RuntimeError("owner_not_active")
        message.update(rollout=str(a.rollout.resolve()), thread=thread, turn=turn)
        # Reserve the destination before acquiring: a file error must not orphan control.
        fd = os.open(a.lease_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        result = None
        try:
            with os.fdopen(fd, "w") as f:
                result = request(message, a.state)
                json.dump({"lease": result["id"]}, f)
        except Exception:
            if result:
                request({"op": "release", "lease": result["id"]}, a.state)
            a.lease_file.unlink(missing_ok=True)
            raise
        result = {"acquired": True, "thread": thread, "turn": turn}
    else:
        if a.op != "status":
            if a.lease_file.stat().st_mode & 0o077:
                raise RuntimeError("lease_file_not_private")
            message.update(json.loads(a.lease_file.read_text()))
        if a.op in ("action", "inspect"):
            if a.output and a.output.exists():
                raise RuntimeError("output_already_exists; action_not_sent")
            message.update(args=json.loads(a.args))
            if a.op == "action":
                message["action"] = a.action
            elif message["args"].get("type") not in ("ping", "status", "profile-start") and not a.output:
                raise RuntimeError("private_output_required_for_model_or_profile_data")
        if a.op == "inspect":
            result = inspect(message, a.state)
        else:
            admission_end = time.monotonic() + 5
            while True:
                try:
                    result = request(message, a.state)
                    break
                except RuntimeError as error:
                    if a.op != "action" or str(error) != "command_in_flight" or time.monotonic() >= admission_end:
                        raise
                    time.sleep(0.05)  # Only admission rejection is retried, never accepted input.
        if a.op == "action":
            cid = result["id"]
            end = time.monotonic() + 18
            while time.monotonic() < end:
                result = request({"op": "result", "id": cid, "lease": message["lease"]}, a.state)
                if result["status"] not in ("queued", "sent"):
                    break
                time.sleep(0.1)
            if result["status"] != "completed":
                raise RuntimeError("action_not_confirmed; do not replay a mutation")
        if a.op in ("action", "inspect") and a.output:
            fd = os.open(a.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as f:
                json.dump(result, f)
            result = {"status": "completed", "output": str(a.output.resolve())}
        if a.op == "release":
            a.lease_file.unlink()
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError) as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
