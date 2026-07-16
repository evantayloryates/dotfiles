#!/usr/bin/env bash
# diag-05: quantify SYN drop rate — burst vs sequential, plus distinct stuck-socket count
set -u

RAW=$(ls -dt /tmp/claude-netdiag.* 2>/dev/null | head -1)

echo '=== 1. Distinct stuck sockets from previous capture (de-duped by src port) ==='
if [ -n "$RAW" ] && [ -f "$RAW/conns.log" ]; then
  echo "using $RAW"
  grep 'SYN_SENT' "$RAW/conns.log" | awk '{print $5}' | sort -u | wc -l \
    | xargs echo 'distinct SYN_SENT sockets:'
  grep 'ESTABLISHED' "$RAW/conns.log" | awk '{print $5}' | sort -u | wc -l \
    | xargs echo 'distinct ESTABLISHED sockets:'
  echo '--- stuck sockets by destination ---'
  grep 'SYN_SENT' "$RAW/conns.log" | awk '{split($5,a,"->"); print a[2]}' | sort | uniq -c | sort -rn | head -8
else
  echo '(previous raw data not found, skipping)'
fi

burst_test() {
  local host=$1 n=$2
  local tmp; tmp=$(mktemp)
  for i in $(seq 1 "$n"); do
    curl -s -o /dev/null --connect-timeout 8 -m 10 \
      -w '%{time_connect} %{exitcode}\n' "https://$host/" >> "$tmp" &
  done
  wait
  local ok fail
  ok=$(awk '$2==0' "$tmp" | wc -l | tr -d ' ')
  fail=$(awk '$2!=0' "$tmp" | wc -l | tr -d ' ')
  local avg p95
  avg=$(awk '$2==0 {s+=$1; c++} END {if(c) printf "%.3f", s/c; else print "n/a"}' "$tmp")
  printf '%-24s burst=%-3s ok=%-3s FAILED=%-3s avg_connect=%ss\n' "$host" "$n" "$ok" "$fail" "$avg"
  rm -f "$tmp"
}

echo
echo '=== 2. Parallel burst tests (mimics CLI behavior) ==='
for n in 10 25 50; do
  burst_test api.anthropic.com "$n"
  sleep 3
done
echo '--- control host ---'
burst_test www.google.com 25

echo
echo '=== 3. Sequential connects (control — should be ~100%) ==='
ok=0; fail=0
for i in $(seq 1 20); do
  if curl -s -o /dev/null --connect-timeout 5 https://api.anthropic.com/; then ok=$((ok+1)); else fail=$((fail+1)); fi
done
echo "sequential: ok=$ok fail=$fail"

echo
echo '=== 4. Interface health (en0 errors/drops) ==='
netstat -I en0 -d | head -3
netstat -s -p tcp 2>/dev/null | grep -iE 'retransmit|dropped|timeout' | head -8