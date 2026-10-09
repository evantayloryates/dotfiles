#!/usr/bin/env python3
"""Register only this local MCP entry, preserving unrelated harness configuration."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

LAUNCHER = Path.home() / 'dotfiles/bin/ios-agent-mcp'


def write_atomic(path, content):
    path = path.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    old = path.read_bytes() if path.exists() else None
    if old is not None:
        # Private backup; never print the rest of these secret-bearing configs.
        fd, backup = tempfile.mkstemp(prefix=path.name + '.bak.ios-agent-', dir=path.parent)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(old)
    fd, temporary = tempfile.mkstemp(prefix=path.name + '.ios-agent-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(content)
        if (path.read_bytes() if path.exists() else None) != old:
            raise ValueError('configuration_changed_during_registration')
        Path(temporary).replace(path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def codex(path, dry=False):
    text = path.read_text() if path.exists() else ''
    match = re.search(r'^\[mcp_servers\.ios-agent\]\s*\n([\s\S]*?)(?=^\[|\Z)', text, re.M)
    command = str(LAUNCHER)
    if match:
        expected = 'command = ' + json.dumps(command)
        if expected not in match.group(1):
            raise ValueError('existing_ios_agent_command_differs')
        return 'already_registered'
    if not dry:
        write_atomic(path, text.rstrip() + '\n\n[mcp_servers.ios-agent]\ncommand = ' + json.dumps(command) + '\ntool_timeout_sec = 150.0\n')
        if json.dumps(command) not in path.read_text().split('[mcp_servers.ios-agent]', 1)[1]:
            raise ValueError('registration_readback_failed')
    return 'would_register' if dry else 'registered_readback_passed'


def json_config(path, kind, dry=False):
    if not path.exists():
        return 'not_installed_config_absent'
    data = json.loads(path.read_text())
    if kind == 'opencode':
        section, entry = 'mcp', {'type': 'local', 'command': [str(LAUNCHER)], 'enabled': True, 'timeout': 150000}
    else:
        section, entry = 'mcpServers', {'command': str(LAUNCHER), 'args': []}
    current = data.get(section, {}).get('ios-agent')
    if current is not None:
        if current != entry:
            raise ValueError('existing_ios_agent_entry_differs')
        return 'already_registered'
    data.setdefault(section, {})['ios-agent'] = entry
    if not dry:
        write_atomic(path, json.dumps(data, indent=2) + '\n')
        if json.loads(path.read_text())[section]['ios-agent'] != entry:
            raise ValueError('registration_readback_failed')
    return 'would_register' if dry else 'registered_readback_passed'


def claude(home, dry=False):
    # Read scoped registration metadata only; never print the global config.
    file = home / '.claude.json'
    if file.exists():
        entry = json.loads(file.read_text()).get('mcpServers', {}).get('ios-agent')
        if entry:
            if entry.get('command') != str(LAUNCHER):
                raise ValueError('existing_ios_agent_command_differs')
            return 'already_registered'
    executable = shutil.which('claude')
    if not executable:
        return 'claude_cli_absent'
    if dry:
        return 'would_register'
    result = subprocess.run([executable, 'mcp', 'add', 'ios-agent', '-s', 'user', '--', str(LAUNCHER)],
                            capture_output=True, timeout=30, cwd=home)
    if result.returncode or not file.exists() or json.loads(file.read_text()).get('mcpServers', {}).get('ios-agent', {}).get('command') != str(LAUNCHER):
        raise ValueError('claude_registration_failed')
    return 'registered_readback_passed'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    home = Path.home()
    targets = {'codex': lambda: codex(home / '.codex/config.toml', args.dry_run),
               'claude-code': lambda: claude(home, args.dry_run),
               'claude-desktop': lambda: json_config(home / 'Library/Application Support/Claude/claude_desktop_config.json', 'desktop', args.dry_run),
               'cursor': lambda: json_config(home / '.cursor/mcp.json', 'cursor', args.dry_run),
               'opencode': lambda: json_config(home / '.config/opencode/opencode.json', 'opencode', args.dry_run)}
    statuses = {}
    for name, action in targets.items():
        try:
            statuses[name] = action()
        except (OSError, ValueError, subprocess.SubprocessError):
            statuses[name] = 'registration_failed_existing_config_preserved'
    print(json.dumps({'dryRun': args.dry_run, 'targets': statuses}))
    return int(any(s.startswith('registration_failed') for s in statuses.values()))


if __name__ == '__main__':
    raise SystemExit(main())
