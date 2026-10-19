#!/bin/sh
# Runs every scenario suite in order; prints one line per suite and a total.
cd "$(dirname "$0")/.."
# Suites must never alert Taylor: alerts only go to state/notifications.log.
export ANCHOR_ALERT_BACKEND=log
# Tests never touch real state: their own state folder and fixture services.
export ANCHOR_STATE_DIR="${ANCHOR_STATE_DIR:-$HOME/.cache/anchor-lab/test-state}"
export ANCHOR_SERVICES_DIR="${ANCHOR_SERVICES_DIR:-$PWD/test/services}"
total=0; failed=0
for s in basic supervision recovery persistence policy channels tickets fixer headless modern alerts gateway pins discovery dashboard "$@"; do
  out=$(timeout 600 node test/scenarios-$s.mjs 2>&1 | grep -E "^FAIL|[0-9]+/[0-9]+ passed" | tr '\n' ' ')
  echo "$s: $out"
  case "$out" in *FAIL*|"") failed=$((failed+1));; esac
done
pkill -9 -f "mcps/anchor/src/daemon.mjs --state $ANCHOR_STATE_DIR" 2>/dev/null
sleep 1
echo "leftover: services $(pgrep -f mcps/anchor/src/service-host.mjs | wc -l | tr -d ' '), fixers $(pgrep -f 'fixer-headless|fake-headless|fake-fixer|fake-driver' | wc -l | tr -d ' ')"
echo "SUITES_FAILED=$failed"
