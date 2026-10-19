"""Private broker ownership check never emits its capability."""
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import cli

class OwnershipTests(unittest.TestCase):
    def test_matching_replaced_and_absent_owner_return_only_boolean(self):
        for active, expected in [({'id':'private-capability'},True),({'id':'replacement'},False),(None,False)]:
            with tempfile.TemporaryDirectory() as directory:
                file=Path(directory)/'lease.json'
                file.write_text(json.dumps({'lease':'private-capability'}));file.chmod(0o600)
                with patch('sys.argv',['ios-agent','owner-check','--lease-file',str(file)]), patch.object(cli,'request',return_value={'lease':active}) as rpc,contextlib.redirect_stdout(io.StringIO()) as out:
                    cli.main()
                    self.assertEqual(json.loads(out.getvalue()),{'owned':expected})
                    self.assertEqual(rpc.call_args.args[0],{'op':'status'})
                    self.assertTrue(file.exists())

    def test_malformed_or_unavailable_status_never_confirms_ownership(self):
        for active in [{},{'lease':{}},None,TimeoutError('deadline')]:
            with tempfile.TemporaryDirectory() as directory:
                file=Path(directory)/'lease.json'
                file.write_text(json.dumps({'lease':'private-capability'}));file.chmod(0o600)
                with patch('sys.argv',['ios-agent','owner-check','--lease-file',str(file)]),patch.object(cli,'request',side_effect=active if isinstance(active,Exception) else None,return_value=active),contextlib.redirect_stdout(io.StringIO()) as out:
                    with self.assertRaises((RuntimeError,TimeoutError)):cli.main()
                    self.assertEqual(out.getvalue(),'')
