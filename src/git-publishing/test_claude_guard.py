import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('claude_guard', Path(__file__).with_name('claude_guard.py'))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class ClaudeGuard(unittest.TestCase):
    def test_denies_unsafe_dotfiles_pushes(self):
        for cmd, cwd in [
            ('git push --force origin master', str(guard.REPO)),
            ('git push origin master -f', str(guard.REPO)),
            ('git push -vf origin master', str(guard.REPO)),
            ('git push origin +HEAD:master', str(guard.REPO)),
            ('git push --mirror origin', str(guard.REPO)),
            ('git push --no-force-with-lease origin master', str(guard.REPO)),
            ('git -C /Users/taylor/dotfiles push origin master --force', '/tmp'),
            ('/usr/bin/git -C /Users/taylor/src/github/dotfiles push -f', '/tmp'),
            ('cd /Users/taylor/dotfiles && git push -f', '/tmp'),
            ('git status\ngit push -f', str(guard.REPO)),
            ('git -C src -C .. push -f', str(guard.REPO)),
        ]:
            with self.subTest(cmd=cmd):
                self.assertTrue(guard.unsafe(cmd, cwd))

    def test_preserves_normal_commands_and_other_repositories(self):
        for cmd, cwd in [
            ('/Users/taylor/dotfiles/bin/dotfiles-publish', '/tmp'),
            ('git push origin master', str(guard.REPO)),
            ('git push --force-with-lease=refs/heads/master:abcd origin HEAD:master', str(guard.REPO)),
            ('git fetch origin master', str(guard.REPO)),
            ('git -C /Users/taylor/src/github/kickoff push --force origin example', str(guard.REPO)),
            ('git push -f', '/tmp'),
            ('echo "git push --force"', str(guard.REPO)),
            ('git log --format=%s', str(guard.REPO)),
        ]:
            with self.subTest(cmd=cmd):
                self.assertFalse(guard.unsafe(cmd, cwd))
