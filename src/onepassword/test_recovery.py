import itertools
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock
import keepalive
import recovery


class RecoveryPressureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        for module, name, value in [(keepalive, 'STATE', self.root/'state.json'),
                                     (keepalive, 'RECOVERY', self.root/'recovery-request.json'),
                                     (recovery, 'CACHE', self.root)]:
            p = patch.object(module, name, value); p.start(); self.addCleanup(p.stop)
        notifier = patch.object(recovery, 'notify_if_due'); notifier.start(); self.addCleanup(notifier.stop)
        recovery.save(self.root/'notification.json', {'episode': '11111111-1111-1111-1111-111111111111', 'last_attempt': 0})

    def runner(self):
        return keepalive.Keepalive({'accounts': [{'id': 'A', 'label': 'test'}], 'interval': 420, 'notify': True}, keepalive.Log(self.root/'logs'))

    def tick(self, runner, lines, console=False):
        with patch.object(keepalive, 'remind_pending_fix'), patch.object(keepalive, 'app_running', return_value=True), \
             patch.object(keepalive, 'console_locked', return_value=console), \
             patch.object(keepalive, 'onepassword_tail', return_value=lines), \
             patch.object(keepalive, 'keepalive_call', return_value=('ok', 0.1, 0, '')) as call, \
             patch.object(keepalive, 'activate_app') as activate, patch.object(keepalive, 'notify') as notify:
            runner.tick()
            return call.call_count, activate.call_count, notify.call_count

    def test_all_rotation_orders(self):
        rows = ['INFO 2026-10-06T06:19:52.741+00:00 Client starting',
                'INFO 2026-10-06T20:22:26+00:00 Lock state changed: Locked',
                'INFO 2026-10-06T20:23:00+00:00 Lock state changed: Unlocked',
                'INFO 2026-10-06T16:24:00-04:00 unlock succeeded']
        for order in itertools.permutations(rows):
            self.assertEqual(keepalive.app_lock_info(order), (False, '2026-10-06T20:22:26+00:00'))

    def test_malformed_timestamp_ignored(self):
        self.assertEqual(keepalive.app_lock_info(['INFO banana Lock state changed: Locked']), (None, None))

    def test_locked_and_unknown_console_never_call(self):
        for console in (True, None):
            self.assertEqual(self.tick(self.runner(), [], console), (0, 0, 0))
        runner = self.runner()
        rows = ['INFO 2026-10-06T20:22:26+00:00 Lock state changed: Locked']
        self.assertEqual(self.tick(runner, rows), (0, 1, 1))
        self.assertEqual(self.tick(runner, rows), (0, 0, 0))

    def test_older_rotation_cannot_regress_or_reset(self):
        runner = self.runner()
        self.tick(runner, ['INFO 2026-10-06T20:23:00+00:00 Lock state changed: Unlocked'])
        interval = runner.accounts['A']['next_due']
        self.assertEqual(self.tick(runner, ['INFO 2026-10-06T06:19:00+00:00 Client starting']), (0, 0, 0))
        self.assertFalse(runner.app_locked)
        self.assertEqual(runner.accounts['A']['next_due'], interval)

    def test_kick_is_consumed_once_and_respects_lock(self):
        runner = self.runner()
        rows = ['INFO 2026-10-06T20:22:26+00:00 Lock state changed: Locked']
        self.tick(runner, rows)
        with patch.object(recovery.subprocess, 'run', side_effect=OSError):
            self.assertEqual(recovery.kick('request'), {'retry_requested': True, 'app_open_accepted': False})
        self.assertEqual(self.tick(runner, rows), (0, 1, 1))
        self.assertEqual(self.tick(runner, rows), (0, 0, 0))
        self.assertEqual(self.tick(runner, rows+['INFO 2026-10-06T20:23:00+00:00 Lock state changed: Unlocked'])[0], 1)

    def test_error_payloads_never_escape(self):
        recovery.save(self.root/'state.json', {'app_locked': 'SECRET', 'accounts': [{'id':'SECRET','label':'SECRET','last_status':'SECRET','detail':'SECRET'}]})
        self.assertNotIn('SECRET', json.dumps(recovery.diagnostics()))

    def test_dispatch_failure_does_not_prevent_kick(self):
        worker = Mock(returncode=0)
        worker.communicate.return_value = (b'{"retry_requested":true,"app_open_accepted":false}', None)
        with patch.object(recovery.subprocess, 'Popen', return_value=worker) as spawn, \
             patch.object(recovery, 'dispatch', side_effect=TimeoutError):
            out = recovery.recover()
        self.assertEqual(out['kick'], {'retry_requested': True, 'app_open_accepted': False})
        self.assertEqual(spawn.call_count, 1)

    def test_automatic_dispatch_never_starts_an_auth_wake(self):
        with patch.object(recovery.subprocess, 'Popen') as spawn, patch.object(recovery, 'dispatch', return_value='queued') as dispatch:
            out = recovery.recover(automatic=True)
        spawn.assert_not_called()
        dispatch.assert_called_once()
        self.assertEqual(out['kick'], 'not_requested')

    def test_click_during_automatic_dispatch_wakes_once(self):
        import fcntl
        worker = Mock(returncode=0)
        worker.communicate.return_value = (b'{"retry_requested":true,"app_open_accepted":true}', None)
        with (self.root/'recovery.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX|fcntl.LOCK_NB)
            with patch.object(recovery.subprocess, 'Popen', return_value=worker) as spawn, patch.object(recovery, 'dispatch') as dispatch:
                for _ in range(2):
                    out = recovery.request_wake()
                    self.assertTrue(out['retry_requested'])
                self.assertEqual(spawn.call_count, 1)
                dispatch.assert_not_called()

    def test_notifier_starts_automatic_worker_without_waiting_for_a_click(self):
        with patch.object(keepalive.subprocess, 'Popen') as spawn:
            self.assertTrue(keepalive.notify('title', 'body'))
        self.assertIn('--automatic', spawn.call_args.args[0])
        self.assertIn('recovery.py', ' '.join(spawn.call_args.args[0]))

    def test_notifier_failure_cannot_crash_auth_path(self):
        with patch.object(keepalive.subprocess, 'Popen', side_effect=OSError):
            self.assertFalse(keepalive.notify('title', 'body'))

if __name__ == '__main__': unittest.main()

class AdditionalBoundaries(unittest.TestCase):
    def test_startup_is_not_a_lock_event(self):
        self.assertEqual(keepalive.app_lock_info(['INFO 2026-10-06T06:19:52+00:00 Client starting']), (None, None))
        self.assertEqual(keepalive.app_lock_info(['INFO 2026-10-06T06:19:52+00:00 Client starting',
            'INFO 2026-10-06T06:19:00+00:00 Lock state changed: Unlocked'])[0], False)

    def test_concurrent_click_never_dispatches_twice(self):
        import fcntl
        with tempfile.TemporaryDirectory() as tmp, patch.object(recovery, 'CACHE', Path(tmp)):
            with (Path(tmp)/'recovery.lock').open('w') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX|fcntl.LOCK_NB)
                with patch.object(recovery, 'notify_if_due'), patch.object(recovery, 'dispatch') as dispatch, patch.object(recovery.subprocess, 'Popen') as spawn:
                    self.assertEqual(recovery.recover(automatic=True)['dispatch'], 'click_in_progress')
                    dispatch.assert_not_called(); spawn.assert_not_called()

    def test_native_keepalive_offset_is_preserved(self):
        self.assertEqual(recovery.safe_epoch('2026-01-01T10:00:00-0500'), recovery.safe_epoch('2026-01-01T15:00:00+00:00'))
        self.assertIsNotNone(recovery.safe_epoch('2026-01-01T10:00:00-0500'))
        self.assertIsNone(recovery.safe_epoch('2026-01-01T10:00:00'))

    def test_timestamp_input_is_bounded(self):
        for value in ('SECRET', '2999-01-01T00:00:00+00:00', None, [], -3):
            self.assertIsNone(recovery.safe_epoch(value))

class NotificationGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        patcher = patch.object(recovery, 'CACHE', self.root)
        patcher.start(); self.addCleanup(patcher.stop)
        self.episode = '11111111-1111-1111-1111-111111111111'
        self.evidence = {'episode': self.episode}

    def test_reminds_after_one_hour_not_before_and_click_stops_reminders(self):
        with patch.object(recovery.subprocess, 'run', return_value=Mock(returncode=0)) as run, patch.object(recovery.time, 'time', return_value=10000):
            self.assertTrue(recovery.notify_if_due(self.evidence))
            self.assertFalse(recovery.notify_if_due(self.evidence))
            args = run.call_args.args[0]
            self.assertIn('--execute', args)
            self.assertIn('--click '+self.episode, args[-1])
        with patch.object(recovery.subprocess, 'run', return_value=Mock(returncode=0)), patch.object(recovery.time, 'time', return_value=13599):
            self.assertFalse(recovery.notify_if_due({}, reminder=True))
        with patch.object(recovery.subprocess, 'run', return_value=Mock(returncode=0)), patch.object(recovery.time, 'time', return_value=13600):
            self.assertTrue(recovery.notify_if_due({}, reminder=True))
        with patch.object(recovery, 'dispatch', return_value='queued') as dispatch, patch.object(recovery, 'request_wake', return_value='fixture'):
            self.assertEqual(recovery.recover(click_episode=self.episode)['dispatch'], 'queued')
            self.assertTrue(dispatch.call_args.args[0]['releaseAuthorized'])
        self.assertTrue(recovery.release_authorized(self.episode))
        with patch.object(recovery.subprocess, 'run') as run, patch.object(recovery.time, 'time', return_value=20000):
            self.assertFalse(recovery.notify_if_due({}, reminder=True)); run.assert_not_called()

    def test_stale_click_cannot_release_new_incident(self):
        recovery.save(self.root/'notification.json', {'episode': self.episode})
        with patch.object(recovery, 'dispatch') as dispatch, patch.object(recovery, 'request_wake') as wake:
            self.assertEqual(recovery.recover(click_episode='22222222-2222-2222-2222-222222222222')['dispatch'], 'stale_notification')
            dispatch.assert_not_called(); wake.assert_not_called()
        self.assertFalse(recovery.release_authorized(self.episode))

    def test_no_change_settlement_stops_hourly_reminder(self):
        incident=self.root/'incident';incident.mkdir()
        recovery.save(incident/'settled.json', {'outcome':'no_change'})
        recovery.save(self.root/'repair-incident.json', {'episode':self.episode,'incidentDir':str(incident)})
        recovery.save(self.root/'notification.json', {'episode':self.episode,'evidence':self.evidence,'last_attempt':0})
        with patch.object(recovery.subprocess, 'run') as run:
            self.assertFalse(recovery.notify_if_due({}, reminder=True));run.assert_not_called()

class KeepaliveReminderTests(unittest.TestCase):
    def test_tick_reminder_is_hourly_and_stops_after_click_or_no_change(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            with patch.object(keepalive, 'STATE', root/'state.json'), patch.object(keepalive.time, 'time', return_value=5000), patch.object(keepalive, 'recovery_worker') as worker:
                for row,expected in [({'last_attempt':1401},0),({'last_attempt':1400},1),({'last_attempt':0,'clicked_at':2000},0),({'last_attempt':0,'completed_without_change':True},0)]:
                    recovery.save(root/'notification.json',row)
                    worker.reset_mock();keepalive.remind_pending_fix()
                    self.assertEqual(worker.call_count,expected)
                    if expected:self.assertEqual(worker.call_args.args,('--remind',))
