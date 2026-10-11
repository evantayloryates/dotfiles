import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1] / 'signals.py'


class SignalsTest(unittest.TestCase):
    def test_context_and_fail_open(self):
        with tempfile.TemporaryDirectory() as state:
            code = f"""import importlib.util, json, pathlib
s=importlib.util.spec_from_file_location('signals',{str(SOURCE)!r}); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
with m.signal_context(requestId='1234567890abcdef1234567890abcdef'):
 assert m.emit_signal('host','request.accepted',tool='ios_action',ready=True,attemptCount=1)
 assert 'requestId' in m.signal_context_environment()['IOS_AGENT_SIGNAL_CONTEXT']
assert m.emit_signal('host','request.done',outcome='accepted')
rows=[json.loads(line) for p in (m.DIR).glob('*.jsonl') for line in p.read_text().splitlines()]
assert len(rows)==2 and rows[0]['requestId']=='1234567890abcdef1234567890abcdef'
assert 'requestId' not in rows[1]
"""
            result = subprocess.run([sys.executable, '-B', '-c', code], env={**os.environ, 'IOS_AGENT_SIGNAL_STATE_DIR':state}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
        with tempfile.TemporaryDirectory() as state:
            # A missing root must fail open and never create an arbitrary replacement.
            code = f"""import importlib.util
s=importlib.util.spec_from_file_location('signals',{str(SOURCE)!r}); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
assert m.emit_signal('host','request.accepted') is False
"""
            result = subprocess.run([sys.executable, '-B', '-c', code], env={**os.environ, 'IOS_AGENT_SIGNAL_STATE_DIR':str(Path(state)/'missing')}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
