#!/usr/bin/env bash
# diag-10: penalty onset curve + decay-timer test
set -u

burst3() {
  local tmp; tmp=$(mktemp)
  for i in 1 2 3; do
    curl -s -o /dev/null --connect-timeout 6 -m 8 -w '%{exitcode}\n' \
      https://api.anthropic.com/ >> "$tmp" &
  done
  wait
  echo "$(grep -c '^0$' "$tmp")/3"
  rm -f "$tmp"
}
new_conns() { netstat -s -p tcp | awk '/connection requests/ {print $1; exit}'; }
est() { netstat -an -p tcp | awk '$NF=="ESTABLISHED" && $5 !~ /^127\./ {e++} END {print e+0}'; }

echo '=== PHASE A: fresh association, watch penalty onset ==='
networksetup -setairportpower en0 off; sleep 5
networksetup -setairportpower en0 on
for i in $(seq 1 30); do ping -c1 -t1 192.168.2.1 >/dev/null 2>&1 && break; sleep 1; done
base=$(new_conns)
for i in $(seq 1 12); do
  printf '%s  +%-5sconns  est=%-4s burst=%s\n' \
    "$(date +%H:%M:%S)" "$(( $(new_conns) - base ))" "$(est)" "$(burst3)"
  sleep 15
done

echo
echo '=== PHASE B: stay associated + quiet — does the penalty decay? ==='
echo '(6 min, probing every 90s — do not open apps)'
for i in $(seq 1 4); do
  sleep 90
  printf '%s  +%-5sconns  est=%-4s burst=%s\n' \
    "$(date +%H:%M:%S)" "$(( $(new_conns) - base ))" "$(est)" "$(burst3)"
done