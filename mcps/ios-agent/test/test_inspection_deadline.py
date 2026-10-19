"""Real provider socket: deadline, framing and owner fencing without replay."""
import hashlib
import json
from pathlib import Path
import socket
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import cli


class InspectionDeadlineTests(unittest.TestCase):
    def run_provider(self, body, *, dribble=False, replaced=False):
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary)
            lease = 'a' * 32
            folder = state / 'react' / hashlib.sha256(lease.encode()).hexdigest()[:16]
            folder.mkdir(parents=True)
            received = []
            with socket.socket(socket.AF_UNIX) as listener:
                listener.bind(str(folder / 'daemon.sock'))
                listener.listen()
                def serve():
                    with listener.accept()[0] as connection:
                        received.append(json.loads(connection.recv(4096)))
                        if dribble:
                            for _ in range(40):
                                try:
                                    connection.sendall(b' ')
                                except OSError:
                                    break
                                time.sleep(0.02)
                        else:
                            connection.sendall(body)
                worker = threading.Thread(target=serve)
                worker.start()
                owned = {'reactFrontendRunning': True, 'lease': {'id': lease}}
                after = {**owned, 'lease': {'id': 'b' * 32}} if replaced else owned
                started = time.monotonic()
                try:
                    with patch.object(cli, 'request', side_effect=[owned, after]) as rpc:
                        result = cli.inspect({'lease': lease, 'args': {'type': 'profile-start'}}, state, timeout=0.15 if dribble else 1)
                        self.assertTrue(all(0 < call.kwargs['timeout'] <= 1 for call in rpc.call_args_list))
                        return result
                finally:
                    elapsed = time.monotonic() - started
                    worker.join(timeout=1)
                    self.assertFalse(worker.is_alive())
                    self.assertEqual(received, [{'type': 'profile-start'}])
                    if dribble:
                        self.assertLess(elapsed, 0.6)

    def test_lazy_start_waits_for_components_before_sending_profile_once(self):
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary)
            lease = 'a' * 32
            folder = state / 'react' / hashlib.sha256(lease.encode()).hexdigest()[:16]
            folder.mkdir(parents=True)
            received = []
            with socket.socket(socket.AF_UNIX) as listener:
                listener.bind(str(folder / 'daemon.sock'))
                listener.listen()
                def serve():
                    for response in [
                        {"ok": True, "data": {"connectedApps": 1, "componentCount": 0}},
                        {"ok": True, "data": {"connectedApps": 1, "componentCount": 4}},
                        {"ok": True, "data": {"started": True}},
                    ]:
                        with listener.accept()[0] as connection:
                            received.append(json.loads(connection.recv(4096)))
                            connection.sendall(json.dumps(response).encode() + b'\n')
                worker = threading.Thread(target=serve, daemon=True)
                worker.start()
                launched = []
                def rpc(message, *args, **kwargs):
                    if message['op'] == 'react_start':
                        launched.append(message['lease'])
                        return {"reactFrontendStarted": True}
                    return {"reactFrontendRunning": bool(launched), "lease": {"id": lease}}
                with patch.object(cli, 'request', side_effect=rpc):
                    result = cli.inspect({'lease': lease, 'args': {'type': 'profile-start'}}, state, timeout=2)
                worker.join(timeout=1)
                self.assertFalse(worker.is_alive())
                self.assertTrue(result['data']['started'])
                self.assertEqual(launched, [lease])
                self.assertEqual(received, [{'type': 'status'}, {'type': 'status'}, {'type': 'profile-start'}])

    def test_dribbling_response_cannot_extend_total_deadline(self):
        with self.assertRaises((TimeoutError, socket.timeout)):
            self.run_provider(b'', dribble=True)

    def test_completed_response_remains_owner_fenced(self):
        with self.assertRaisesRegex(RuntimeError, 'inspection_lease_ended'):
            self.run_provider(b'{"ok":true}\n', replaced=True)

    def test_missing_terminal_newline_is_unconfirmed(self):
        with self.assertRaisesRegex(RuntimeError, 'inspection_response_incomplete'):
            self.run_provider(b'{"ok":true}')

    def test_invalid_response_shape_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'inspection_response_shape'):
            self.run_provider(b'[]\n')

    def test_confirmed_response_preserved(self):
        self.assertEqual(self.run_provider(b'{"ok":true,"data":{"sessionID":"fixture"}}\n'),
                         {'ok': True, 'data': {'sessionID': 'fixture'}})


if __name__ == '__main__':
    unittest.main()
