#!/usr/bin/env bash
# diag-01: connectivity, DNS, and TLS sanity check
set -u

hosts=(api.anthropic.com api.openai.com chatgpt.com claude.ai statsig.anthropic.com sentry.io)

echo '=== 1. Gateway & baseline ==='
route -n get default 2>/dev/null | grep -E 'gateway|interface' || ip route 2>/dev/null | head -2
ping -c 3 -t 5 1.1.1.1 2>&1 | tail -2

echo
echo '=== 2. DNS resolution (system vs public resolver) ==='
for h in "${hosts[@]}"; do
  sys=$(dig +short +time=3 "$h" | head -1)
  pub=$(dig +short +time=3 "$h" @1.1.1.1 | head -1)
  printf '%-28s system=%-16s 1.1.1.1=%s\n' "$h" "${sys:-FAIL}" "${pub:-FAIL}"
done

echo
echo '=== 3. TLS handshake & cert issuer (MITM check) ==='
for h in api.anthropic.com api.openai.com; do
  echo "--- $h ---"
  echo | timeout 10 openssl s_client -connect "$h:443" -servername "$h" 2>/dev/null \
    | openssl x509 -noout -issuer -subject -dates 2>/dev/null || echo 'TLS HANDSHAKE FAILED'
done

echo
echo '=== 4. HTTPS request timing ==='
for h in api.anthropic.com api.openai.com; do
  curl -s -o /dev/null -m 15 -w "$h  http=%{http_code}  dns=%{time_namelookup}s  tls=%{time_appconnect}s  total=%{time_total}s\n" "https://$h/"
done