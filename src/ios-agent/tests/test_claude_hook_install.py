import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from install_claude_hooks import install, SOURCE
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

    def test_owned_legacy_matcher_migrates_once_without_duplicate_or_foreign_changes(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'settings.json'
            data = json.loads(SOURCE.read_text())
            entry = data['hooks']['PreToolUse'][0]
            entry['matcher'] = '^mcp__ios-agent__ios_(begin|web_begin|system_begin)$'
            foreign = {'matcher': 'foreign', 'hooks': [{'type': 'command', 'command': 'preserve'}]}
            data['hooks']['PreToolUse'].append(foreign)
            data['permissions'] = {'defaultMode': 'default'}
            path.write_text(json.dumps(data))
            original = path.read_bytes()
            self.assertEqual(install(path, True)['updatedEntries'], 1)
            self.assertEqual(path.read_bytes(), original)
            result = install(path)
            self.assertEqual(result['updatedEntries'], 1)
            self.assertEqual(result['addedEntries'], 0)
            actual = json.loads(path.read_text())
            self.assertEqual(actual['permissions'], data['permissions'])
            self.assertEqual(actual['hooks']['PreToolUse'][1], foreign)
            self.assertEqual(actual['hooks']['PreToolUse'][0], json.loads(SOURCE.read_text())['hooks']['PreToolUse'][0])
            self.assertFalse(install(path)['changed'])

    def test_concurrent_writer_is_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'settings.json'
            path.write_bytes(b'{"newer":true}')
            with self.assertRaises(ValueError):
                write_atomic(path, '{}', expected_previous=b'{"older":true}')
            self.assertEqual(path.read_bytes(), b'{"newer":true}')

    def test_owned_cleanup_budget_migrates_and_already_present_entry_is_deduplicated(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'settings.json'
            expected = json.loads(SOURCE.read_text())
            data = json.loads(json.dumps(expected))
            for event in ('Stop', 'StopFailure', 'SessionEnd'):
                data['hooks'][event][0]['hooks'][0]['timeout'] = 90
                if event == 'Stop': data['hooks'][event].append(expected['hooks'][event][0])
            path.write_text(json.dumps(data))
            self.assertEqual(install(path)['updatedEntries'], 3)
            self.assertEqual(json.loads(path.read_text()), expected)
            self.assertFalse(install(path)['changed'])


if __name__ == '__main__': unittest.main()
