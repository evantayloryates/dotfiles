import unittest
from unittest.mock import patch
from connectivity import diagnose, usb_match, ping_phone
from subprocess import CompletedProcess

SERIAL = '00008110-0012345678901234'
CONFIG = {'address': '100.64.1.2'}
PEER = {'Peer': {'fixed': {'TailscaleIPs': ['100.64.1.2'], 'Online': False}}}


class ConnectivityTests(unittest.TestCase):
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
        ping.assert_called_once_with(CONFIG['address'])
        self.assertEqual(ipc.call_args.args[0], {'op': 'ready_wait', 'timeoutSeconds': 0})

    def test_usb_error_is_unknown_and_raw_provider_errors_never_escape(self):
        with patch('connectivity.fixed_serial', return_value=SERIAL), patch('connectivity.usb_attached', side_effect=RuntimeError('secret-do-not-export')), patch('connectivity.tailnet_config', return_value=CONFIG), patch('connectivity.peer_status', side_effect=RuntimeError('private')), patch('connectivity.request', side_effect=RuntimeError('private')):
            value = diagnose('/private-fixture')
        self.assertIsNone(value['usbAttached'])
        self.assertIsNone(value['tailnetPingSucceeded'])
        self.assertIsNone(value['bridgeReadyToAcquire'])
        self.assertEqual(value['lockState'], 'unknown')
        self.assertNotIn('secret-do-not-export', str(value))

    def test_present_usb_is_reported_without_reconnection_instruction(self):
        with patch('connectivity.fixed_serial', return_value=SERIAL), patch('connectivity.usb_attached', return_value=True), patch('connectivity.tailnet_config', return_value=CONFIG), patch('connectivity.peer_status', return_value=PEER), patch('connectivity.ping_phone', return_value=False), patch('connectivity.request', return_value={'readyToAcquire': False}):
            value = diagnose('/private-fixture')
        self.assertTrue(value['usbAttached'])
        self.assertIn('Do not request cable reconnection', value['next'])
        self.assertEqual(value['lockState'], 'unknown')

    def test_ambiguous_peer_sends_no_ping_and_another_owner_is_preserved(self):
        peers = {'Peer': {'one': PEER['Peer']['fixed'], 'two': PEER['Peer']['fixed']}}
        with patch('connectivity.fixed_serial', return_value=SERIAL), patch('connectivity.usb_attached', return_value=True), patch('connectivity.tailnet_config', return_value=CONFIG), patch('connectivity.peer_status', return_value=peers), patch('connectivity.ping_phone') as ping, patch('connectivity.request', return_value={'readyToAcquire': False, 'reason': 'another_owner'}):
            value = diagnose('/private-fixture')
        ping.assert_not_called()
        self.assertIsNone(value['tailnetPingSucceeded'])
        self.assertIn('Wait for the current owner', value['next'])

    def test_failed_ping_process_is_not_automatically_unreachable(self):
        for code, text, expected in [(0, b'pong from phone via DERP', True), (1, b'ping timed out', False), (1, b'permission denied', None)]:
            with patch('connectivity.subprocess.run', return_value=CompletedProcess([], code, text, b'')):
                self.assertIs(ping_phone(CONFIG['address']), expected)


if __name__ == '__main__':
    unittest.main()
