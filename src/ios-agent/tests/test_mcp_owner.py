import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from service import Broker, Rejected, mcp_owner_state


class MCPOwnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.state = Path(self.temp.name).resolve()
        self.id = 'a' * 32
        self.dir = self.state / 'mcp-sessions' / self.id
        self.dir.mkdir(parents=True, mode=0o700)
        self.dir.parent.chmod(0o700)
        self.path = self.dir / 'owner.json'
        self.now = time.time()
        self.data = dict(version=1, id=self.id, turn='b' * 32, active=True,
                         pid=os.getpid(), heartbeatAt=self.now, activityAt=self.now)
        self.write()
        self.clock = 100
        self.broker = Broker({'device': 'phone', 'bundle': 'com.dev.kudos.fit'}, lambda: self.clock, self.state)
        self.broker.device_request(dict(op='hello', device='phone', bundle='com.dev.kudos.fit', boot='fixture'))

    def write(self):
        self.path.write_text(json.dumps(self.data))
        self.path.chmod(0o600)

    def acquire(self):
        return self.broker.control(dict(op='acquire', ownerFile=str(self.path), thread=self.id, turn=self.data['turn']))

    def test_generic_owner_and_collision_fencing(self):
        self.acquire()
        with self.assertRaisesRegex(Rejected, 'device_already_leased'):
            self.acquire()
        with self.assertRaisesRegex(Rejected, 'lease_required'):
            self.broker.control(dict(op='release', lease='wrong'))

    def test_disconnect_stale_heartbeat_dead_pid_and_identity_replacement_revoke(self):
        for change in ({'active': False}, {'heartbeatAt': self.now - 31}, {'pid': 999999999}, {'turn': 'c' * 32}):
            with self.subTest(change=change):
                self.data.update(active=True, heartbeatAt=self.now, pid=os.getpid(), turn='b' * 32)
                self.write(); self.acquire()
                self.data.update(change); self.write(); self.broker.observe_owner()
                self.assertIsNone(self.broker.lease)

    def test_heartbeat_does_not_extend_silence_but_tool_activity_does(self):
        self.acquire(); initial = self.broker.lease['expires']
        self.clock += 5
        self.data['heartbeatAt'] += 1; self.write()
        with patch('service.time.time', return_value=self.now + 1):
            self.broker.observe_owner()
        self.assertEqual(self.broker.lease['expires'], initial)
        self.data['activityAt'] += 1; self.write()
        with patch('service.time.time', return_value=self.now + 1):
            self.broker.observe_owner()
        self.assertEqual(self.broker.lease['expires'], self.clock + 1200)

    def test_owner_path_permissions_symlink_and_nonfinite_fail_closed(self):
        self.path.chmod(0o644)
        with self.assertRaises(Rejected): mcp_owner_state(self.path, self.state)
        self.path.chmod(0o600)
        original = self.path.read_text(); self.path.unlink()
        alternate = self.dir / 'other.json'; alternate.write_text(original); alternate.chmod(0o600)
        self.path.symlink_to(alternate)
        with self.assertRaises(Rejected): mcp_owner_state(self.path, self.state)
        self.path.unlink()
        self.data['heartbeatAt'] = float('nan'); self.write()
        with self.assertRaises(Rejected): mcp_owner_state(self.path, self.state)

    def test_expiry_cannot_be_revived_by_late_activity(self):
        self.acquire(); self.clock += 1201
        self.broker.observe_owner()
        self.assertIsNone(self.broker.lease)

    def test_codex_turn_also_retires_when_companion_connection_disappears(self):
        self.broker.lease = dict(id='capability', thread='codex', turn='actual-turn',
                                expires=self.clock + 1200, connectionOwner=str(self.path),
                                rollout=str(self.state / 'missing-rollout'), offset=0)
        self.data['active'] = False; self.write()
        self.broker.observe_owner()
        self.assertIsNone(self.broker.lease)
        self.assertEqual(self.broker.last_release['reason'], 'mcp_connection_unavailable')


if __name__ == '__main__': unittest.main()
