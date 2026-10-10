#!/usr/bin/env python3
"""No-prompt Claude guard for direct unsafe dotfiles pushes.

Checks ordinary shell statements, cwd/cd and Git -C. Not an adversarial shell
sandbox: aliases, generated scripts and nested shell interpreters are outside
this guard. The fixed publisher enforces the full fetch/rebase/lease workflow.
"""
import json
from pathlib import Path
import shlex
import sys

REPO = Path(__file__).resolve().parents[2]
BAD_FLAGS = {'--force', '-f', '--mirror', '--no-force-with-lease'}


def unsafe(command, cwd):
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=';&|\n')
        lexer.whitespace = ' \t\r'
        lexer.whitespace_split = True
        tokens = list(lexer)
    except ValueError:
        return False  # Leave shell syntax errors to Bash; never execute here.
    statements, statement = [], []
    for token in tokens:
        if token and all(c in ';&|\n' for c in token):
            statements.append(statement)
            statement = []
        else:
            statement.append(token)
    statements.append(statement)
    directory = Path(cwd).expanduser().resolve()
    for args in statements:
        if not args:
            continue
        if args[0] == 'cd' and len(args) == 2:
            directory = (directory / Path(args[1]).expanduser()).resolve()
            continue
        if Path(args[0]).name != 'git':
            continue
        target = directory
        i = 1
        while i < len(args):
            if args[i] == '-C' and i + 1 < len(args):
                target = (target / Path(args[i + 1]).expanduser()).resolve()
                i += 2
            elif args[i] == '-c' and i + 1 < len(args):
                i += 2
            elif args[i].startswith('-C') and len(args[i]) > 2:
                target = (target / Path(args[i][2:]).expanduser()).resolve()
                i += 1
            else:
                break
        if not target.is_relative_to(REPO) or args[i:i + 1] != ['push']:
            continue
        flags = args[i + 1:]
        if any(a in BAD_FLAGS or a.startswith(('--force=', '--mirror='))
               or (a.startswith('-') and not a.startswith('--') and 'f' in a[1:])
               or a.startswith('+') for a in flags):
            return True
    return False


def main():
    event = json.load(sys.stdin)
    if event.get('tool_name') != 'Bash':
        return
    if unsafe(event.get('tool_input', {}).get('command', ''), event.get('cwd', '.')):
        print(json.dumps({'hookSpecificOutput': {
            'hookEventName': 'PreToolUse',
            'permissionDecision': 'deny',
            'permissionDecisionReason': 'Unleased force/mirror/+ref push to dotfiles is forbidden. Use /Users/taylor/dotfiles/bin/dotfiles-publish; it fetches, rebases and publishes with an explicit expected-SHA lease. No human approval is needed for that workflow.',
        }}))


if __name__ == '__main__':
    main()
