#!/usr/bin/env bash
# cleanup: stop the relay, archive scripts, purge temp data — keep port-plan inputs
set -euo pipefail

echo '--- 1. stop caddy (open wildcard bind, no longer needed while off guest wifi) ---'
~/.claude-netfix-min/stop.sh
sleep 1
lsof -iTCP:8787 -iTCP:8788 -sTCP:LISTEN -n 2>/dev/null && echo 'WARN: something still listening' || echo 'ports clear'

echo '--- 2. archive desktop diagnostic scripts into the future proxy home ---'
mkdir -p ~/dotfiles/claude-proxy/diag-archive
mv ~/Desktop/diag-cc-*.sh ~/Desktop/setup-proxy.sh ~/Desktop/verify-proxy.sh ~/Desktop/universal.sh \
  ~/dotfiles/claude-proxy/diag-archive/ 2>/dev/null || true
ls ~/dotfiles/claude-proxy/diag-archive/

echo '--- 3. purge raw capture data ---'
rm -rf /tmp/claude-netdiag.*

echo '--- 4. kept (intentionally) ---'
echo '  ~/.claude-netfix-min/       -> port plan copies Caddyfile from here, agent tears it down (migration step 6)'
echo '  brew caddy                  -> go.sh runtime dependency'
echo '  ~/dotfiles/claude-proxy/diag-archive/ -> delete after port if you want'
echo
echo 'done — nothing left running, nothing routing through a proxy'