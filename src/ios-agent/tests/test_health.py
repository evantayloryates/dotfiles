import hashlib
from pathlib import Path
import unittest
from unittest.mock import patch
from health import check_host, routes_valid


class HostHealthTests(unittest.TestCase):
    def providers(self, status):
        config = {'metroURL': 'https://fixture.ts.net:10444/'}
        tailnet = {'BackendState': 'Running', 'Self': {'UserID': 1}, 'User': {'1': {'LoginName': 'evantayloryates@gmail.com'}}}
        serve = {'TCP': {str(p): {'HTTPS': True} for p in [10443, 10444, 10445, 10446]},
                 'Web': {f'fixture.ts.net:{p}': {'Handlers': {'/': {'Proxy': f'http://127.0.0.1:{v}'}}}
                         for p, v in [(10443, 19403), (10444, 19404), (10445, 4000), (10446, 3000)]}}
        return [patch('health.request', return_value=status), patch('health.load_config', return_value=config),
                patch('health.tailscale', side_effect=[tailnet, serve]), patch('health.verify_local_backend'),
                patch('health.probe', return_value=True)]

    def test_healthy_host_never_claims_app_readiness_or_mutates(self):
        source = hashlib.sha256((Path(__file__).parents[1] / 'service.py').read_bytes()).hexdigest()
        status = {'sourceHash': source, 'device': {'boot': 'present'}, 'lease': None,
                  'reactFrontendRunning': False, 'reactFrontendCleanupPending': False}
        patches = self.providers(status)
        with patches[0] as ipc, patches[1], patches[2], patches[3], patches[4], patch('health.metro_ready', return_value=True):
            value = check_host()
        self.assertTrue(value['hostPrerequisitesReady'])
        self.assertTrue(value['deviceRegistered'])
        self.assertTrue(value['hostIdle'])
        self.assertEqual(value['applicationReadiness'], 'requires_fresh_owned_lease_and_verify_ready')
        self.assertFalse(value['repairsPerformed'])
        self.assertEqual(ipc.call_args.args[0], {'op': 'status'})

    def test_secret_provider_failures_and_stale_worker_fail_closed(self):
        patches = self.providers({'sourceHash': 'stale', 'lease': {'id': 'other-owner'}})
        with patches[0], patches[1], patches[2], patches[3], patch('health.probe', side_effect=RuntimeError('secret-token-DO-NOT-EXPORT')):
            value = check_host()
        self.assertFalse(value['hostPrerequisitesReady'])
        self.assertFalse(value['checks']['hostWorkerSourceVerified'])
        self.assertFalse(value['hostIdle'])
        self.assertNotIn('DO-NOT-EXPORT', str(value))

    def test_absent_routes_are_not_qualified_by_compatibility_alone(self):
        self.assertFalse(routes_valid({'metroURL': 'https://fixture.ts.net:10444/'}, {}))
        self.assertFalse(routes_valid(None, {}))

    def test_unreachable_host_never_passes_idle(self):
        patches = self.providers(None)
        with patches[0], patches[1], patches[2], patches[3], patches[4], patch('health.metro_ready', return_value=True):
            value = check_host()
        self.assertFalse(value['hostPrerequisitesReady'])
        self.assertFalse(value['hostIdle'])
        self.assertFalse(value['deviceRegistered'])


if __name__ == '__main__':
    unittest.main()
