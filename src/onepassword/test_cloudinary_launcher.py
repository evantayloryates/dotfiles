"""Synthetic launcher tests: no real broker, credentials, network, or package install."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

DOTFILES = Path(__file__).resolve().parents[2]


class CloudinaryLauncherTests(unittest.TestCase):
    def run_launcher(self, fail_at='', empty_at='', cloud='kickoff-test'):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for directory in ['src/mcps', 'src/lib', 'bin']:
                (root / directory).mkdir(parents=True)
            shutil.copy2(DOTFILES / 'src/mcps/kickoff-cloudinary-mcp', root / 'src/mcps/launcher')
            shutil.copy2(DOTFILES / 'src/lib/read-env.sh', root / 'src/lib/read-env.sh')
            (root / 'src/lib/resolve-binary.sh').write_text('resolve_binary() { printf "%s/bin/%s" "$DOTFILES_DIR" "$1"; }\n')
            (root / '.env').write_text('KICKOFF_CLOUDINARY_CLOUD_NAME=' + cloud + '\nUNRELATED_SECRET=should-not-load\n')
            op = root / 'bin/op'
            op.write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys
root = pathlib.Path(os.environ['DOTFILES_DIR'])
log = root / 'calls'
calls = json.loads(log.read_text()) if log.exists() else []
calls.append(sys.argv[1:]); log.write_text(json.dumps(calls))
n = str(len(calls))
if os.environ.get('FAIL_AT') == n: sys.exit(125)
if os.environ.get('EMPTY_AT') != n: print("synthetic-'$()-" + n, end='')
''')
            npx = root / 'bin/npx'
            npx.write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys
keys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'KICKOFF_CLOUDINARY_TOKEN', 'KICKOFF_CLOUDINARY_API_KEY', 'UNRELATED_SECRET']
(pathlib.Path(os.environ['DOTFILES_DIR']) / 'started').write_text(json.dumps({'argv':sys.argv[1:], 'env':{k:os.environ.get(k) for k in keys}}))
''')
            for p in [op, npx]: p.chmod(0o755)
            env = dict(os.environ, DOTFILES_DIR=tmp, FAIL_AT=fail_at, EMPTY_AT=empty_at,
                       KICKOFF_CLOUDINARY_TOKEN='obsolete', KICKOFF_CLOUDINARY_API_KEY='obsolete')
            env.pop('UNRELATED_SECRET', None)
            result = subprocess.run(['bash', str(root / 'src/mcps/launcher')], env=env, capture_output=True, text=True)
            calls = json.loads((root / 'calls').read_text()) if (root / 'calls').exists() else []
            started = json.loads((root / 'started').read_text()) if (root / 'started').exists() else None
            return result, calls, started

    def test_restricted_pair_is_private_scoped_and_quoted(self):
        result, calls, started = self.run_launcher()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, '')
        self.assertEqual(result.stderr, '')
        self.assertEqual(len(calls), 2)
        for call in calls:
            self.assertEqual(call[0], 'read')
            self.assertTrue(call[1].startswith('op://rr6wstyda3xmgnxzs4sb4m2elm/4fwm6odqkqhdpwr2iksg6nz2wm/'))
            self.assertEqual(call[2:], ['--account', 'my.1password.com', '--no-newline'])
        self.assertEqual(started['argv'], ['--yes', '@cloudinary/asset-management-mcp@0.11.0', 'start'])
        self.assertEqual(started['env']['CLOUDINARY_API_KEY'], "synthetic-'$()-1")
        self.assertEqual(started['env']['CLOUDINARY_API_SECRET'], "synthetic-'$()-2")
        for key in ['KICKOFF_CLOUDINARY_TOKEN', 'KICKOFF_CLOUDINARY_API_KEY', 'UNRELATED_SECRET']:
            self.assertIsNone(started['env'][key])

    def test_either_broker_failure_blocks_start_and_preserves_125(self):
        for position in ['1', '2']:
            with self.subTest(position=position):
                result, calls, started = self.run_launcher(fail_at=position)
                self.assertEqual(result.returncode, 125)
                self.assertEqual(len(calls), int(position))
                self.assertIsNone(started)
                self.assertNotIn('synthetic-', result.stdout + result.stderr)

    def test_empty_credentials_block_start_without_disclosure(self):
        for position in ['1', '2']:
            with self.subTest(position=position):
                result, _, started = self.run_launcher(empty_at=position)
                self.assertNotEqual(result.returncode, 0)
                self.assertIsNone(started)
                self.assertNotIn('synthetic-', result.stdout + result.stderr)

    def test_empty_cloud_blocks_credential_access(self):
        result, calls, started = self.run_launcher(cloud='')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])
        self.assertIsNone(started)
