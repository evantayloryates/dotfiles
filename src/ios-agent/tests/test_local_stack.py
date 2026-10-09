from pathlib import Path
import unittest
from unittest.mock import patch
from local_stack import (checked_mount, ensure_backend, local_desktop_endpoint,
                         require_idle_host, known_web_forwarder, StackError)


class LocalStackTests(unittest.TestCase):
    def test_desktop_context_must_resolve_to_this_users_local_socket(self):
        endpoint = 'unix://' + str(Path.home() / '.docker/run/docker.sock')
        self.assertTrue(local_desktop_endpoint(endpoint))
        for other in ['tcp://remote:2375', 'ssh://remote', 'unix://remote/tmp/docker.sock',
                      'unix:///tmp/docker.sock', endpoint + '?override=remote']:
            self.assertFalse(local_desktop_endpoint(other))

    def test_new_or_uncertain_owner_is_not_revoked_for_stack_recovery(self):
        for status in [{}, {'lease': {'id': 'new-owner'}},
                       {'lease': None, 'reactFrontendRunning': False,
                        'reactFrontendCleanupPending': True}]:
            with patch('local_stack.request', return_value=status):
                with self.assertRaisesRegex(StackError, 'idle_host_required'):
                    require_idle_host()
        with patch('local_stack.request', return_value={'lease': None,
                   'reactFrontendRunning': False, 'reactFrontendCleanupPending': False}):
            require_idle_host()

    def test_mount_binds_only_the_configured_checkout(self):
        mounts = [{'Type': 'bind', 'Source': '/host_mnt/Users/taylor/project', 'Destination': '/workspaces/kickoff'}]
        self.assertTrue(checked_mount(mounts, Path('/Users/taylor/project')))
        self.assertFalse(checked_mount(mounts, Path('/Users/taylor/other')))
        self.assertFalse(checked_mount([{**mounts[0], 'Type': 'volume'}], Path('/Users/taylor/project')))

    def test_reuses_ready_workers_without_spawning_or_stopping(self):
        with patch('local_stack.local_identity'), patch('local_stack.inspect_processes', return_value={'server': 2, 'starter': 1, 'web': 2}), patch('local_stack.verify_local_backend'), patch('local_stack.probe', return_value=True), patch('local_stack.start') as start:
            value = ensure_backend('fixture')
        self.assertTrue(value['backendReady']); self.assertEqual(value['started'], [])
        start.assert_not_called()

    def test_refuses_unmarked_database_before_launching_any_worker(self):
        with patch('local_stack.local_identity', side_effect=StackError('existing_local_identity_required')), patch('local_stack.inspect_processes') as inspect, patch('local_stack.start') as start:
            with self.assertRaisesRegex(StackError, 'existing_local_identity_required'):
                ensure_backend('fixture')
        inspect.assert_not_called(); start.assert_not_called()

    def test_never_replaces_an_unguarded_existing_server(self):
        with patch('local_stack.local_identity'), patch('local_stack.inspect_processes', return_value={'server': 1, 'starter': 0, 'web': 0}), patch('local_stack.verify_local_backend', side_effect=ValueError('private-provider-error')), patch('local_stack.start') as start:
            with self.assertRaises(ValueError): ensure_backend('fixture')
        start.assert_not_called()

    def test_busy_unowned_port_is_not_a_start_or_kill_target(self):
        with patch('local_stack.local_identity'), patch('local_stack.inspect_processes', return_value={'server': 0, 'starter': 0, 'web': 0}), patch('local_stack.occupied', return_value=True), patch('local_stack.start') as start:
            with self.assertRaisesRegex(StackError, 'graphql_port_owner_unverified'):
                ensure_backend('fixture')
        start.assert_not_called()

    def test_cold_start_admits_each_fixed_launcher_once_then_requires_real_readiness(self):
        with patch('local_stack.local_identity'), patch('local_stack.inspect_processes', return_value={'server': 0, 'starter': 0, 'web': 0}), patch('local_stack.occupied', return_value=False), patch('local_stack.start') as start, patch('local_stack.verify_local_backend'), patch('local_stack.probe', side_effect=[False, True, True]), patch('local_stack.time.sleep'):
            value = ensure_backend('fixture')
        self.assertEqual(start.call_args_list[0].args, ('fixture', 'node'))
        self.assertEqual(start.call_args_list[1].args, ('fixture', 'next'))
        self.assertEqual(start.call_count, 2); self.assertEqual(value['started'], ['graphql', 'web'])

    def test_pending_startup_is_waited_without_duplicate_admission(self):
        with patch('local_stack.local_identity'), patch('local_stack.inspect_processes', return_value={'server': 0, 'starter': 1, 'web': 1}), patch('local_stack.start') as start, patch('local_stack.verify_local_backend'), patch('local_stack.probe', return_value=False), patch('local_stack.time.monotonic', side_effect=[0, 0, 91]), patch('local_stack.time.sleep'):
            with self.assertRaisesRegex(StackError, 'backend_startup_not_ready'):
                ensure_backend('fixture')
        start.assert_not_called()

    def test_new_owner_between_worker_launches_preserves_owner_and_stops_admission(self):
        with patch('local_stack.local_identity'), patch('local_stack.inspect_processes', return_value={'server':0,'starter':0,'web':0}), patch('local_stack.occupied', return_value=False), patch('local_stack.start') as start:
            def fence():
                if start.call_count:
                    raise StackError('idle_host_required_for_stack_recovery')
            with self.assertRaisesRegex(StackError, 'idle_host_required'):
                ensure_backend('fixture', before_launch=fence)
        self.assertEqual(start.call_count, 1)
        self.assertEqual(start.call_args.args, ('fixture','node'))

    def test_verified_loopback_forwarder_does_not_block_missing_web_worker(self):
        info = [{'Config': {'Image': 'alpine/socat', 'Cmd': ['TCP-LISTEN:3000,fork,reuseaddr', 'TCP:fixture:3000']}, 'NetworkSettings': {'Ports': {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '3000'}]}}}]
        import json
        with patch('local_stack.run', side_effect=[json.dumps(info).encode(), b'free']):
            self.assertTrue(known_web_forwarder('fixture'))
        for outcome in [b'busy', b'unknown']:
            with patch('local_stack.run', side_effect=[json.dumps(info).encode(), outcome]):
                self.assertFalse(known_web_forwarder('fixture'))
        with patch('local_stack.run', return_value=json.dumps(info).encode()):
            self.assertFalse(known_web_forwarder('another-container'))

    def test_proxy_recovery_starts_only_missing_web_and_preserves_graphql(self):
        with patch('local_stack.local_identity'), patch('local_stack.inspect_processes', return_value={'server':1,'starter':1,'web':0}), patch('local_stack.verify_local_backend'), patch('local_stack.occupied', return_value=True), patch('local_stack.known_web_forwarder', return_value=True), patch('local_stack.probe', return_value=True), patch('local_stack.start') as start:
            value=ensure_backend('fixture')
        self.assertEqual(value['started'],['web'])
        start.assert_called_once_with('fixture','next')


if __name__ == '__main__':
    unittest.main()
