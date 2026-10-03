#!/usr/bin/python3
"""Keepalive unit tests: pure decisions and a fake op; never touch 1Password."""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE))
import keepalive

FAKE = '''#!/bin/sh
case "$FAKE_MODE" in
  ok) exit 0 ;;
  slow) sleep 3; exit 0 ;;
  timeout) echo "[ERROR] 2026/10/03 17:08:51 authorization timeout" >&2; exit 1 ;;
  down) echo "op broker unavailable" >&2; exit 125 ;;
  *) echo "[ERROR] account is not signed in" >&2; exit 1 ;;
esac
'''


class LockStateTests(unittest.TestCase):
    def test_lock_state_follows_latest_event(self):
        lines = ['INFO 2026-10-03T19:49:04 [client:typescript] Client starting.',
                 'INFO 2026-10-03T19:59:48 [1P:...unlock.rs:195] Lock state changed: Unlocked']
        self.assertIs(keepalive.app_lock_state(lines), False)
        lines.append('INFO 2026-10-03T20:30:00 [1P:...lock.rs:237] Lock state changed: Locked')
        self.assertIs(keepalive.app_lock_state(lines), True)
        lines.append('INFO 2026-10-03T20:40:00 [1P:...unlock.rs:939] Device based unlock succeeded, reason: DeviceUnlocked')
        self.assertIs(keepalive.app_lock_state(lines), False)
        self.assertIsNone(keepalive.app_lock_state(['INFO unrelated']))

    def test_lock_event_timestamp_survives_quick_unlock(self):
        lines = ['INFO 2026-10-03T21:40:36.888+00:00 x [1P:lock.rs:237] Lock state changed: Locked',
                 'INFO 2026-10-03T21:40:42.293+00:00 x [1P:unlock.rs:195] Lock state changed: Unlocked']
        state, last_lock = keepalive.app_lock_info(lines)
        self.assertEqual((state, last_lock), (False, '2026-10-03T21:40:36.888+00:00'))

    def test_lock_event_between_ticks_resets_backoff(self):
        log = keepalive.Log(Path(tempfile.mkdtemp(prefix='op-keepalive-test-', dir='/tmp')) / 'logs')
        runner = keepalive.Keepalive({'accounts': [{'id': 'A', 'label': 'a'}], 'interval': 420, 'notify': False}, log)
        runner.last_lock = '2026-10-03T20:00:00+00:00'
        runner.accounts['A']['next_due'] = 10 ** 12
        tail = ['INFO 2026-10-03T21:40:36.888+00:00 x Lock state changed: Locked',
                'INFO 2026-10-03T21:40:42.293+00:00 x Lock state changed: Unlocked']
        originals = (keepalive.app_running, keepalive.console_locked, keepalive.onepassword_tail, keepalive.keepalive_call)
        keepalive.app_running = lambda: True
        keepalive.console_locked = lambda: False
        keepalive.onepassword_tail = lambda log=None: tail
        calls = []
        keepalive.keepalive_call = lambda acct, notify_enabled: (calls.append(acct['id']) or ('ok', 0.3, 0, ''))
        try:
            runner.tick()
        finally:
            keepalive.app_running, keepalive.console_locked, keepalive.onepassword_tail, keepalive.keepalive_call = originals
        self.assertEqual(calls, ['A'])
        self.assertEqual(runner.last_lock, '2026-10-03T21:40:36.888+00:00')


class CallTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='op-keepalive-test-', dir='/tmp')
        fake = Path(self.temp.name) / 'fake-op'
        fake.write_text(FAKE)
        fake.chmod(0o700)
        self.original = keepalive.OP
        keepalive.OP = fake
        self.account = {'id': 'ACCT', 'label': 'test'}

    def tearDown(self):
        keepalive.OP = self.original
        self.temp.cleanup()

    def call(self, mode):
        os.environ['FAKE_MODE'] = mode
        try:
            # keepalive_call builds a minimal env; carry the mode through HOME-independent means
            keepalive_env = dict(HOME=os.environ['HOME'])
            original = keepalive.subprocess.Popen
            def popen(args, **kwargs):
                kwargs['env'] = dict(kwargs['env'], FAKE_MODE=mode)
                return original(args, **kwargs)
            keepalive.subprocess.Popen = popen
            try:
                return keepalive.keepalive_call(self.account, notify_enabled=False)
            finally:
                keepalive.subprocess.Popen = original
        finally:
            del os.environ['FAKE_MODE']

    def test_statuses(self):
        self.assertEqual(self.call('ok')[0], 'ok')
        self.assertEqual(self.call('timeout')[0], 'prompt_timeout')
        self.assertEqual(self.call('down')[0], 'broker_unavailable')
        self.assertEqual(self.call('other')[0], 'error')
        status, seconds, code, detail = self.call('slow')
        self.assertEqual((status, code), ('ok_prompted', 0))
        self.assertGreater(seconds, keepalive.PROMPT_SECONDS)

    def test_backoff_and_reset(self):
        log = keepalive.Log(Path(self.temp.name) / 'logs')
        runner = keepalive.Keepalive({'accounts': [self.account], 'interval': 420, 'notify': False}, log)
        acct = runner.accounts['ACCT']
        acct['interval'] = min(acct['interval'] * 2, keepalive.MAX_BACKOFF_MINUTES * 60)
        self.assertEqual(acct['interval'], 840)
        runner.reset_backoff('test')
        self.assertEqual((acct['interval'], acct['next_due']), (420, 0.0))
        events = [json.loads(l)['event'] for l in (Path(self.temp.name) / 'logs').glob('*.jsonl').__next__().read_text().splitlines()]
        self.assertEqual(events, ['backoff_reset'])

    def test_config_shapes(self):
        cfg = Path(self.temp.name) / 'cfg.json'
        cfg.write_text(json.dumps({'accounts': ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', {'id': 'X', 'label': 'work'}], 'interval_minutes': 5}))
        original = keepalive.CONFIG
        keepalive.CONFIG = cfg
        try:
            loaded = keepalive.load_config()
        finally:
            keepalive.CONFIG = original
        self.assertEqual([a['label'] for a in loaded['accounts']], ['WXYZ', 'work'])
        self.assertEqual((loaded['interval'], loaded['notify']), (300.0, True))


if __name__ == '__main__':
    unittest.main()
