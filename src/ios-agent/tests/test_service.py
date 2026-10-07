import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("service", Path(__file__).parents[1] / "service.py")
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class BrokerTests(unittest.TestCase):
    def setUp(self):
        self.now = 100.0
        self.b = service.Broker({"device": "phone", "bundle": "com.dev.kudos.fit"}, lambda: self.now)
        self.device = {"device": "phone", "bundle": "com.dev.kudos.fit", "boot": "boot", "op": "hello", "build": "775"}
        self.b.device_request(self.device)
        self.b.lease = {"id": "lease", "thread": "thread", "turn": "turn", "expires": self.now + 1200}

    def call(self, **kw):
        return self.b.control({"lease": "lease", **kw})

    def next(self):
        return self.b.device_request({**self.device, "op": "next"})

    def result(self, cid, **kw):
        return self.b.device_request({**self.device, "op": "result", "id": cid, "epoch": self.b.epoch, "result": {"delivered": True}, **kw})

    def action(self):
        return self.call(op="action", action="tap", args={"x": 10, "y": 10})["id"]

    def test_single_flight_no_replay_and_result_fencing(self):
        cid = self.action()
        with self.assertRaisesRegex(service.Rejected, "in_flight"):
            self.action()
        self.assertEqual(self.next()["command"]["id"], cid)
        self.result(cid)
        self.assertEqual(self.call(op="result", id=cid)["status"], "completed")
        with self.assertRaisesRegex(service.Rejected, "stale_result"):
            self.result(cid)

    def test_timeout_is_unknown_releases_control(self):
        cid = self.action()
        self.next()
        self.now += 16
        self.assertEqual(self.call(op="result", id=cid)["status"], "unknown")
        self.assertIsNone(self.b.lease)
        with self.assertRaisesRegex(service.Rejected, "stale_result"):
            self.result(cid)

    def test_queued_cancel_and_sent_unknown_on_release(self):
        cid = self.action()
        self.call(op="release")
        self.assertEqual(self.b.commands[cid]["status"], "cancelled")
        self.assertEqual(self.b.queue, [])

    def test_old_lease_cannot_release_new_owner(self):
        self.b.lease["id"] = "new-owner"
        with self.assertRaisesRegex(service.Rejected, "lease_required"):
            self.call(op="release")
        self.assertEqual(self.b.lease["id"], "new-owner")

    def test_device_restart_revokes_owner_and_old_results(self):
        cid = self.action()
        self.next()
        self.b.device_request({**self.device, "boot": "newboot"})
        self.assertIsNone(self.b.lease)
        self.assertEqual(self.b.commands[cid]["status"], "unknown")
        with self.assertRaisesRegex(service.Rejected, "hello_required"):
            self.result(cid)

    def test_device_timeout_revokes_even_with_live_owner(self):
        self.now += 31
        self.b.tick()
        self.assertIsNone(self.b.lease)
        self.assertIsNone(self.b.device)

    def test_owner_timeout_without_device_poll_renewal(self):
        self.now += 1201
        self.b.device_request(self.device)
        self.assertIsNone(self.b.lease)

    def test_target_and_epoch_rejected(self):
        with self.assertRaisesRegex(service.Rejected, "target_mismatch"):
            self.b.device_request({**self.device, "bundle": "com.kudos.fit"})
        cid = self.action()
        self.next()
        with self.assertRaisesRegex(service.Rejected, "stale_result"):
            self.result(cid, epoch="old-host")

    def test_no_reconstruction_after_host_restart(self):
        fresh = service.Broker(self.b.config)
        self.assertNotEqual(fresh.epoch, self.b.epoch)
        self.assertIsNone(fresh.lease)

    def test_rejects_unowned_rollout(self):
        self.b.revoke("test")
        with tempfile.NamedTemporaryFile() as f:
            with self.assertRaisesRegex(service.Rejected, "owner_rollout_required"):
                self.b.control({"op": "acquire", "rollout": f.name})

    def test_owner_events_partial_lines_and_completion(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "rollout.jsonl"
            path.write_text("")
            self.b.lease.update(rollout=str(path), offset=0)
            def append(kind, **kw):
                with path.open("a") as f:
                    f.write(json.dumps({"type": "event_msg", "payload": {"type": kind, **kw}}) + "\n")
            self.now += 5
            append("token_count")
            self.b.observe_owner()
            self.assertEqual(self.b.lease["expires"], self.now + 1200)
            append("task_complete", turn_id="turn")
            self.b.observe_owner()
            self.assertIsNone(self.b.lease)

    def test_replaced_turn_revokes(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "rollout.jsonl"
            path.write_text(json.dumps({"type": "event_msg", "payload": {"type": "task_started", "turn_id": "other"}}) + "\n")
            self.b.lease.update(rollout=str(path), offset=0)
            self.b.observe_owner()
            self.assertIsNone(self.b.lease)


if __name__ == "__main__":
    unittest.main()
