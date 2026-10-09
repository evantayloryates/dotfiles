import http.client
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).parents[1]


class TransportTests(unittest.TestCase):
    def test_daemon_auth_fencing_completion_and_restart(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp)
            state = home / "state"
            state.mkdir(mode=0o700)
            token = secrets.token_urlsafe(48)
            with socket.socket() as available:
                available.bind(("127.0.0.1", 0))
                port = available.getsockname()[1]
            config = state / "config.json"
            config.write_text(json.dumps({"device": "test-phone", "bundle": "com.dev.kudos.fit", "token": token, "port": port}))
            config.chmod(0o600)
            rollout = home / ".codex/sessions/test.jsonl"
            rollout.parent.mkdir(parents=True)
            rollout.write_text(json.dumps({"type": "session_meta", "payload": {"id": "thread"}}) + "\n" + json.dumps({"type": "event_msg", "payload": {"type": "task_started", "turn_id": "turn"}}) + "\n")
            def start():
                proc = subprocess.Popen([sys.executable, "-B", str(ROOT / "service.py"), "--state", str(state)], env={**os.environ, "HOME": str(home)}, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                end = time.monotonic() + 5
                while not (state / "control.sock").exists() and time.monotonic() < end:
                    if proc.poll() is not None:
                        self.fail("isolated daemon failed to start")
                    time.sleep(0.02)
                return proc
            def control(op, **kw):
                with socket.socket(socket.AF_UNIX) as s:
                    s.settimeout(5)
                    s.connect(str(state / "control.sock"))
                    s.sendall(json.dumps({"op": op, **kw}).encode() + b"\n")
                    return json.loads(s.makefile("rb").readline())
            def device(op, auth=True, **kw):
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                headers = {"Content-Type": "application/json"}
                if auth:
                    headers["Authorization"] = "Bearer " + token
                body = {"op": op, "device": "test-phone", "bundle": "com.dev.kudos.fit", "boot": "boot", **kw}
                conn.request("POST", "/v1/device", json.dumps(body), headers)
                response = conn.getresponse()
                status, raw = response.status, response.read()
                conn.close()
                return status, json.loads(raw) if status == 200 else None
            proc = start()
            try:
                # The browser SDK HTTP path must survive worker-identity refactors.
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                conn.request("GET", "/v1/web/sdk")
                response = conn.getresponse()
                payload = response.read().decode()
                self.assertEqual(response.status, 200)
                self.assertIn("__iosWebAgent", payload)
                self.assertNotIn("web-poc-1", payload)
                self.assertNotIn(token, payload)
                conn.close()
                self.assertEqual(device("hello", auth=False)[0], 403)
                self.assertEqual(device("hello", token="unexpected")[0], 200)
                self.assertEqual((state / "control.sock").stat().st_mode & 0o777, 0o600)
                lease = control("acquire", rollout=str(rollout), thread="thread", turn="turn")["id"]
                cid = control("action", lease=lease, action="capabilities", args={})["id"]
                _, response = device("next")
                self.assertEqual(response["command"]["id"], cid)
                self.assertEqual(device("result", id=cid, epoch="stale", result={})[0], 400)
                self.assertEqual(device("result", id=cid, epoch=response["epoch"], result={"nativeInputRuntime": True})[0], 200)
                self.assertEqual(control("result", id=cid, lease=lease)["status"], "completed")
                with rollout.open("a") as f:
                    f.write(json.dumps({"type": "event_msg", "payload": {"type": "task_complete", "turn_id": "turn"}}) + "\n")
                end = time.monotonic() + 2
                while control("status")["lease"] and time.monotonic() < end:
                    time.sleep(0.02)
                self.assertIsNone(control("status")["lease"])
                old_epoch = control("status")["epoch"]
                proc.terminate()
                self.assertEqual(proc.wait(5), 0)
                self.assertFalse((state / "control.sock").exists())
                proc.stderr.close()
                proc = start()
                self.assertIsNone(control("status")["lease"])
                self.assertNotEqual(control("status")["epoch"], old_epoch)
            finally:
                if proc.poll() is None:
                    proc.terminate()
                    proc.wait(5)
                proc.stderr.close()


if __name__ == "__main__":
    unittest.main()
