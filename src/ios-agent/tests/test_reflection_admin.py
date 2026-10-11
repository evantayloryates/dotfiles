import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import reflection_admin as admin


class ReflectionAdminTests(unittest.TestCase):
    def setUp(self):
        self.state = Path('/private/fixture/state')
        self.probes = Path('/private/fixture/probes')
        self.config = {'version': 1, 'scope': 'qualification', 'containerId': 'a'*64, 'image': 'sha256:'+'b'*64}
        self.container = {'Id': 'a'*64, 'Image': 'sha256:'+'b'*64, 'State': {'Running': True},
                          'Config': {'Entrypoint': ['/usr/local/bin/tailscaled'], 'Cmd': ['--state=/var/lib/tailscale/tailscaled.state', '--socket=/var/run/tailscale/tailscaled.sock', '--tun=tailscale0'], 'Env': ['PATH=/bin']},
                          'HostConfig': {'Privileged': False, 'NetworkMode': 'bridge', 'CapAdd': ['CAP_NET_ADMIN'],
                                         'Devices': [{'PathOnHost': '/dev/net/tun', 'PathInContainer': '/dev/net/tun', 'CgroupPermissions': 'rwm'}], 'PortBindings': {}, 'RestartPolicy': {'Name': 'no'}},
                          'Mounts': [{'Destination': '/probe', 'Source': str(self.probes), 'RW': False},
                                     {'Destination': '/var/lib/tailscale', 'Source': str(self.state/'packet-relay-state'), 'RW': True}]}
        self.status = {'BackendState': 'Running', 'Self': {'ID': 'fixture-node-01', 'UserID': 1}, 'User': {'1': {'LoginName': 'evantayloryates@gmail.com'}}}
        self.prefs = {'AdvertiseRoutes': ['10.7.0.1/32'], 'NoSNAT': True, 'CorpDNS': False, 'RouteAll': False, 'RunSSH': False}

    def validate(self):
        return admin.validate(self.config, self.container, self.status, self.prefs, self.probes, self.state)

    def test_plan_projects_existing_identity_without_claiming_promotion(self):
        value = self.validate()
        self.assertTrue(value['promotionRequired'])
        self.assertFalse(value['newEnrollment'])
        self.assertFalse(value['routeExpansion'])

    def test_changed_container_or_mount_cannot_be_adopted(self):
        for key, value in [('Image', 'sha256:'+'c'*64), ('Id', 'd'*64)]:
            with self.subTest(key=key):
                original = self.container[key];self.container[key] = value
                with self.assertRaises(ValueError):self.validate()
                self.container[key] = original
        self.container['Mounts'][0]['RW'] = True
        with self.assertRaises(ValueError):self.validate()

    def test_route_expansion_or_different_account_refused(self):
        self.prefs['AdvertiseRoutes'].append('0.0.0.0/0')
        with self.assertRaises(ValueError):self.validate()
        self.prefs['AdvertiseRoutes'] = ['10.7.0.1/32']
        self.status['User']['1']['LoginName'] = 'another@example.invalid'
        with self.assertRaises(ValueError):self.validate()

    def test_restart_cannot_reauthenticate_or_expand_network(self):
        self.container['Config']['Env'].append('TS_AUTHKEY=fixture-only-not-a-secret')
        with self.assertRaises(ValueError):self.validate()
        self.container['Config']['Env'].pop()
        self.container['HostConfig']['PortBindings'] = {'80/tcp': [{'HostPort': '80'}]}
        with self.assertRaises(ValueError):self.validate()

    def test_wrong_reviewed_node_sends_no_update(self):
        with patch.object(admin, 'require_idle_host'), patch.object(admin, 'observe', return_value=(self.config, self.validate())), patch.object(admin, 'docker') as docker:
            with self.assertRaises(ValueError):admin.adopt(self.state, 'different-node')
            docker.assert_not_called()

    def test_promotion_only_updates_restart_and_private_scope(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory);before = self.validate();after = {**before, 'scope': 'personal-dev', 'restartPolicy': 'unless-stopped'}
            with patch.object(admin, 'require_idle_host'), patch.object(admin, 'observe', side_effect=[(copy.deepcopy(self.config), before), (self.config, after)]), patch.object(admin, 'docker') as docker:
                result = admin.adopt(state, before['nodeId'])
                docker.assert_called_once_with('update', '--restart=unless-stopped', self.config['containerId'])
                self.assertTrue(result['promotionVerified'])
                config = state/'developer-reflection.json'
                self.assertEqual(json.loads(config.read_text())['scope'], 'personal-dev')
                self.assertEqual(config.stat().st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
