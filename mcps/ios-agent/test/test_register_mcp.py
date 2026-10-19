import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from register_mcp import codex, json_config, LAUNCHER, write_atomic


class RegistrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_json_preserves_other_servers_and_is_idempotent(self):
        path = self.root / 'config.json'
        original = {'other': True, 'mcpServers': {'existing': {'command': 'sentinel'}}}
        path.write_text(json.dumps(original))
        self.assertEqual(json_config(path, 'desktop'), 'registered_readback_passed')
        updated = json.loads(path.read_text())
        self.assertEqual(updated['mcpServers']['existing'], original['mcpServers']['existing'])
        self.assertTrue(updated['other'])
        first = path.read_bytes()
        self.assertEqual(json_config(path, 'desktop'), 'already_registered')
        self.assertEqual(path.read_bytes(), first)
        self.assertEqual(path.stat().st_mode & 0o077, 0)

    def test_different_entry_refused_and_dry_run_does_not_write(self):
        path = self.root / 'config.json'
        path.write_text(json.dumps({'mcpServers': {'ios-agent': {'command': 'other'}}}))
        first = path.read_bytes()
        with self.assertRaises(ValueError): json_config(path, 'desktop')
        self.assertEqual(path.read_bytes(), first)
        toml = self.root / 'config.toml'
        self.assertEqual(codex(toml, dry=True), 'would_register')
        self.assertFalse(toml.exists())

    def test_codex_target_only_and_private_backup(self):
        path = self.root / 'config.toml'
        original = '[other]\nmode = "sentinel"\n'
        path.write_text(original)
        self.assertEqual(codex(path), 'registered_readback_passed')
        self.assertTrue(path.read_text().startswith(original))
        self.assertEqual(codex(path), 'already_registered')
        backup = next(self.root.glob('*.bak.ios-agent-*'))
        self.assertEqual(backup.read_text(), original)
        self.assertEqual(backup.stat().st_mode & 0o077, 0)

    def test_symlink_config_updates_actual_target_preserving_link(self):
        actual = self.root / 'actual.json'; actual.write_text('{}')
        link = self.root / 'link.json'; link.symlink_to(actual)
        json_config(link, 'desktop')
        self.assertTrue(link.is_symlink())
        self.assertEqual(json.loads(actual.read_text())['mcpServers']['ios-agent']['command'], str(LAUNCHER))
