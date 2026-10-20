"""Exercise desktop cache guard and offline migration without touching host config."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('installer', Path(__file__).with_name('install-client-registrations.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class DesktopInstallTests(unittest.TestCase):
    def test_running_guard_and_offline_preservation(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            (home/'.codex').mkdir()
            (home/'.codex/config.toml').write_text('model = "preserve"\n')
            (home/'.claude.json').write_text('{"privateState":true}')
            desktop = home/'Library/Application Support/Claude/claude_desktop_config.json'
            desktop.parent.mkdir(parents=True)
            original = {'preferences': {'keep': True}, 'mcpServers': {'unrelated': {'command': 'keep'}, 'gmail-work-primary': {'command': 'old'}}}
            desktop.write_text(json.dumps(original))
            manifest = {'codex': {}, 'claude': {}, 'claude-desktop': {'gmail-personal-primary': {'command': '/local/gmail', 'args': ['personal-primary']}}, 'removed_servers': {'claude': ['gmail-work-primary']}}
            (home/'client-registrations.json').write_text(json.dumps(manifest))
            with patch.object(m,'ROOT',home), patch.object(m.Path,'home',return_value=home), patch('sys.argv',['installer','--apply']):
                with patch.object(m.subprocess,'run',return_value=SimpleNamespace(returncode=0)):
                    with self.assertRaisesRegex(SystemExit,'No files changed'):m.main()
                self.assertEqual(json.loads(desktop.read_text()),original)
                with patch('sys.argv',['installer','--apply','--desktop-later']), patch.object(m.subprocess,'run',side_effect=AssertionError('desktop-later should not check app')):m.main()
                self.assertEqual(json.loads(desktop.read_text()),original)
                with patch.object(m.subprocess,'run',return_value=SimpleNamespace(returncode=1)):m.main()
                installed=json.loads(desktop.read_text())
                self.assertEqual(installed['preferences'],original['preferences'])
                self.assertEqual(installed['mcpServers']['unrelated'],original['mcpServers']['unrelated'])
                self.assertNotIn('gmail-work-primary',installed['mcpServers'])
                self.assertIn('gmail-personal-primary',installed['mcpServers'])
                canonical=home/'canonical.json';desktop.rename(canonical);desktop.symlink_to(canonical)
                with patch.object(m.subprocess,'run',side_effect=AssertionError('idempotent plan should not check app')):m.main()
                self.assertTrue(desktop.is_symlink())

if __name__=='__main__':unittest.main()
