#!/usr/bin/env bash
# cleanup-audit: read-only inventory of everything today's diagnostics left behind
set -u

echo '=== 1. caddy proxy process ==='
lsof -iTCP:8787 -iTCP:8788 -sTCP:LISTEN -n -P 2>/dev/null || echo '(not running)'
pgrep -fl 'caddy run' || true

echo
echo '=== 2. minimal install dir ==='
ls -la ~/.claude-netfix-min/ 2>/dev/null || echo '(gone/never created)'

echo
echo '=== 3. ~/.claude/settings.json — proxy env block applied? ==='
python3 -c '
import json, os
p = os.path.expanduser("~/.claude/settings.json")
d = json.load(open(p))
env = d.get("env", {})
hits = {k: v for k, v in env.items() if "127.0.0.1:87" in str(v) or k == "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"}
print(json.dumps(hits, indent=2) if hits else "(clean — no proxy overrides)")
'
ls -la ~/.claude/settings.json.bak-netfix 2>/dev/null || echo '(no backup file — fix-02 likely never ran)'

echo
echo '=== 4. current shell env pollution ==='
env | grep -E '^(ANTHROPIC_BASE_URL|OPENAI_BASE_URL|CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)=' \
  || echo '(clean)'

echo
echo '=== 5. shell rc references ==='
grep -n 'claude-netfix' ~/.zshrc ~/.zprofile ~/.bashrc 2>/dev/null || echo '(none)'

echo
echo '=== 6. diagnostic scripts on Desktop ==='
ls -la ~/Desktop/diag-cc-*.sh ~/Desktop/setup-proxy.sh ~/Desktop/verify-proxy.sh ~/Desktop/universal.sh 2>/dev/null \
  || echo '(none found)'

echo
echo '=== 7. raw capture data in /tmp ==='
ls -d /tmp/claude-netdiag.* 2>/dev/null || echo '(none)'

echo
echo '=== 8. homebrew caddy (installed today for this) ==='
brew list --versions caddy 2>/dev/null || echo '(not installed)'

echo
echo '=== 9. wifi identity state ==='
ifconfig en0 | grep ether
networksetup -getairportnetwork en0 2>/dev/null || true