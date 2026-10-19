#!/usr/bin/env python3
"""Merge and migrate qualified main-agent hooks, preserving other Claude settings."""
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
    updated = 0
    for event, entries in expected.items():
        current = hooks.setdefault(event, [])
        if not isinstance(current, list):
            raise ValueError('existing_hook_event_invalid')
        for entry in entries:
            # Replace only our exact prior entry. Foreign/mixed hooks and
            # permission settings are preserved, including concurrent edits.
            legacy = json.loads(json.dumps(entry))
            if event == 'PreToolUse':
                legacy['matcher'] = '^mcp__ios-agent__ios_(begin|web_begin|system_begin)$'
            elif event in ('Stop', 'StopFailure'):
                for hook in legacy.get('hooks', []):
                    if hook.get('type') == 'mcp_tool' and hook.get('server') == 'ios-agent' and hook.get('tool') == 'ios_harness_end':
                        hook['timeout'] = 90
            if legacy != entry and legacy in current:
                if entry in current:
                    current.remove(legacy)
                else:
                    current[current.index(legacy)] = entry
                updated += 1
            if entry not in current:
                current.append(entry)
                added += 1
    # Retired: SessionEnd. Claude Code cannot make MCP calls at SessionEnd (the
    # client is gone), so this hook failed on every exit; the server's own
    # disconnect cleanup retires the connection's sessions instead.
    removed = 0
    for entry in list(hooks.get('SessionEnd', [])):
        ours = [h for h in entry.get('hooks', []) if h.get('type') == 'mcp_tool' and h.get('server') == 'ios-agent' and h.get('tool') == 'ios_harness_end']
        if ours and len(ours) == len(entry.get('hooks', [])):
            hooks['SessionEnd'].remove(entry)
            removed += 1
    if 'SessionEnd' in hooks and not hooks['SessionEnd']:
        del hooks['SessionEnd']
    updated += removed
    if (added or updated) and not dry:
        write_atomic(path, json.dumps(data, indent=2) + '\n', expected_previous=previous)
        if json.loads(path.read_text()) != data:
            raise ValueError('hook_install_readback_failed')
    return {'addedEntries': added, 'updatedEntries': updated, 'removedSessionEnd': removed, 'dryRun': dry,
            'scope': 'Claude Code main agent; children require explicit end',
            'changed': bool((added or updated) and not dry), 'permissionSettingsChanged': False,
            'takesEffect': 'new Claude Code sessions; active sessions untouched'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    print(json.dumps(install(Path.home() / '.claude/settings.json', args.dry_run)))
