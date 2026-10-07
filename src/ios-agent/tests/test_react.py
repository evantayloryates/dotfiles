"""Real pinned frontend + broker transport, synthetic React backend; no phone."""
import hashlib
import http.client
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest

ROOT = Path(__file__).parents[1]


class ReactTransportTests(unittest.TestCase):
    def test_isolated_frontend_inspection_auth_and_turn_cleanup(self):
        node = shutil.which('node')
        if not node or not (ROOT / 'react/node_modules/agent-react-devtools').exists():
            self.skipTest('pinned React dependencies required')
        with tempfile.TemporaryDirectory(dir="/tmp") as temp:
            home = Path(temp)
            state = home / 'state'
            state.mkdir(mode=0o700)
            token = secrets.token_urlsafe(48)
            with socket.socket() as available:
                available.bind(('127.0.0.1', 0))
                port = available.getsockname()[1]
            config = state / 'config.json'
            config.write_text(json.dumps({'device': 'synthetic', 'bundle': 'com.dev.kudos.fit', 'token': token, 'port': port, 'node': node}))
            config.chmod(0o600)
            rollout = home / '.codex/sessions/test.jsonl'
            rollout.parent.mkdir(parents=True)
            rollout.write_text(json.dumps({'type': 'session_meta', 'payload': {'id': 'thread'}}) + '\n' + json.dumps({'type': 'event_msg', 'payload': {'type': 'task_started', 'turn_id': 'turn'}}) + '\n')
            def control(op, **kw):
                with socket.socket(socket.AF_UNIX) as s:
                    s.settimeout(5)
                    s.connect(str(state / 'control.sock'))
                    s.sendall(json.dumps({'op': op, **kw}).encode() + b'\n')
                    return json.loads(s.makefile('rb').readline())
            def device(op, **kw):
                conn = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
                conn.request('POST', '/v1/device', json.dumps({'op': op, 'device': 'synthetic', 'bundle': 'com.dev.kudos.fit', 'boot': 'synthetic-boot', **kw}), {'Authorization': 'Bearer ' + token})
                response = conn.getresponse()
                body = json.loads(response.read())
                conn.close()
                return body
            proc = subprocess.Popen([sys.executable, '-B', str(ROOT / 'service.py'), '--state', str(state)], env={**os.environ, 'HOME': str(home)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            stopping = threading.Event()
            failures = []
            worker = None
            try:
                end = time.monotonic() + 5
                while not (state / 'control.sock').exists() and time.monotonic() < end:
                    time.sleep(0.02)
                device('hello')
                lease = control('acquire', rollout=str(rollout), thread='thread', turn='turn')['id']
                def frontend_dir():
                    return state / 'react' / hashlib.sha256(lease.encode()).hexdigest()[:16]
                def pump():
                    initialized = None
                    try:
                        while not stopping.is_set():
                            reply = device('next')
                            command = reply.get('command')
                            if not command:
                                continue
                            self.assertEqual(command['action'], 'react')
                            frames = []
                            if initialized != command['lease']:
                                name = 'SyntheticCounter'
                                operations = [1, 1, len(name) + 1, len(name), *map(ord, name), 1, 1, 11, 0, 0, 0, 0, 1, 2, 5, 1, 0, 1, 0]
                                frames = [{'event': 'backendInitialized'}, {'event': 'operations', 'payload': operations}]
                                initialized = command['lease']
                            message = json.loads(command['args'].get('message', '{}'))
                            if message.get('event') == 'inspectElement':
                                frames.append({'event': 'inspectedElement', 'payload': {'id': 2, 'type': 'full-data', 'value': {'displayName': 'SyntheticCounter', 'props': {}, 'hooks': [{'name': 'State', 'value': 42}]}}})
                            device('result', id=command['id'], epoch=reply['epoch'], result={'ready': True, 'frames': [json.dumps(frame) for frame in frames], 'droppedFrames': 0})
                    except Exception as error:
                        if not stopping.is_set():
                            failures.append(type(error).__name__)
                worker = threading.Thread(target=pump, daemon=True)
                worker.start()
                lease_file = home / 'lease.json'
                lease_file.write_text(json.dumps({'lease': lease}))
                lease_file.chmod(0o600)
                metadata = subprocess.run([sys.executable, "-B", str(ROOT / "cli.py"), "--state", str(state), "status"], capture_output=True, timeout=5)
                self.assertEqual(metadata.returncode, 0)
                self.assertNotIn(lease.encode(), metadata.stdout)
                self.assertEqual(json.loads(metadata.stdout)["lease"], {"thread": "thread", "turn": "turn"})
                def inspect(command, output=None):
                    args = [sys.executable, '-B', str(ROOT / 'cli.py'), '--state', str(state), 'inspect', '--lease-file', str(lease_file), '--args', json.dumps(command)]
                    if output:
                        args += ['--output', str(output)]
                    return subprocess.run(args, capture_output=True, timeout=20)
                end = time.monotonic() + 8
                while time.monotonic() < end:
                    answer = inspect({'type': 'status'})
                    if answer.returncode == 0 and json.loads(answer.stdout)['data']['componentCount'] == 2:
                        break
                    time.sleep(0.05)
                self.assertEqual(answer.returncode, 0, answer.stderr.decode())
                self.assertEqual(json.loads(answer.stdout)['data']['componentCount'], 2)
                self.assertEqual(json.loads(answer.stdout)['data']['connectedApps'], 1)
                self.assertEqual((frontend_dir() / 'daemon.sock').stat().st_mode & 0o777, 0o600)
                self.assertEqual((state / 'react').stat().st_mode & 0o777, 0o700)
                conn = http.client.HTTPConnection('127.0.0.1', control('status')['reactFrontendPort'], timeout=5)
                conn.request('GET', '/', headers={'Upgrade': 'websocket', 'Connection': 'Upgrade', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='})
                self.assertEqual(conn.getresponse().status, 401)
                conn.close()
                self.assertNotEqual(inspect({'type': 'get-component', 'id': 2}).returncode, 0)
                output = home / 'component.json'
                self.assertEqual(inspect({'type': 'get-component', 'id': 2}, output).returncode, 0)
                self.assertEqual(json.loads(output.read_text())['data']['hooks'][0]['value'], 42)
                self.assertEqual(output.stat().st_mode & 0o777, 0o600)
                # Kill only this isolated provider: its failure must revoke control.
                provider = json.loads((frontend_dir() / 'daemon.json').read_text())
                os.kill(provider['pid'], signal.SIGTERM)
                end = time.monotonic() + 4
                while control('status')['lease'] and time.monotonic() < end:
                    time.sleep(0.05)
                self.assertIsNone(control('status')['lease'])
                self.assertEqual(control('status')['lastRelease']['reason'], 'react_frontend_stopped')
                end = time.monotonic() + 4
                while time.monotonic() < end:
                    acquired = control('acquire', rollout=str(rollout), thread='thread', turn='turn')
                    if 'id' in acquired:
                        break
                    self.assertEqual(acquired.get('error'), 'frontend_cleanup_in_progress')
                    time.sleep(0.05)
                lease = acquired['id']
                lease_file.write_text(json.dumps({'lease': lease}))
                end = time.monotonic() + 8
                while time.monotonic() < end:
                    answer = inspect({'type': 'status'})
                    if answer.returncode == 0 and json.loads(answer.stdout)['data']['componentCount'] == 2:
                        break
                    time.sleep(0.05)
                self.assertEqual(answer.returncode, 0, answer.stderr.decode())
                self.assertEqual(json.loads(answer.stdout)['data']['componentCount'], 2)
                with rollout.open('a') as f:
                    f.write(json.dumps({'type': 'event_msg', 'payload': {'type': 'task_complete', 'turn_id': 'turn'}}) + '\n')
                end = time.monotonic() + 4
                while (control('status')['lease'] or (frontend_dir() / 'daemon.sock').exists()) and time.monotonic() < end:
                    time.sleep(0.05)
                self.assertIsNone(control('status')['lease'])
                self.assertFalse(control('status')['reactFrontendRunning'])
                self.assertFalse((frontend_dir() / 'daemon.sock').exists())
                stopping.set()
                self.assertFalse(failures)
            finally:
                stopping.set()
                proc.terminate()
                proc.wait(5)
                if worker:
                    worker.join(5)
