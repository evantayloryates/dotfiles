#!/usr/bin/env bash
# diag-08: state-reset vs identity-reset discrimination
# WARNING: this toggles wifi — you'll drop off the network for ~15s.
set -u

burst5() {
  local tmp; tmp=$(mktemp)
  for i in 1 2 3 4 5; do
    curl -s -o /dev/null --connect-timeout 8 -m 10 -w '%{exitcode}\n' \
      https://api.anthropic.com/ >> "$tmp" &
  done
  wait
  echo "ok=$(grep -c '^0$' "$tmp") failed=$(grep -cv '^0$' "$tmp")"
  rm -f "$tmp"
}
sessions() {
  netstat -an -p tcp | awk '$NF=="ESTABLISHED" && $5 !~ /^127\./ {e++} END {print e+0}'
}

echo "=== A. baseline: sessions=$(sessions), burst: $(burst5) ==="

echo
echo '=== B. wifi cycle (same MAC, fresh gateway state) ==='
networksetup -setairportpower en0 off
sleep 5
networksetup -setairportpower en0 on
echo -n 'waiting for gateway'
for i in $(seq 1 30); do
  ping -c1 -t1 192.168.2.1 >/dev/null 2>&1 && break
  echo -n '.'; sleep 1
done
echo ' reconnected'
ifconfig en0 | grep ether
ipconfig getifaddr en0

echo "B1. immediately (sessions=$(sessions)): $(burst5)"
echo 'waiting 60s for apps to re-establish their connections...'
sleep 60
echo "B2. after 60s (sessions=$(sessions)): $(burst5)"