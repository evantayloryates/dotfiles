from pathlib import Path
import socket
import tempfile
import threading
import time
import unittest
from cli import request


class ControlDeadlineTests(unittest.TestCase):
    def test_dribbling_partial_response_cannot_extend_total_deadline(self):
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary)
            with socket.socket(socket.AF_UNIX) as listener:
                listener.bind(str(state / 'control.sock')); listener.listen()
                def serve():
                    with listener.accept()[0] as connection:
                        connection.recv(4096)
                        for _ in range(40):
                            try: connection.sendall(b' ')
                            except OSError: break
                            time.sleep(0.02)
                worker = threading.Thread(target=serve); worker.start()
                before = time.monotonic()
                with self.assertRaises((TimeoutError, socket.timeout)):
                    request({'op': 'status'}, state, timeout=0.15)
                self.assertLess(time.monotonic() - before, 0.6)
                worker.join(timeout=1)
                self.assertFalse(worker.is_alive())

    def test_complete_response_preserves_fixed_rejection_and_requires_terminal_newline(self):
        for body in [b'{"error":"device_not_connected"}\n', b'{"ok":true}']:
            with tempfile.TemporaryDirectory() as temporary:
                state = Path(temporary)
                with socket.socket(socket.AF_UNIX) as listener:
                    listener.bind(str(state / 'control.sock')); listener.listen()
                    def serve():
                        with listener.accept()[0] as connection:
                            connection.recv(4096); connection.sendall(body)
                    worker = threading.Thread(target=serve); worker.start()
                    with self.assertRaisesRegex(RuntimeError, 'device_not_connected' if body.endswith(b'\n') else 'control_response_incomplete'):
                        request({'op': 'status'}, state, timeout=1)
                    worker.join(timeout=1)


if __name__ == '__main__':
    unittest.main()
