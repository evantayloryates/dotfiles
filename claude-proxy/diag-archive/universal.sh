#!/usr/bin/env bash
# audit: confirm proxy setup made no system-wide changes
scutil --proxy | grep -E 'Enable.* : 1' && echo 'SYSTEM PROXY SET' || echo 'system proxies: clean'
grep -vE '^#|^$|localhost|broadcasthost' /etc/hosts || echo '/etc/hosts: clean'
sudo pfctl -sr 2>/dev/null | head -5 || echo 'pf: default/inactive'
launchctl getenv ANTHROPIC_BASE_URL || echo 'launchd env: clean'
lsof -iTCP:8787 -iTCP:8788 -sTCP:LISTEN -n 2>/dev/null || echo 'proxy: not currently running'