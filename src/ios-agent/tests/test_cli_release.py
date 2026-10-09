"""Cleanup after automatic retirement never revokes a replacement owner."""
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import cli


class ReleaseTests(unittest.TestCase):
    def invoke(self, answer, expected=None):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'lease.json'
            path.write_text(json.dumps({'lease': 'a' * 32}))
            path.chmod(0o600)
            with patch('sys.argv', ['ios-agent', 'release', '--lease-file', str(path)]), \
                 patch.object(cli, 'request', side_effect=[RuntimeError('lease_required'), answer]) as rpc, \
                 contextlib.redirect_stdout(io.StringIO()) as output:
                if expected is None:
                    with self.assertRaisesRegex(RuntimeError, 'release_state_unconfirmed'):
                        cli.main()
                    self.assertTrue(path.exists())
                else:
                    cli.main()
                    self.assertFalse(path.exists())
                    self.assertEqual(json.loads(output.getvalue()), expected)
                self.assertEqual(rpc.call_args_list[1].args[0], {'op': 'status'})
                self.assertEqual(rpc.call_count, 2)

    def test_retired_lease_cleanup(self):
        self.invoke({'lease': None}, {'released': False, 'alreadyInactive': True, 'otherOwnerActive': False})

    def test_replacement_owner_preserved(self):
        self.invoke({'lease': {'id': 'b' * 32}}, {'released': False, 'alreadyInactive': True, 'otherOwnerActive': True})

    def test_contradictory_or_unknown_state_retains_file(self):
        for answer in ({'lease': {'id': 'a' * 32}}, {}, {'lease': {}}, None):
            with self.subTest(answer=answer):
                self.invoke(answer)

    def test_transport_failure_retains_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'lease.json'
            path.write_text(json.dumps({'lease': 'a' * 32})); path.chmod(0o600)
            with patch('sys.argv', ['ios-agent', 'release', '--lease-file', str(path)]), \
                 patch.object(cli, 'request', side_effect=TimeoutError('control_response_deadline_exceeded')):
                with self.assertRaises(TimeoutError):
                    cli.main()
                self.assertTrue(path.exists())
