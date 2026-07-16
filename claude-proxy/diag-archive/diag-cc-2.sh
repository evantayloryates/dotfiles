#!/usr/bin/env bash
# diag-02: proxy env, IPv6, HTTP/2, actual API POST, and streaming stability
set -u

echo '=== 1. Proxy-related environment ==='
env | grep -iE 'proxy|ssl_cert|node_extra|requests_ca' || echo '(none set)'
scutil --proxy | grep -E 'Enable|Proxy' | grep -v ' 0$' || echo '(no system proxies enabled)'

echo
echo '=== 2. IPv6 check ==='
dig +short AAAA api.anthropic.com | head -2
curl -6 -s -o /dev/null -m 10 -w 'ipv6: http=%{http_code} total=%{time_total}s\n' https://api.anthropic.com/ 2>&1 || echo 'ipv6: FAILED/unavailable'
curl -4 -s -o /dev/null -m 10 -w 'ipv4: http=%{http_code} total=%{time_total}s\n' https://api.anthropic.com/

echo
echo '=== 3. HTTP/2 vs HTTP/1.1 ==='
curl --http2 -s -o /dev/null -m 10 -w 'h2:   http=%{http_code} ver=%{http_version} total=%{time_total}s\n' https://api.anthropic.com/v1/messages
curl --http1.1 -s -o /dev/null -m 10 -w 'h1.1: http=%{http_code} ver=%{http_version} total=%{time_total}s\n' https://api.anthropic.com/v1/messages

echo
echo '=== 4. Real API POST (expects 401 auth error — that means it got through) ==='
curl -s -m 20 -w '\n--> http=%{http_code} total=%{time_total}s\n' \
  -X POST https://api.anthropic.com/v1/messages \
  -H 'content-type: application/json' \
  -H 'anthropic-version: 2023-06-01' \
  -H 'x-api-key: invalid-key-diagnostic' \
  -d '{"model":"claude-sonnet-4-6","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}' | head -5

echo
echo '=== 5. Long-lived connection test (30s SSE hold — does the network kill it?) ==='
start=$(date +%s)
curl -s -N -m 35 https://stream.wikimedia.org/v2/stream/recentchange -o /dev/null \
  -w 'sse: http=%{http_code} bytes=%{size_download} total=%{time_total}s\n'
echo "elapsed: $(( $(date +%s) - start ))s (if <30 and total<30, connection was cut early)"

echo
echo '=== 6. Node version + how node sees the network ==='
node --version 2>/dev/null || echo 'node not found in this shell'
node -e 'fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).then(r=>console.log("node fetch: http="+r.status)).catch(e=>console.log("node fetch FAILED:",e.cause?.code||e.message))' 2>/dev/null