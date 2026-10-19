import plistlib
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from build_app import register_dev_callback


class CallbackScopeTests(unittest.TestCase):
    def test_staging_product_refused_without_mutation_or_signing(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            original = plistlib.dumps({'CFBundleIdentifier': 'com.kudos.fit.staging'})
            (root / 'Info.plist').write_bytes(original)
            with patch('build_app.subprocess.run') as run:
                with self.assertRaisesRegex(RuntimeError, 'dev_callback_product_required'):
                    register_dev_callback(root, root / 'log')
                run.assert_not_called()
            self.assertEqual((root / 'Info.plist').read_bytes(), original)

    def test_missing_original_identity_leaves_product_unmodified(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            original = plistlib.dumps({'CFBundleIdentifier': 'com.dev.kudos.fit'})
            (root / 'Info.plist').write_bytes(original)
            with patch('build_app.subprocess.run', side_effect=subprocess.TimeoutExpired('codesign', 30)):
                with self.assertRaises(subprocess.TimeoutExpired):
                    register_dev_callback(root, root / 'log')
            self.assertEqual((root / 'Info.plist').read_bytes(), original)


if __name__ == '__main__':
    unittest.main()
