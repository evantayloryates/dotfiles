#!/usr/bin/python3
"""Integration tests with a fake op; never open a real vault or auth prompt."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import time
import unittest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE))
from op_agent import client
from install import install_shells, LINE

FAKE = '''#!/usr/bin/python3
import json, os, subprocess, sys, time
from pathlib import Path
mode = sys.argv[1]
if mode == 'inspect':
    fd = os.open('/dev/tty', os.O_RDWR)
    tty = os.ttyname(fd)
    os.close(fd)
    mask = os.umask(0o077)
    os.umask(mask)
    print(json.dumps({'sid': os.getsid(0), 'tty': tty, 'cwd': os.getcwd(), 'value': os.environ.get('TEST_VALUE'), 'args': sys.argv[2:], 'umask': mask}))
elif mode == 'streams':
    sys.stdout.buffer.write(sys.stdin.buffer.read())
    sys.stderr.buffer.write(b'error-stream\\x00\\xff')
    sys.exit(23)
elif mode == 'sleep':
    Path(sys.argv[2]).write_text(str(os.getpid()))
    time.sleep(60)
elif mode == 'nested':
    code = "import sys; from pathlib import Path; sys.path.insert(0, sys.argv[1]); from op_agent import client; sys.exit(client(['inspect'], Path(sys.argv[2])))"
    sys.exit(subprocess.call(['/usr/bin/python3', '-B', '-c', code, sys.argv[2], sys.argv[3]]))
'''


class BrokerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='op-test-', dir='/tmp')
        self.root = Path(self.temp.name)
        self.runtime = self.root / 'runtime'
        fake = self.root / 'fake-op'
        fake.write_text(FAKE)
        fake.chmod(0o700)
        self.service = subprocess.Popen(['/usr/bin/python3', '-B', str(HERE / 'op_agent.py'), 'serve', '--runtime', str(self.runtime), '--executable', str(fake)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.clients = []
        self.wait_for(self.runtime / 'status.json')

    def tearDown(self):
        self.service.terminate()
        self.service.communicate(timeout=5)
        for proc in self.clients:
            if proc.poll() is None:
                proc.kill()
            proc.communicate(timeout=5)
        self.temp.cleanup()

    def wait_for(self, path):
        for _ in range(100):
            if path.exists() and path.stat().st_size:
                return
            if self.service.poll() is not None:
                self.fail('Broker exited during startup')
            time.sleep(0.02)
        self.fail('Timed out waiting for ' + str(path))

    def start(self, args, **kwargs):
        code = "import sys; from pathlib import Path; sys.path.insert(0, sys.argv[1]); from op_agent import client; sys.exit(client(sys.argv[3:], Path(sys.argv[2])))"
        proc = subprocess.Popen(['/usr/bin/python3', '-B', '-c', code, str(HERE), str(self.runtime)] + args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs)
        self.clients.append(proc)
        return proc

    def inspect(self, **kwargs):
        proc = self.start(['inspect', 'space arg', '$(literal)', ''], **kwargs)
        out, err = proc.communicate(timeout=5)
        self.assertEqual((proc.returncode, err), (0, b''))
        return json.loads(out)

    def test_shared_terminal_and_per_request_context(self):
        env = dict(os.environ, TEST_VALUE='first')
        first = self.inspect(cwd=self.root, env=env, umask=0o027)
        second = self.inspect(cwd=HERE, env=dict(os.environ, TEST_VALUE='second'))
        self.assertEqual(first['sid'], second['sid'])
        self.assertEqual(first['tty'], second['tty'])
        self.assertEqual(first['cwd'], str(self.root.resolve()))
        self.assertEqual(second['cwd'], str(HERE))
        self.assertEqual((first['value'], second['value']), ('first', 'second'))
        self.assertEqual(first['args'], ['space arg', '$(literal)', ''])
        self.assertEqual(first['umask'], 0o027)
        self.assertEqual(self.runtime.stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.runtime / 'agent.sock').stat().st_mode & 0o777, 0o600)

    def test_binary_stdio_and_exit_code(self):
        proc = self.start(['streams'])
        payload = bytes(range(256)) * 4096
        out, err = proc.communicate(payload, timeout=5)
        self.assertEqual((out, err, proc.returncode), (payload, b'error-stream\x00\xff', 23))

    def test_signal_cancels_command_and_next_request_works(self):
        ready = self.root / 'ready'
        proc = self.start(['sleep', str(ready)])
        self.wait_for(ready)
        proc.send_signal(signal.SIGTERM)
        proc.communicate(timeout=5)
        self.assertEqual(proc.returncode, 143)
        self.inspect()

    def test_disconnect_cancels_command(self):
        ready = self.root / 'ready'
        proc = self.start(['sleep', str(ready)])
        self.wait_for(ready)
        child = int(ready.read_text())
        proc.kill()
        proc.communicate(timeout=5)
        self.inspect()
        with self.assertRaises(ProcessLookupError):
            os.kill(child, 0)

    def test_queued_cancel_does_not_execute(self):
        ready, queued = self.root / 'first', self.root / 'queued'
        first = self.start(['sleep', str(ready)])
        self.wait_for(ready)
        second = self.start(['sleep', str(queued)])
        time.sleep(0.2)
        second.send_signal(signal.SIGTERM)
        second.communicate(timeout=5)
        self.assertEqual(second.returncode, 143)
        self.assertIsNone(first.poll())
        first.send_signal(signal.SIGTERM)
        first.communicate(timeout=5)
        self.assertFalse(queued.exists())
        self.inspect()

    def test_nested_invocations_do_not_deadlock(self):
        proc = self.start(['nested', str(HERE), str(self.runtime)])
        out, err = proc.communicate(timeout=5)
        self.assertEqual((proc.returncode, err), (0, b''))
        self.assertEqual(json.loads(out)['sid'], self.inspect()['sid'])

    def test_second_daemon_cannot_replace_socket(self):
        result = subprocess.run(['/usr/bin/python3', '-B', str(HERE / 'op_agent.py'), 'serve', '--runtime', str(self.runtime), '--executable', str(self.root / 'fake-op')], capture_output=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.inspect()

    def test_malformed_request_does_not_break_service(self):
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as conn:
            conn.connect(str(self.runtime / 'agent.sock'))
            self.assertEqual(conn.recv(1), b'R')
            conn.sendall(b'X')
            self.assertEqual(struct.unpack('!i', conn.recv(4))[0], 125)
        self.inspect()

    def test_unavailable_broker_fails_without_fallback(self):
        self.service.terminate()
        self.service.communicate(timeout=5)
        proc = self.start(['inspect'])
        out, err = proc.communicate(timeout=5)
        self.assertEqual((proc.returncode, out), (125, b''))
        self.assertIn(b'Refusing direct-CLI fallback', err)


class ShellTests(unittest.TestCase):
    def test_hooks_are_idempotent_and_do_not_shadow_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            (home / 'dotfiles').symlink_to(ROOT)
            (home / '.profile').write_text('# existing customization\n')
            install_shells(home)
            originals = {p.name: p.read_text() for p in home.glob('.*') if p.is_file()}
            self.assertEqual(install_shells(home), 0)
            self.assertEqual(originals, {p.name: p.read_text() for p in home.glob('.*') if p.is_file()})
            self.assertFalse((home / '.bash_profile').exists())
            self.assertTrue((home / '.profile').read_text().startswith('# existing customization\n'))
            for shell, mode in [('/bin/zsh', '-c'), ('/bin/zsh', '-lc'), ('/bin/zsh', '-ic'), ('/bin/zsh', '-lic'), ('/bin/bash', '-lc'), ('/bin/bash', '-ic'), ('/bin/sh', '-lc')]:
                result = subprocess.run([shell, mode, 'command -v op'], env={'HOME': str(home), 'PATH': '/opt/homebrew/bin:/usr/bin:/bin', 'TERM': 'dumb'}, capture_output=True, text=True, timeout=10)
                self.assertEqual(result.stdout.strip(), str(home / 'dotfiles/bin/op'), (shell, mode, result.stderr))

    def test_path_deduplication_and_inherited_direct_processes(self):
        snippet = ROOT / 'src/path/overrides.sh'
        expected = str(Path.home() / 'dotfiles/bin')
        for shell in ('/bin/zsh', '/bin/bash', '/bin/sh'):
            command = 'PATH="$2"; . "$1"; . "$1"; /usr/bin/printenv PATH'
            result = subprocess.run([shell, '-c', command, '_', str(snippet), '/usr/bin:' + expected + ':/bin:' + expected], env={'HOME': str(Path.home()), 'PATH': '/usr/bin:' + expected + ':/bin:' + expected}, capture_output=True, text=True, timeout=5)
            self.assertEqual(result.stdout.strip(), expected + ':/usr/bin:/bin')


if __name__ == '__main__':
    unittest.main(verbosity=2)
