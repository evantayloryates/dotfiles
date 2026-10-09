#!/usr/bin/env python3
"""Local control client. Lease files stay private; output excludes credentials."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import sys
import time
from service import STATE, owner_state, mcp_owner_state, Rejected

INSPECTION = {"ping", "status", "get-tree", "get-component", "find", "count", "errors",
              "profile-start", "profile-stop", "profile-report", "profile-slow",
              "profile-rerenders", "profile-timeline", "profile-commit", "profile-export"}


def inspect(message, state, timeout=18):
    try:
        return _inspect(message, state, timeout)
    except TimeoutError:
        raise TimeoutError("inspection_deadline_exceeded; do_not_replay") from None


def _inspect(message, state, timeout):
    deadline = time.monotonic() + timeout
    def budget():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("inspection_deadline_exceeded; do_not_replay")
        return remaining
    def host_status():
        return request({"op": "status"}, state, timeout=min(15, budget()))
    status = host_status()
    if not status.get("reactFrontendRunning") or (status.get("lease") or {}).get("id") != message["lease"]:
        raise RuntimeError("active_React_frontend_lease_required")
    command = message["args"]
    if not isinstance(command, dict) or command.get("type") not in INSPECTION or len(json.dumps(command)) > 4096:
        raise RuntimeError("unsupported_inspection")
    ready_deadline = min(deadline, time.monotonic() + 5)
    while True:
        with socket.socket(socket.AF_UNIX) as s:
            s.settimeout(budget())
            fingerprint = hashlib.sha256(message["lease"].encode()).hexdigest()[:16]
            try:
                s.connect(str(state / "react" / fingerprint / "daemon.sock"))
            except (FileNotFoundError, ConnectionRefusedError):
                if time.monotonic() >= ready_deadline:
                    raise RuntimeError("react_frontend_not_ready")
                status = host_status()
                if (status.get("lease") or {}).get("id") != message["lease"]:
                    raise RuntimeError("inspection_lease_ended")
                time.sleep(min(0.05, budget()))
                continue  # No command sent; only frontend readiness is retried.
            s.settimeout(budget())
            s.sendall(json.dumps(command).encode() + b"\n")
            body = bytearray()
            limit = 8 * 1024 * 1024
            while b'\n' not in body:
                s.settimeout(budget())
                part = s.recv(min(65536, limit + 1 - len(body)))
                if not part:
                    raise RuntimeError("inspection_response_incomplete; do_not_replay")
                body.extend(part)
                if len(body) > limit:
                    raise RuntimeError("inspection_response_limit; do_not_replay")
            result = json.loads(body.split(b'\n', 1)[0])
            if not isinstance(result, dict):
                raise RuntimeError("inspection_response_shape; do_not_replay")
            break
    # Revocation during inspection invalidates the result, including model reads.
    status = host_status()
    if (status.get("lease") or {}).get("id") != message["lease"]:
        raise RuntimeError("inspection_lease_ended")
    if not result.get("ok"):
        raise RuntimeError("inspection_failed")
    return result


def request(message, state, timeout=15):
    deadline = time.monotonic() + timeout
    with socket.socket(socket.AF_UNIX) as s:
        s.settimeout(timeout)
        s.connect(str(state / "control.sock"))
        s.sendall(json.dumps(message).encode() + b"\n")
        body = bytearray()
        limit = 9 * 1024 * 1024
        while b'\n' not in body:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('control_response_deadline_exceeded')
            s.settimeout(remaining)
            if len(body) >= limit:
                raise RuntimeError('control_response_limit')
            part = s.recv(min(65536, limit - len(body)))
            if not part:
                raise RuntimeError('control_response_incomplete')
            body.extend(part)
        response = json.loads(body.split(b'\n', 1)[0])
    if "error" in response:
        raise RuntimeError(response["error"])
    return response


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--state", type=Path, default=STATE)
    sub = p.add_subparsers(dest="op", required=True)
    sub.add_parser("status")
    acquire = sub.add_parser("acquire")
    owner = acquire.add_mutually_exclusive_group(required=True)
    owner.add_argument("--rollout", type=Path)
    owner.add_argument("--owner-file", type=Path, help="private MCP connection lifecycle metadata")
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
    action_rejected = False
    action_unconfirmed = False
    if a.op == "acquire":
        if a.owner_file:
            metadata = mcp_owner_state(a.owner_file, a.state)
            thread, turn, active = metadata["id"], metadata["turn"], True
            message.update(ownerFile=str(a.owner_file))
        else:
            thread, turn, active = owner_state(a.rollout)
            message.update(rollout=str(a.rollout.resolve()))
        if not active:
            raise RuntimeError("owner_not_active")
        message.update(thread=thread, turn=turn)
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
            if not isinstance(message["args"], dict):
                raise RuntimeError("arguments_must_be_an_object")
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
                    if a.op == "release" and str(error) == "lease_required":
                        # Foreground/Wi-Fi handoff may already have retired this
                        # capability. Confirm it is inactive; never release the
                        # current owner or claim that the device is globally idle.
                        current = request({"op": "status"}, a.state)
                        if not isinstance(current, dict) or "lease" not in current:
                            raise RuntimeError("release_state_unconfirmed") from None
                        active = current["lease"]
                        if active is not None and (not isinstance(active, dict) or
                                                  not isinstance(active.get("id"), str)):
                            raise RuntimeError("release_state_unconfirmed") from None
                        if isinstance(active, dict) and active["id"] == message["lease"]:
                            raise RuntimeError("release_state_unconfirmed") from None
                        result = {"released": False, "alreadyInactive": True,
                                  "otherOwnerActive": active is not None}
                        break
                    if a.op != "action" or str(error) != "command_in_flight" or time.monotonic() >= admission_end:
                        raise
                    time.sleep(0.05)  # Only admission rejection is retried, never accepted input.
        if a.op == "action":
            cid = result["id"]
            end = time.monotonic() + 18
            while time.monotonic() < end:
                try:
                    result = request({"op": "result", "id": cid, "lease": message["lease"]}, a.state)
                    if (not isinstance(result, dict) or result.get("id") != cid or
                            result.get("status") not in {"queued", "sent", "completed", "unknown", "cancelled"}):
                        raise RuntimeError("result_identity_or_status_invalid")
                except (OSError, ValueError, RuntimeError):
                    # Admission succeeded. Loss of its observation cannot justify
                    # replay, and must not discard the accepted command identity.
                    result = {"id": cid, "status": "unknown", "reason": "result_observation_failed"}
                    break
                if result["status"] not in ("queued", "sent"):
                    break
                time.sleep(0.1)
            if result["status"] != "completed":
                action_unconfirmed = True
            action_rejected = (not action_unconfirmed and
                               (not isinstance(result.get("result"), dict) or
                                "error" in result["result"]))
        if a.op in ("action", "inspect") and a.output:
            fd = os.open(a.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as f:
                json.dump(result, f)
            result = {"status": result.get("status", "completed"), "output": str(a.output.resolve())}
        if a.op == "release":
            a.lease_file.unlink()
    if action_rejected:
        raise RuntimeError("device_action_rejected; inspect_private_receipt; do_not_replay")
    if action_unconfirmed:
        raise RuntimeError("action_not_confirmed; inspect_private_receipt; do_not_replay")
    if a.op == "status" and result.get("lease"):
        result["lease"] = {k: result["lease"][k] for k in ("thread", "turn")}
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, Rejected) as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
