"""Reservation boundary controls; synthetic time never proves a human click."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('click_helper', Path(__file__).with_name('production-click.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ReservationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'signal'
        self.value = dict(schema='production-click/v2', clock_domain='CLOCK_UPTIME_RAW',
            reservation_clock_domain='CLOCK_MONOTONIC_RAW', boot_id='test-boot', duration_s=120,
            clicked_host_ns='1000000000', clicked_continuous_ns='2000000000')
        self.path.write_text(json.dumps(self.value)); self.path.chmod(0o600)

    def check(self, elapsed, operation=10, cleanup=20):
        with patch.object(m, 'boot_id', return_value='test-boot'), patch.object(m, 'native_ns', side_effect=lambda c=8: (2 if c == 4 else 1) * 10**9 + elapsed):
            return m.check(self.path, operation, cleanup)

    def test_cleanup_reserve_cannot_be_spent_on_another_action(self):
        self.assertTrue(self.check(89_999_999_999)['admitted'])
        self.assertFalse(self.check(90_000_000_000)['admitted'])
        self.assertFalse(self.check(100_000_000_000)['admitted'])
        self.assertEqual(self.check(120_000_000_000)['state'], 'expired')

    def test_stage70_late_dismissal_refuses_dispatch(self):
        self.assertFalse(self.check(138_669_450_250, 1, 10)['admitted'])

    def test_observation_is_fresh_and_does_not_modify_signal(self):
        before = self.path.read_bytes()
        self.assertTrue(self.check(20_000_000_000, 60, 20)['admitted'])
        self.assertFalse(self.check(45_000_000_000, 60, 20)['admitted'])
        self.assertEqual(before, self.path.read_bytes())

    def test_waiting_never_admits(self):
        self.path.write_text('')
        self.assertEqual(self.check(0), {'state': 'waiting_for_click', 'admitted': False})

    def test_wrong_boot_clock_future_and_malformed_stamps_refuse(self):
        for field, value in [('boot_id', 'other'), ('clock_domain', 'other'),
                ('reservation_clock_domain', 'other'), ('clicked_host_ns', '900000000000'),
                ('clicked_continuous_ns', '900000000000'), ('clicked_continuous_ns', 2),
                ('clicked_host_ns', '-1'), ('duration_s', True)]:
            with self.subTest(field=field, value=value):
                self.path.write_text(json.dumps({**self.value, field: value}))
                with self.assertRaises(ValueError): self.check(0)

    def test_invalid_budget_and_cleanup_reserve_refuse(self):
        for op, cleanup in [(0, 20), (91, 20), (1, 9), (1, 61), (90, 60), (True, 20), (1.5, 20), (None, 20)]:
            with self.subTest(op=op, cleanup=cleanup):
                with self.assertRaises(ValueError): self.check(0, op, cleanup)

    def test_symlink_public_or_oversized_signal_refuse(self):
        original = self.path
        link = original.with_name('link'); link.symlink_to(original); self.path = link
        with self.assertRaises(OSError): self.check(0)
        self.path = original; self.path.chmod(0o644)
        with self.assertRaises(ValueError): self.check(0)
        self.path.chmod(0o600); self.path.write_text('x' * 4097)
        with self.assertRaises(ValueError): self.check(0)

    def test_duplicate_callback_keeps_original_deadline(self):
        before = self.path.read_bytes()
        self.assertEqual(m.click(self.path), {'state': 'already_signaled', 'extended': False})
        self.assertEqual(self.path.read_bytes(), before)

    def test_watch_retains_same_expiry_validation(self):
        with patch.object(m, 'boot_id', return_value='test-boot'), patch.object(m, 'native_ns', side_effect=lambda c=8: (2 if c == 4 else 1) * 10**9 + 119_000_000_000):
            self.assertEqual(m.watch(self.path, 1)['state'], 'ready')


if __name__ == '__main__':
    unittest.main()
