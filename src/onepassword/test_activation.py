import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import activate_keepalive as activation

class ActivationTests(unittest.TestCase):
    def test_source_provenance_hash_matches_builder(self):
        source = activation.ROOT/'src/onepassword/keepalive.py'
        self.assertEqual(activation.hash_with_keepalive(source.read_bytes()), activation.source_hash())
        self.assertNotEqual(activation.hash_with_keepalive(b'changed'), activation.source_hash())

    def test_active_commands_or_ambiguous_child_prevent_activation(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp);runtime=home/'Library/Caches/com.taylor.op-agent';runtime.mkdir(parents=True)
            (runtime/'status.json').write_text(json.dumps({'pid':10,'tty':'fixture'}))
            rows=[['10','9','worker'],['11','9','/app/Contents/Resources/keepalive.py']]
            with patch.object(activation.Path,'home',return_value=home), patch.object(activation,'process_rows',return_value=rows):
                self.assertEqual(activation.inspect()[1],11)
                rows.append(['12','10','credential process'])
                with self.assertRaisesRegex(RuntimeError,'active'): activation.inspect()
                rows[-1]=['12','11','metadata process']
                with self.assertRaisesRegex(RuntimeError,'active'): activation.inspect()
                rows[-1]=['12','9','/other/Contents/Resources/keepalive.py']
                with self.assertRaisesRegex(RuntimeError,'uniquely'): activation.inspect()
