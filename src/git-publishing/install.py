#!/usr/bin/env python3
"""Install only dotfiles Git defaults and its scoped Codex publishing rule."""
from pathlib import Path
import shutil
import subprocess
import time

repo = Path(__file__).resolve().parents[2]
source = repo / 'src/git-publishing'
config = source / 'repository.gitconfig'
# Keep other includes/config and existing hooks intact.
existing = subprocess.run(['git', '-C', str(repo), 'config', '--local', '--get-all', 'include.path'], capture_output=True, text=True).stdout.splitlines()
if str(config) not in existing:
    subprocess.run(['git', '-C', str(repo), 'config', '--local', '--add', 'include.path', str(config)], check=True)
rules = Path.home() / '.codex/rules/dotfiles.rules'
rules.parent.mkdir(parents=True, exist_ok=True)
target = source / 'dotfiles.rules'
if rules.is_symlink() and rules.resolve() == target:
    print('Git defaults and Codex dotfiles rule already installed.')
else:
    if rules.exists() or rules.is_symlink():
        backup = rules.with_name('dotfiles.rules.before-' + str(time.time_ns()) + '.bak')
        shutil.copy2(rules, backup)
        rules.unlink()
    rules.symlink_to(target)
    print('Installed repo-local Git defaults and versioned Codex dotfiles rule. Existing sessions require policy reload/restart.')
