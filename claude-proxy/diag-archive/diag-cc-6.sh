#!/usr/bin/env bash
# diag-07: is this device its own noisy neighbor?
set -u

echo '=== 1. radio link quality ==='
sudo wdutil info 2>/dev/null | grep -iE 'RSSI|noise|Tx Rate|channel|PHY' | head -6

echo
echo '=== 2. TOTAL outbound sessions this machine holds right now ==='
netstat -an -p tcp | awk '$NF=="ESTABLISHED" && $5 !~ /^127\./ {e++}
  $NF=="SYN_SENT" {s++} END {print "established(external): " e+0, "  syn_sent: " s+0}'

echo
echo '=== 3. top 12 processes by external connection count ==='
lsof -iTCP -n -P 2>/dev/null | grep -v '127.0.0.1' | grep -vE 'LISTEN' \
  | awk '{print $1}' | sort | uniq -c | sort -rn | head -12

echo
echo '=== 4. UDP sockets (QUIC/HTTP3 also consume NAT slots) ==='
lsof -iUDP -n -P 2>/dev/null | grep -v '127.0.0.1' | awk '{print $1}' \
  | sort | uniq -c | sort -rn | head -6

echo
echo '=== 5. DHCP identity ==='
ifconfig en0 | grep ether
ipconfig getpacket en0 2>/dev/null | grep -E 'yiaddr|lease|server_identifier'

echo
echo '=== 6. burst5 baseline for this run (compare after any change) ==='
tmp=$(mktemp)
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -m 10 -w '%{exitcode}\n' https://api.anthropic.com/ >> "$tmp" &
done
wait
echo "ok=$(grep -c '^0$' "$tmp") failed=$(grep -cv '^0$' "$tmp")"
rm -f "$tmp"