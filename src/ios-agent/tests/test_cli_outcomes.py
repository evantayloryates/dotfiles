"""Device rejections are failures, even when transport delivery completed."""
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import cli


class ActionOutcomeTests(unittest.TestCase):
    def invoke(self, result):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            lease = root / 'lease.json'
            lease.write_text(json.dumps({'lease': 'a' * 32}))
            lease.chmod(0o600)
            output = root / 'receipt.json'
            argv = ['ios-agent', 'action', 'tap', '--lease-file', str(lease),
                    '--output', str(output)]
            answer = {'id': 'accepted-command', 'status': 'completed', 'result': result}
            with patch('sys.argv', argv), patch.object(cli, 'request', side_effect=[
                    {'id': 'accepted-command'}, answer]) as rpc, contextlib.redirect_stdout(io.StringIO()):
                if not isinstance(result, dict) or 'error' in result:
                    with self.assertRaisesRegex(RuntimeError, '^device_action_rejected;'):
                        cli.main()
                else:
                    cli.main()
                self.assertEqual(rpc.call_count, 2)
                self.assertEqual(rpc.call_args_list[1].args[0]['id'], 'accepted-command')
                self.assertTrue(lease.exists())
                self.assertEqual(json.loads(output.read_text()), answer)
                self.assertEqual(output.stat().st_mode & 0o077, 0)

    def test_native_hit_test_rejection_is_failure_and_preserves_receipt(self):
        self.invoke({'error': 'hit_target_changed_or_occluded'})

    def test_malformed_completion_is_failure_without_replay(self):
        self.invoke(None)

    def test_confirmed_delivery_is_success(self):
        self.invoke({'delivered': True, 'commitVerified': False})
