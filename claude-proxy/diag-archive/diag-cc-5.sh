#!/usr/bin/env bash
# diag-06: which network, proxy alive, config overrides, gentle direct test
set -u

echo '=== 1. network identity ==='
ipconfig getsummary en0 2>/dev/null | awk -F': ' '/ SSID :/{print "ssid:"$2}'
route -n get default 2>/dev/null | grep gateway
# gateway 192.168.2.1 = building guest wifi

echo
echo '=== 2. proxy state ==='
lsof -iTCP:8787 -sTCP:LISTEN -n -P 2>/dev/null || echo 'proxy NOT running'

echo
echo '=== 3. claude code global settings overrides ==='
python3 -c '
import json
try:
  d = json.load(open("'"$HOME"'/.claude/settings.json"))
  keys = {k: d[k] for k in ("env", "apiBaseUrl") if k in d}
  print(json.dumps(keys, indent=2) if keys else "(no env/baseUrl overrides)")
except Exception as e:
  print("(could not read settings.json:", e, ")")
'

echo
echo '=== 4. direct API health — sequential + SMALL burst only (5) ==='
curl -s -o /dev/null -m 10 -w 'sequential: http=%{http_code} total=%{time_total}s\n' https://api.anthropic.com/
tmp=$(mktemp)
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -m 10 -w '%{exitcode}\n' https://api.anthropic.com/ >> "$tmp" &
done
wait
echo "burst5: ok=$(grep -c '^0$' "$tmp") failed=$(grep -cv '^0$' "$tmp")"
rm -f "$tmp"

echo
echo '=== 5. does the embedded claude process carry a BASE_URL? ==='
for p in $(pgrep -f claude 2>/dev/null); do
  ps eww -p "$p" 2>/dev/null | tr ' ' '\n' | grep -m1 '^ANTHROPIC_BASE_URL=' \
    && echo "  ^ pid $p"
done
echo '(no output above = embedded sessions going direct, as suspected)'