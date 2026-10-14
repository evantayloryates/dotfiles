import unittest
from unittest.mock import patch
from connectivity import diagnose, usb_match, ping_phone, developer_endpoint_tcp
from subprocess import CompletedProcess

SERIAL = '00008110-0012345678901234'
CONFIG = {'address': '100.64.1.2'}
PEER = {'Peer': {'fixed': {'TailscaleIPs': ['100.64.1.2'], 'Online': False}}}


class ConnectivityTests(unittest.TestCase):
    def setUp(self):
        self.endpoint = patch('connectivity.developer_endpoint_tcp', return_value='accepted')
        self.endpoint.start()
        self.addCleanup(self.endpoint.stop)

    def test_bridge_survives_developer_refusal_without_false_setup_request(self):
        with patch('connectivity.fixed_serial', return_value=SERIAL), patch('connectivity.usb_attached', return_value=False), patch('connectivity.tailnet_config', return_value=CONFIG), patch('connectivity.peer_status', return_value=PEER), patch('connectivity.ping_phone', return_value=True), patch('connectivity.developer_endpoint_tcp', return_value='refused'), patch('connectivity.request', return_value={'readyToAcquire': True}):
            value = diagnose('/private-fixture')
        self.assertEqual(value['developerEndpointTCP'], 'refused')
        self.assertTrue(value['bridgeReadyToAcquire'])
        self.assertFalse(value['developerChannelVerified'])
        self.assertIn('Use the working bridge', value['next'])
        self.assertNotIn('Connect USB', value['next'])

    def test_endpoint_probe_is_fixed_bounded_and_not_authentication_proof(self):
        self.endpoint.stop()
        with patch('connectivity.socket.create_connection') as connect:
            self.assertEqual(developer_endpoint_tcp(CONFIG['address']), 'accepted')
        connect.assert_called_once_with((CONFIG['address'], 49152), timeout=1.5)
        for error, expected in [(ConnectionRefusedError(), 'refused'), (TimeoutError(), 'timeout'), (OSError('private-secret'), 'unavailable')]:
            with patch('connectivity.socket.create_connection', side_effect=error):
                self.assertEqual(developer_endpoint_tcp(CONFIG['address']), expected)

    def test_usb_requires_exact_device_not_another_iphone(self):
        tree = [{'IORegistryEntryChildren': [{'USB Product Name': 'iPhone', 'USB Serial Number': 'another'}]}]
        self.assertFalse(usb_match(tree, SERIAL))
        tree[0]['IORegistryEntryChildren'].append({'USB Serial Number': SERIAL.replace('-', '').lower()})
        self.assertTrue(usb_match(tree, SERIAL))

    def test_peer_online_cache_and_live_ping_are_separate_evidence(self):
        with patch('connectivity.fixed_serial', return_value=SERIAL), patch('connectivity.usb_attached', return_value=False), patch('connectivity.tailnet_config', return_value=CONFIG), patch('connectivity.peer_status', return_value=PEER), patch('connectivity.ping_phone', return_value=True) as ping, patch('connectivity.request', return_value={'readyToAcquire': False, 'reason': 'no_fresh_foreground_bridge'}) as ipc:
            value = diagnose('/private-fixture')
        self.assertFalse(value['tailnetPeerOnline'])
        self.assertTrue(value['tailnetPingSucceeded'])
        self.assertEqual(value['lockState'], 'unknown')
        self.assertFalse(value['developerChannelVerified'])
        self.assertFalse(value['phoneInputSent'])
        self.assertFalse(value['usbEnumerationDetected'])
        self.assertIsNone(value['usbAttached'])
        self.assertIn('physical cable state unknown', value['usbObservation'])
        ping.assert_called_once_with(CONFIG['address'])
        self.assertEqual(ipc.call_args.args[0], {'op': 'ready_wait', 'timeoutSeconds': 0})

    def test_usb_error_is_unknown_and_raw_provider_errors_never_escape(self):
        with patch('connectivity.fixed_serial', return_value=SERIAL), patch('connectivity.usb_attached', side_effect=RuntimeError('secret-do-not-export')), patch('connectivity.tailnet_config', return_value=CONFIG), patch('connectivity.peer_status', side_effect=RuntimeError('private')), patch('connectivity.request', side_effect=RuntimeError('private')):
            value = diagnose('/private-fixture')
        self.assertIsNone(value['usbAttached'])
        self.assertIsNone(value['usbEnumerationDetected'])
        self.assertIsNone(value['tailnetPingSucceeded'])
        self.assertIsNone(value['bridgeReadyToAcquire'])
        self.assertEqual(value['lockState'], 'unknown')
        self.assertNotIn('secret-do-not-export', str(value))

    def test_present_usb_is_reported_without_reconnection_instruction(self):
        with patch('connectivity.fixed_serial', return_value=SERIAL), patch('connectivity.usb_attached', return_value=True), patch('connectivity.tailnet_config', return_value=CONFIG), patch('connectivity.peer_status', return_value=PEER), patch('connectivity.ping_phone', return_value=False), patch('connectivity.request', return_value={'readyToAcquire': False}):
            value = diagnose('/private-fixture')
        self.assertTrue(value['usbAttached'])
        self.assertTrue(value['usbEnumerationDetected'])
        self.assertIn('Do not request cable reconnection', value['next'])
        self.assertEqual(value['lockState'], 'unknown')

    def test_ambiguous_peer_sends_no_ping_and_another_owner_is_preserved(self):
        peers = {'Peer': {'one': PEER['Peer']['fixed'], 'two': PEER['Peer']['fixed']}}
        with patch('connectivity.fixed_serial', return_value=SERIAL), patch('connectivity.usb_attached', return_value=True), patch('connectivity.tailnet_config', return_value=CONFIG), patch('connectivity.peer_status', return_value=peers), patch('connectivity.ping_phone') as ping, patch('connectivity.developer_endpoint_tcp') as endpoint, patch('connectivity.request', return_value={'readyToAcquire': False, 'reason': 'another_owner'}):
            value = diagnose('/private-fixture')
        ping.assert_not_called()
        endpoint.assert_not_called()
        self.assertIsNone(value['tailnetPingSucceeded'])
        self.assertIn('Wait for the current owner', value['next'])

    def test_failed_ping_process_is_not_automatically_unreachable(self):
        for code, text, expected in [(0, b'pong from phone via DERP', True), (1, b'ping timed out', False), (1, b'permission denied', None)]:
            with patch('connectivity.subprocess.run', return_value=CompletedProcess([], code, text, b'')):
                self.assertIs(ping_phone(CONFIG['address']), expected)


    def test_relayed_pong_with_nonzero_exit_is_reachable(self):
        # Observed 2026-10-14: tailscale --c=1 exits 1 after a DERP pong.
        relayed = b'pong from iphone (100.64.1.2) via DERP(nyc) in 56ms\n'
        with patch('connectivity.subprocess.run', return_value=CompletedProcess([], 1, relayed, b'direct connection not established\n')):
            self.assertIs(ping_phone(CONFIG['address']), True)

    def test_reachable_phone_without_foreground_app_points_to_launch_not_waiting(self):
        online = {'Peer': {'fixed': {'TailscaleIPs': ['100.64.1.2'], 'Online': True}}}
        for ping in (True, None):
            with patch('connectivity.fixed_serial', return_value=SERIAL), patch('connectivity.usb_attached', return_value=False), patch('connectivity.tailnet_config', return_value=CONFIG), patch('connectivity.peer_status', return_value=online), patch('connectivity.ping_phone', return_value=ping), patch('connectivity.request', return_value={'readyToAcquire': False, 'reason': 'no_fresh_foreground_bridge'}):
                value = diagnose('/private-fixture')
            self.assertIn('ios_device_launch target=kickoff-dev', value['next'])
            self.assertIn('ios_web_open', value['next'])
            self.assertNotIn('No working route', value['next'])
            self.assertEqual(value['lockState'], 'unknown')
            self.assertFalse(value['phoneInputSent'])

    def test_unreachable_phone_still_reports_no_route(self):
        with patch('connectivity.fixed_serial', return_value=SERIAL), patch('connectivity.usb_attached', return_value=False), patch('connectivity.tailnet_config', return_value=CONFIG), patch('connectivity.peer_status', return_value=PEER), patch('connectivity.ping_phone', return_value=False), patch('connectivity.developer_endpoint_tcp', return_value='timeout'), patch('connectivity.request', return_value={'readyToAcquire': False}):
            value = diagnose('/private-fixture')
        self.assertIn('No working route', value['next'])


if __name__ == '__main__':
    unittest.main()
