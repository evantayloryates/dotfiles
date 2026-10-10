#!/usr/bin/env python3
"""Install dotfiles Git defaults and scoped Codex/Claude publishing guards."""
import json
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

# Global registration also covers Claude chats started in another repository.
# The hook itself acts only on direct pushes targeting the dotfiles checkout.
claude_settings = Path.home() / '.claude/settings.json'
settings = json.loads(claude_settings.read_text()) if claude_settings.exists() else {}
hook = {'matcher': 'Bash', 'hooks': [{
    'type': 'command',
    'command': f'python3 "{source / "claude_guard.py"}"',
    'timeout': 5,
}]}
pre = settings.setdefault('hooks', {}).setdefault('PreToolUse', [])
if hook not in pre:
    pre.append(hook)
    claude_settings.parent.mkdir(parents=True, exist_ok=True)
    if claude_settings.exists():
        shutil.copy2(claude_settings, claude_settings.with_name('settings.before-dotfiles-' + str(time.time_ns()) + '.json.bak'))
    claude_settings.write_text(json.dumps(settings, indent=2) + '\n')
print('Claude dotfiles guard installed; existing hooks and permission preferences preserved.')
