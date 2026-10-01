"""Selector ordering, path resolution and copy/action behavior without app launches."""
import contextlib
import io
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import dir_selector as selector
import pathfuncs_actions as actions


class SelectorActionsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'root with spaces'
        self.root.mkdir()
        # Names deliberately differ from mtime order.
        self.names = ['golf', 'alpha', 'foxtrot', 'bravo', 'echo', 'charlie', 'delta']
        for i, name in enumerate(self.names):
            directory = self.root / name
            directory.mkdir()
            (directory / 'SKILL.md').write_text('fixture\n')
            os.utime(directory, (100 + i, 100 + i))
        (self.root / '.hidden').mkdir()
        self.env = patch.dict(os.environ, {'NO_COLOR': '1'})
        self.env.start()
        self.addCleanup(self.env.stop)
        os.environ.pop('PATHFUNCS_SELECT_QUERY', None)
        os.environ.pop('PATHFUNCS_SELECT_QUERIES', None)

    def run_picker(self, kind, query, *, interactive=False):
        out, ui = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(ui), \
                patch.object(actions, 'emit_copied') as copied:
            if interactive:
                with patch.object(selector, 'read_query', return_value=query):
                    code = actions.main([kind, str(self.root)])
            else:
                os.environ['PATHFUNCS_SELECT_QUERY'] = query
                code = actions.main([kind, str(self.root)])
        return code, copied, out.getvalue(), ui.getvalue()

    def test_shared_five_recents_layout_and_numbering(self):
        for kind in ('skills', 'conversations', 'html'):
            with self.subTest(kind=kind):
                for name in self.names:
                    (self.root / name / 'index.html').write_text('<html></html>')
                    i = self.names.index(name)
                    os.utime(self.root / name, (100 + i, 100 + i))
                code, copied, _, ui = self.run_picker(kind, '1', interactive=True)
                self.assertEqual(code, 0)
                all_lines, recent_lines = ui.split('Recent:')
                self.assertEqual(all_lines.strip().splitlines(), [
                    'All:', '12) alpha', '11) bravo', '10) charlie', ' 9) delta',
                    ' 8) echo', ' 7) foxtrot', ' 6) golf'])
                self.assertEqual(recent_lines.strip().splitlines(), [
                    '5) foxtrot', ' 4) bravo', ' 3) echo', ' 2) charlie', ' 1) delta'])
                suffix = {'skills': '/SKILL.md', 'html': '/index.html', 'conversations': ''}[kind]
                copied.assert_called_once_with(str(self.root / 'delta') + suffix)

    def test_all_and_recent_numbers_select_the_displayed_paths(self):
        items = selector.scan_items(str(self.root), dirs_only=True)
        all_items = sorted(items, key=lambda it: it.name.lower())
        recents = selector.recent_subset(items, 5)
        by_number = selector.build_numbering(all_items, recents)
        for number, item in by_number.items():
            code, copied, _, _ = self.run_picker('conversations', str(number))
            self.assertEqual(code, 0)
            copied.assert_called_once_with(item.path)
        self.assertEqual(by_number[1].name, 'delta')
        self.assertEqual(by_number[5].name, 'foxtrot')

    def test_small_lists_and_no_recent_items(self):
        items = selector.scan_items(str(self.root), dirs_only=True)[:2]
        recent = selector.recent_subset(items, 5)
        self.assertEqual(len(recent), 2)
        self.assertEqual(len(selector.build_numbering(items, recent)), 4)
        self.assertEqual(selector.recent_subset(items, 0), [])
        self.assertEqual(selector.recent_subset([], 5), [])

    def test_copy_skill_file_or_missing_file_directory(self):
        code, copied, _, _ = self.run_picker('skills', 'alph')
        self.assertEqual(code, 0)
        copied.assert_called_once_with(str(self.root / 'alpha/SKILL.md'))
        (self.root / 'alpha/SKILL.md').unlink()
        code, copied, _, ui = self.run_picker('skills', 'alph')
        self.assertEqual(code, 0)
        copied.assert_called_once_with(str(self.root / 'alpha'))
        self.assertIn('SKILL.md missing', ui)

    def test_conversations_only_lists_visible_directories(self):
        (self.root / 'not-a-conversation.txt').write_text('fixture')
        code, copied, _, ui = self.run_picker('conversations', 'not-a')
        self.assertEqual(code, 1)
        copied.assert_not_called()
        self.assertIn('No match', ui)
        self.assertEqual({it.name for it in selector.scan_items(str(self.root), dirs_only=True)},
                         set(self.names))
        with contextlib.chdir(self.root.parent):
            items = selector.scan_items(self.root.name, dirs_only=True)
        self.assertTrue(all(os.path.isabs(it.path) for it in items))

    def test_cancel_invalid_and_ambiguous_queries_never_copy(self):
        for query in ('', '0', '999', 'no-such-item', 'b'):
            if query == 'b':
                (self.root / 'brave').mkdir()
            for kind in ('skills', 'conversations'):
                with self.subTest(query=query, kind=kind):
                    code, copied, out, _ = self.run_picker(kind, query)
                    self.assertEqual(code, 1)
                    copied.assert_not_called()
                    self.assertEqual(out, '')
        for directory in self.root.iterdir():
            if directory.is_dir():
                for child in directory.iterdir():
                    child.unlink()
                directory.rmdir()
        code, copied, _, ui = self.run_picker('conversations', '1')
        self.assertEqual(code, 1)
        copied.assert_not_called()
        self.assertIn('No conversations found', ui)

    def test_explicit_selection_actions_emit_protocol_without_copying(self):
        for kind, suffix in (('skills', '/SKILL.md'), ('conversations', '')):
            code, copied, out, _ = self.run_picker(kind, 'alph open -a Example')
            self.assertEqual(code, 0)
            copied.assert_not_called()
            self.assertEqual(out.splitlines(), ['__PATHFUNCS_RUN__', 'open -a Example',
                                               str(self.root / 'alpha') + suffix])

    def test_html_still_resolves_index_hint_single_and_nested_choice(self):
        target = self.root / 'alpha'
        (target / 'one.html').write_text('one')
        code, copied, _, _ = self.run_picker('html', 'alph')
        self.assertEqual(code, 0)
        copied.assert_called_once_with(str(target / 'one.html'))
        self.assertEqual((target / '.hint').read_text(), 'one.html\n')
        (target / 'two.html').write_text('two')
        self.assertEqual(actions.resolve_html_in_dir(str(target)), str(target / 'one.html'))
        (target / '.hint').write_text('../escape.html\n')
        os.environ['PATHFUNCS_SELECT_QUERIES'] = 'alph\ntwo'
        out, ui = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(ui), \
                patch.object(actions, 'emit_copied') as copied:
            self.assertEqual(actions.run_html(str(self.root)), 0)
        copied.assert_called_once_with(str(target / 'two.html'))
        (target / 'index.html').write_text('index')
        self.assertEqual(actions.resolve_html_in_dir(str(target)), str(target / 'index.html'))

    def test_clipboard_receives_bare_absolute_path(self):
        out = io.StringIO()
        target = str(self.root / 'alpha')
        with patch('subprocess.run') as run, contextlib.redirect_stdout(out):
            selector.emit_copied(target)
        run.assert_called_once_with(['/usr/bin/pbcopy'], input=target.encode(), check=False)
        self.assertEqual(out.getvalue(), target + ' (copied)\n')


if __name__ == '__main__':
    unittest.main()
