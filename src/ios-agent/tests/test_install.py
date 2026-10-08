import unittest
from unittest.mock import patch
from install import wait_ready, wait_retired
from pathlib import Path
from types import SimpleNamespace


class WorkerReadinessTests(unittest.TestCase):
    def test_socket_removal_does_not_mean_registration_retired(self):
        with patch('install.subprocess.run', side_effect=[SimpleNamespace(returncode=0), SimpleNamespace(returncode=0), SimpleNamespace(returncode=1)]) as run, patch.object(Path, 'exists', return_value=False), patch('install.time.sleep'):
            wait_retired(Path('/private/state'), 'gui/501')
        self.assertEqual(run.call_count, 3)
        self.assertTrue(all(call.kwargs['timeout'] == 2 for call in run.call_args_list))

    def test_registration_removal_still_waits_for_socket(self):
        with patch('install.subprocess.run', return_value=SimpleNamespace(returncode=1)), patch.object(Path, 'exists', side_effect=[True, False]) as exists, patch('install.time.sleep'):
            wait_retired(Path('/private/state'), 'gui/501')
        self.assertEqual(exists.call_count, 2)

    def test_retiring_worker_cannot_be_reported_as_restarted(self):
        with patch('install.subprocess.run', return_value=SimpleNamespace(returncode=0)), patch('install.time.monotonic', side_effect=[0, 6]):
            with self.assertRaisesRegex(RuntimeError, 'old_worker_did_not_finish_shutdown'):
                wait_retired(Path('/private/state'), 'gui/501')

    def test_waits_for_worker_then_verifies_actual_source(self):
        with patch('install.request', side_effect=[FileNotFoundError(), {'sourceHash': 'current'}]) as request, patch('install.time.sleep'):
            wait_ready('/private/state', 'current')
        self.assertEqual(request.call_count, 2)
        self.assertTrue(all(0 < call.kwargs['timeout'] <= 2 for call in request.call_args_list))

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
