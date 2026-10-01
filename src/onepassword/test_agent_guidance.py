import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('guidance', ROOT / 'sync-agent-guidance.py')
guidance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guidance)


class AgentGuidanceTests(unittest.TestCase):
    def test_replacement_preserves_other_sections_and_is_idempotent(self):
        old = '# Root\n\n## Before\nKeep before.\n\n## 1Password old\nObsolete.\n\n## After\nKeep after.\n'
        new = guidance.reconcile(old, '## 1Password shared\nNew contract.\n')
        self.assertIn('## Before\nKeep before.', new)
        self.assertTrue(new.endswith('## After\nKeep after.\n'))
        self.assertNotIn('Obsolete', new)
        self.assertEqual(new, guidance.reconcile(new, '## 1Password shared\nNew contract.\n'))

    def test_marked_update_preserves_exact_surroundings(self):
        old = 'prefix\n' + guidance.BEGIN + '\nold\n' + guidance.END + '\nsuffix\n'
        new = guidance.reconcile(old, 'new')
        self.assertEqual(new, 'prefix\n' + guidance.BEGIN + '\nnew\n' + guidance.END + '\nsuffix\n')

    def test_append_is_idempotent(self):
        new = guidance.reconcile('# Root\n', '## 1Password\nContract')
        self.assertEqual(new, guidance.reconcile(new, '## 1Password\nContract'))

    def test_ambiguous_sections_fail_closed(self):
        for text in [guidance.BEGIN, guidance.END, guidance.END + guidance.BEGIN,
                     guidance.BEGIN * 2 + guidance.END,
                     '## 1Password a\nA\n## 1Password b\nB\n']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                guidance.reconcile(text, 'new')
