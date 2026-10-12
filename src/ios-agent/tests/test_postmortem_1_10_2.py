import json
import unittest
from unittest.mock import patch, AsyncMock
import cli
import signals
import device_observer


class ContextTests(unittest.TestCase):
    def test_cli_forwards_current_request_context_over_inherited_startup(self):
        class Wire:
            def __enter__(self): return self
            def __exit__(self, *a): pass
            def settimeout(self, *a): pass
            def connect(self, *a): pass
            def sendall(self, value): self.message=json.loads(value)
            def recv(self, *a): return b'{}\n'
        wire=Wire()
        with patch.dict('os.environ', {'IOS_AGENT_SIGNAL_CONTEXT':json.dumps({'traceId':'a'*16})}), patch.object(cli.socket, 'socket', return_value=wire):
            with signals.signal_context(traceId='b'*16):cli.request({'op':'status'},cli.STATE)
        self.assertEqual(wire.message['signalContext']['traceId'],'b'*16)


class WiFiShortcut(unittest.IsolatedAsyncioTestCase):
    async def test_fixed_on_shortcut_dispatches_once_without_claiming_radio_state(self):
        launch=AsyncMock(return_value=123)
        with patch.object(device_observer,'payload_launch',launch):
            r=await device_observer.shortcut_wifi_on({},'rsd')
        launch.assert_awaited_once_with({},'rsd','com.apple.shortcuts','shortcuts://run-shortcut?name=Runner%20Wi-Fi%20On','shortcut_wifi_on_launch')
        self.assertTrue(r['inputSent']);self.assertFalse(r['wifiVerified']);self.assertFalse(r['replay'])

    async def test_caller_cannot_supply_another_shortcut_or_arguments(self):
        for key in ['url','target','browser','profile','shortcut','arguments']:
            with self.assertRaisesRegex(ValueError,'fixed_wifi_shortcut_required'):
                await device_observer.shortcut_wifi_on({key:'untrusted'},None)
