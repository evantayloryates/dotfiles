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
    a = p.parse_args()
    message = {"op": a.op}
    if a.op == "acquire":
        thread, turn, active = owner_state(a.rollout)
        if not active:
            raise RuntimeError("owner_not_active")
        message.update(rollout=str(a.rollout.resolve()), thread=thread, turn=turn)
        result = request(message, a.state)
        fd = os.open(a.lease_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump({"lease": result["id"]}, f)
        result = {"acquired": True, "thread": thread, "turn": turn}
    else:
        if a.op != "status":
            if a.lease_file.stat().st_mode & 0o077:
                raise RuntimeError("lease_file_not_private")
            message.update(json.loads(a.lease_file.read_text()))
        if a.op == "action":
            message.update(action=a.action, args=json.loads(a.args))
        result = request(message, a.state)
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
            if a.output:
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
