#!/usr/bin/env bash
# diag-09: live session-count vs burst-success monitor (quit apps while it runs)
set -u
burst5() {
  local tmp; tmp=$(mktemp)
  for i in 1 2 3 4 5; do
    curl -s -o /dev/null --connect-timeout 8 -m 10 -w '%{exitcode}\n' \
      https://api.anthropic.com/ >> "$tmp" &
  done
  wait
  echo "ok=$(grep -c '^0$' "$tmp")/5"
  rm -f "$tmp"
}
echo 'quit Docker Desktop, Cursor, spare browser windows one at a time...'
for i in $(seq 1 12); do
  s=$(netstat -an -p tcp | awk '$NF=="ESTABLISHED" && $5 !~ /^127\./ {e++} END {print e+0}')
  printf '%s  sessions=%-4s burst=%s\n' "$(date +%H:%M:%S)" "$s" "$(burst5)"
  sleep 25
done