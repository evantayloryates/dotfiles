import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

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

    def test_status_reports_process_cleanup_until_exit_observed(self):
        class Process:
            exited = False
            def poll(self):
                return 0 if self.exited else None
        process = Process()
        self.b.stopping_frontends = [(process, self.now + 5)]
        self.assertTrue(self.call(op="status")["reactFrontendCleanupPending"])
        process.exited = True
        self.assertFalse(self.call(op="status")["reactFrontendCleanupPending"])

    def next(self):
        return self.b.device_request({**self.device, "op": "next"})

    def result(self, cid, **kw):
        return self.b.device_request({**self.device, "op": "result", "id": cid, "epoch": self.b.epoch, "result": {"delivered": True}, **kw})

    def action(self):
        return self.call(op="action", action="tap", args={"x": 10, "y": 10})["id"]

    def test_diagnostic_matrix_accepts_no_caller_code_or_url(self):
        for action in ("diagnostics-probe", "diagnostics-matrix"):
            with self.assertRaisesRegex(service.Rejected, "diagnostic_arguments_not_allowed"):
                self.call(op="action", action=action, args={"url": "https://example.com"})
        cid = self.call(op="action", action="diagnostics-matrix", args={})["id"]
        self.assertEqual(self.next()["command"]["id"], cid)

    def test_wifi_accepts_only_fixed_states_without_url_escape_hatches(self):
        for args in ({}, {"state": "toggle"}, {"state": "on", "url": "https://example.com"}, {"state": []}, {"state": True}):
            with self.assertRaisesRegex(service.Rejected, "wifi_state_on_or_off_required"):
                self.call(op="action", action="wifi", args=args)
        cid = self.call(op="action", action="wifi", args={"state": "off"})["id"]
        self.assertEqual(self.next()["command"]["id"], cid)
        ack = self.result(cid, result={"delivery": "prepared-shortcut-handoff", "requested": "off", "radioVerified": False})
        self.assertEqual(ack["handoff"], cid)
        self.assertIsNone(ack["lease"])
        self.assertEqual(self.b.last_release["reason"], "device_wifi_handoff")
        self.assertIsNone(self.b.lease)
        self.assertEqual(self.call(op="result", id=cid)["result"]["radioVerified"], False)
        with self.assertRaisesRegex(service.Rejected, "lease_required"):
            self.call(op="action", action="wifi", args={"state": "on"})
        with self.assertRaisesRegex(service.Rejected, "stale_result"):
            self.result(cid, result={"delivery": "prepared-shortcut-handoff", "requested": "off"})

    def test_wifi_failure_does_not_authorize_a_handoff(self):
        cid = self.call(op="action", action="wifi", args={"state": "on"})["id"]
        self.next()
        ack = self.result(cid, result={"error": "wifi_handoff_pending"})
        self.assertNotIn("handoff", ack)
        self.assertIsNotNone(self.b.lease)

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

    def test_sent_timeout_without_client_poll_still_revokes(self):
        cid = self.action()
        self.next()
        self.now += 16
        self.b.tick()
        self.assertIsNone(self.b.lease)
        self.assertEqual(self.b.commands[cid]["status"], "unknown")
        self.assertEqual(self.call(op="result", id=cid)["status"], "unknown")
        with self.assertRaisesRegex(service.Rejected, "lease_required"):
            self.b.control({"op": "result", "lease": "different-owner", "id": cid})

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

    def test_background_cancel_is_fenced(self):
        with self.assertRaisesRegex(service.Rejected, "stale_cancel"):
            self.b.device_request({**self.device, "op": "cancel", "lease": "old", "epoch": self.b.epoch})
        self.assertIsNotNone(self.b.lease)
        response = self.b.device_request({**self.device, "op": "cancel", "lease": "lease", "epoch": self.b.epoch})
        self.assertIsNone(response["lease"])
        self.assertEqual(self.b.last_release["reason"], "device_foreground_lost")

    def test_native_boolean_feedback_normalized_without_coercing_strings(self):
        self.b.device_request({**self.device, "feedback": {"foreground": True, "indicator": 0, "leased": "false"}})
        self.assertEqual(self.b.control({"op": "status"})["deviceFeedback"], {"foreground": True, "indicator": False})

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

    def test_frontend_spawn_failure_does_not_orphan_lease(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp)
            path = home / ".codex/sessions/test.jsonl"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps({"type": "session_meta", "payload": {"id": "thread"}}) + "\n" + json.dumps({"type": "event_msg", "payload": {"type": "task_started", "turn_id": "turn"}}) + "\n")
            self.b.revoke("test")
            self.b.state = home / "state"
            self.b.config["node"] = "/missing-node"
            with patch.object(service.Path, "home", return_value=home), patch.object(service.subprocess, "Popen", side_effect=OSError("synthetic startup failure")):
                with self.assertRaisesRegex(service.Rejected, "frontend_start_failed"):
                    self.b.control({"op": "acquire", "rollout": str(path), "thread": "thread", "turn": "turn"})
            self.assertIsNone(self.b.lease)
            self.assertIsNone(self.b.frontend)

    def test_owner_partial_completion_is_not_prematurely_consumed(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "rollout.jsonl"
            event = json.dumps({"type": "event_msg", "payload": {"type": "task_complete", "turn_id": "turn"}})
            path.write_text(event[:20])
            self.b.lease.update(rollout=str(path), offset=0)
            self.b.observe_owner()
            self.assertIsNotNone(self.b.lease)
            self.assertEqual(self.b.lease["offset"], 0)
            with path.open("a") as f:
                f.write(event[20:] + "\n")
            self.b.observe_owner()
            self.assertIsNone(self.b.lease)

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
