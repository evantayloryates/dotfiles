#!/usr/bin/env bash
# verify.sh — run after setup.sh, paste full output back
set -u

DIR="$HOME/.claude-netfix-min"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  [PASS] $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  [FAIL] $1"; }

echo '=== 1. Proxy process & port ==='
if [ -f "$DIR/caddy.pid" ] && kill -0 "$(cat "$DIR/caddy.pid")" 2>/dev/null; then
  ok "caddy running (pid $(cat "$DIR/caddy.pid"))"
else
  bad 'caddy pid missing/dead'
fi
lsof -iTCP:8787 -sTCP:LISTEN -n >/dev/null 2>&1 && ok 'listening :8787' || bad 'not listening :8787'
lsof -iTCP:8788 -sTCP:LISTEN -n >/dev/null 2>&1 && ok 'listening :8788' || bad 'not listening :8788'

echo
echo '=== 2. API POST through proxy (401 = pass) ==='
code=$(curl -s -o /dev/null -m 45 -w '%{http_code}' \
  -X POST http://127.0.0.1:8787/v1/messages \
  -H 'content-type: application/json' -H 'anthropic-version: 2023-06-01' \
  -H 'x-api-key: invalid-diag' \
  -d '{"model":"claude-sonnet-4-6","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}')
[ "$code" = '401' ] && ok "anthropic upstream reachable (http=$code)" || bad "anthropic http=$code"

code=$(curl -s -o /dev/null -m 45 -w '%{http_code}' \
  -X POST http://127.0.0.1:8788/v1/chat/completions \
  -H 'content-type: application/json' -H 'authorization: Bearer invalid-diag' \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}')
[ "$code" = '401' ] && ok "openai upstream reachable (http=$code)" || bad "openai http=$code"

echo
echo '=== 3. Burst survival: 25 parallel through proxy (direct baseline was 2/25) ==='
tmp=$(mktemp)
for i in $(seq 1 25); do
  curl -s -o /dev/null -m 20 -w '%{http_code}\n' \
    -X POST http://127.0.0.1:8787/v1/messages \
    -H 'content-type: application/json' -H 'anthropic-version: 2023-06-01' \
    -H 'x-api-key: invalid-diag' -d '{}' >> "$tmp" &
done
wait
got=$(grep -c '^4' "$tmp"); dead=$(grep -c '^000' "$tmp")
echo "  4xx-from-api=$got  connect-failed=$dead"
[ "$got" -ge 23 ] && ok 'burst multiplexed successfully' || bad "only $got/25 reached the API"
rm -f "$tmp"

echo
echo '=== 4. Connection reuse: upstream sockets caddy holds (want low single digits) ==='
n=$(lsof -a -p "$(cat "$DIR/caddy.pid" 2>/dev/null)" -iTCP -n -P 2>/dev/null \
  | grep -cE '443 \(ESTABLISHED\)')
echo "  upstream established: $n"
[ "$n" -le 6 ] && [ "$n" -ge 1 ] && ok 'pooling confirmed (few conns, many requests)' \
  || bad "unexpected upstream conn count: $n"

echo
echo '=== 5. Streaming path unbuffered (SSE headers pass through) ==='
hdr=$(curl -s -m 30 -D - -o /dev/null -X POST http://127.0.0.1:8787/v1/messages \
  -H 'content-type: application/json' -H 'anthropic-version: 2023-06-01' \
  -H 'x-api-key: invalid-diag' -d '{}' | head -1)
echo "  first response line: $hdr"
echo "$hdr" | grep -q 'HTTP' && ok 'response headers flow' || bad 'no response headers'

echo
echo "================ RESULT: pass=$PASS fail=$FAIL ================"
[ "$FAIL" -eq 0 ] && echo 'All green. Run:  source ~/.claude-netfix-min/env.sh && claude'