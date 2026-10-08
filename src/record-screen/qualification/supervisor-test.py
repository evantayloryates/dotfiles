#!/usr/bin/env python3
"""Synthetic recovery tests: no SDK capture, native app, input or model."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

sys.dont_write_bytecode = True

helper = Path(__file__).with_name('probe-supervisor.py')
spec = importlib.util.spec_from_file_location('supervisor', helper)
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)


class SupervisorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='capture-supervisor-')
        self.root = Path(self.temp.name)
        self.admission = self.root / 'admission'

    def tearDown(self):
        self.temp.cleanup()

    def run_case(self, name, source, timeout=1):
        output = self.root / name
        result = supervisor.run_probe([sys.executable, '-c', source], output, self.admission, timeout)
        self.assertEqual(json.loads((output / 'result.json').read_text()), result)
        self.assertEqual((output / 'result.json').stat().st_mode & 0o777, 0o600)
        return result

    def test_success_failure_and_launch_error(self):
        self.assertEqual(self.run_case('ok', 'print("synthetic evidence")')['outcome'], 'completed')
        self.assertEqual(self.run_case('fail', 'raise SystemExit(4)')['exit_code'], 4)
        result = supervisor.run_probe(['/no-such-capture-test-helper'], self.root / 'missing', self.admission, 1)
        self.assertEqual(result['outcome'], 'launch_failed')

    def test_stall_force_stop_partial_evidence_and_recovery(self):
        result = self.run_case('stall', 'import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); print("partial evidence",flush=True); time.sleep(20)', .15)
        self.assertEqual(result['outcome'], 'deadline')
        self.assertTrue(result['child_reaped'])
        self.assertTrue(result['terminated_owned_group'])
        self.assertLess(result['elapsed_seconds'], 3)
        self.assertIn('partial evidence', (self.root / 'stall/stdout.log').read_text())
        self.assertEqual(self.run_case('recovered', 'pass')['outcome'], 'completed')

    def test_concurrent_admission_and_release(self):
        output = self.root / 'first'
        code = 'import time; print("ready",flush=True); time.sleep(1)'
        child = subprocess.Popen([sys.executable, str(helper), '--output', str(output), '--admission', str(self.admission), '--timeout', '3', '--', sys.executable, '-c', code], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline:
                if (output / 'stdout.log').exists() and 'ready' in (output / 'stdout.log').read_text():
                    break
                time.sleep(.01)
            else:
                self.fail('helper did not start')
            result = self.run_case('blocked', 'raise SystemExit(99)')
            self.assertEqual(result['outcome'], 'busy')
            self.assertNotIn('pid', result)
            stdout, stderr = child.communicate(timeout=4)
            self.assertEqual(child.returncode, 0, stderr)
            self.assertEqual(json.loads(stdout)['outcome'], 'completed')
            self.assertEqual(self.run_case('after', 'pass')['outcome'], 'completed')
        finally:
            if child.poll() is None:
                child.terminate(); child.communicate(timeout=3)

    def test_interrupted_supervisor_reaps_child_before_releasing_admission(self):
        output = self.root / 'interrupt'
        code = 'import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); print("ready",flush=True); time.sleep(20)'
        child = subprocess.Popen([sys.executable, str(helper), '--output', str(output), '--admission', str(self.admission), '--timeout', '30', '--', sys.executable, '-c', code], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline:
                if (output / 'stdout.log').exists() and 'ready' in (output / 'stdout.log').read_text():
                    break
                time.sleep(.01)
            else:
                self.fail('helper did not start')
            child.terminate()
            child.communicate(timeout=3)
            result = json.loads((output / 'result.json').read_text())
            self.assertEqual(result['outcome'], 'interrupted')
            self.assertTrue(result['child_reaped'])
            self.assertEqual(self.run_case('after-interrupt', 'pass')['outcome'], 'completed')
        finally:
            if child.poll() is None:
                child.kill(); child.communicate(timeout=3)


if __name__ == '__main__':
    unittest.main()
