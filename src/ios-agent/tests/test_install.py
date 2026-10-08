import unittest
from unittest.mock import patch
from install import wait_ready


class WorkerReadinessTests(unittest.TestCase):
    def test_waits_for_worker_then_verifies_actual_source(self):
        with patch('install.request', side_effect=[FileNotFoundError(), {'sourceHash': 'current'}]) as request, patch('install.time.sleep'):
            wait_ready('/private/state', 'current')
        self.assertEqual(request.call_count, 2)

    def test_stale_registered_worker_is_not_success_or_automatically_restarted(self):
        with patch('install.request', return_value={'sourceHash': 'old'}) as request:
            with self.assertRaisesRegex(RuntimeError, 'running_worker_source_differs'):
                wait_ready('/private/state', 'current')
        self.assertEqual(request.call_count, 1)

    def test_unresponsive_registration_has_bounded_failure(self):
        with patch('install.request', side_effect=ConnectionRefusedError()), patch('install.time.monotonic', side_effect=[0, 9]):
            with self.assertRaisesRegex(RuntimeError, 'registered_worker_not_ready'):
                wait_ready('/private/state', 'current')


if __name__ == '__main__':
    unittest.main()
