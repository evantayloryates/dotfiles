#!/usr/bin/env python3
"""Merge qualified main-agent cleanup hooks, preserving other Claude settings."""
import argparse
import json
from pathlib import Path
from register_mcp import write_atomic

SOURCE = Path(__file__).resolve().parent / 'mcp/claude-hooks.json'


def install(path, dry=False):
    previous = path.read_bytes() if path.exists() else None
    before = json.loads(previous) if previous is not None else {}
    if not isinstance(before, dict) or not isinstance(before.get('hooks', {}), dict):
        raise ValueError('existing_hook_configuration_invalid')
    expected = json.loads(SOURCE.read_text())['hooks']
    data = json.loads(json.dumps(before))
    hooks = data.setdefault('hooks', {})
    added = 0
    for event, entries in expected.items():
        current = hooks.setdefault(event, [])
        if not isinstance(current, list):
            raise ValueError('existing_hook_event_invalid')
        for entry in entries:
            if entry not in current:
                current.append(entry)
                added += 1
    if added and not dry:
        write_atomic(path, json.dumps(data, indent=2) + '\n', expected_previous=previous)
        if json.loads(path.read_text()) != data:
            raise ValueError('hook_install_readback_failed')
    return {'addedEntries': added, 'dryRun': dry,
            'scope': 'Claude Code main agent; children require explicit end',
            'changed': bool(added and not dry), 'permissionSettingsChanged': False,
            'takesEffect': 'new Claude Code sessions; active sessions untouched'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    print(json.dumps(install(Path.home() / '.claude/settings.json', args.dry_run)))
