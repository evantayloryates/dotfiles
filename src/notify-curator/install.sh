#!/bin/bash
# Idempotent install of notify-curator (see README.md):
#   1. adds the SessionStart / Stop `ensure` hooks to ~/.claude/settings.json,
#   2. starts (or restarts onto current code) the daemon,
#   3. opens Claude's pane in System Settings > Notifications, where Taylor
#      sets the alert style to None. That switch is his to make; the daemon
#      stays in shadow mode until it sees it.
set -euo pipefail
BIN=/Users/taylor/dotfiles/bin/notify-curator

/usr/bin/python3 - "$BIN" <<'EOF'
import json, os, shutil, sys, time
cmd = f'{sys.argv[1]} ensure'
p = os.path.expanduser('~/.claude/settings.json')
d = json.load(open(p)) if os.path.exists(p) else {}
hooks = d.setdefault('hooks', {})
changed = False
for event in ('SessionStart', 'Stop'):
    groups = hooks.setdefault(event, [])
    if not any(cmd in h.get('command', '') for g in groups for h in g.get('hooks', [])):
        groups.append({'hooks': [{'type': 'command', 'command': cmd, 'timeout': 10}]})
        changed = True
if changed:
    if os.path.exists(p):
        shutil.copy2(p, p + time.strftime('.bak-notify-curator-%Y%m%d-%H%M%S'))
    tmp = p + '.tmp'
    with open(tmp, 'w') as f:
        f.write(json.dumps(d, indent=2) + '\n')
    json.load(open(tmp))
    os.replace(tmp, p)
print('hooks:', 'added' if changed else 'already present')
EOF

"$BIN" ensure
sleep 1
"$BIN" status -n 0
if [ "${1:-}" != --no-open ]; then
  open "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=com.anthropic.claudefordesktop"
fi
