import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from install_claude_hooks import install
from register_mcp import write_atomic


class HookInstallTests(unittest.TestCase):
    def test_merge_preserves_permissions_and_foreign_hooks_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'settings.json'
            original = {'permissions': {'defaultMode': 'default'}, 'other': True,
                        'hooks': {'Stop': [{'hooks': [{'type': 'command', 'command': 'existing'}]}]}}
            path.write_text(json.dumps(original))
            old = path.read_bytes()
            self.assertEqual(install(path, True)['addedEntries'], 4)
            self.assertEqual(path.read_bytes(), old)
            self.assertTrue(install(path)['changed'])
            data = json.loads(path.read_text())
            self.assertEqual(data['permissions'], original['permissions'])
            self.assertEqual(data['hooks']['Stop'][0], original['hooks']['Stop'][0])
            self.assertNotIn('SubagentStop', data['hooks'])
            self.assertIn('--main-agent-only', data['hooks']['PreToolUse'][0]['hooks'][0]['args'])
            self.assertEqual(install(path)['addedEntries'], 0)

    def test_invalid_existing_event_leaves_file_untouched(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'settings.json'
            path.write_text('{"hooks":{"Stop":true}}')
            old = path.read_bytes()
            with self.assertRaises(ValueError): install(path)
            self.assertEqual(path.read_bytes(), old)

    def test_concurrent_writer_is_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'settings.json'
            path.write_bytes(b'{"newer":true}')
            with self.assertRaises(ValueError):
                write_atomic(path, '{}', expected_previous=b'{"older":true}')
            self.assertEqual(path.read_bytes(), b'{"newer":true}')


if __name__ == '__main__': unittest.main()
