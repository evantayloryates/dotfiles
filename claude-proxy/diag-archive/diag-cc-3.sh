#!/usr/bin/env bash
# diag-04: passive 60s network capture of Claude Desktop app activity
# Usage: start this, then immediately kick off your test thread in the app.
set -u

DURATION=60
INTERVAL=2
OUT=$(mktemp -d /tmp/claude-netdiag.XXXX)
echo "collecting to $OUT for ${DURATION}s — go trigger the test thread now..."

# Find Claude Desktop PIDs (main + helpers), excluding this script/grep
get_pids() {
  pgrep -f '[C]laude' | while read -r p; do
    ps -o comm= -p "$p" 2>/dev/null | grep -qiE 'claude' && echo "$p"
  done
}

PIDS=$(get_pids | tr '\n' ',' | sed 's/,$//')
if [ -z "$PIDS" ]; then
  echo 'ERROR: no Claude Desktop processes found. Is the app running?'
  exit 1
fi
echo "watching PIDs: $PIDS"

# 1. nettop sampling in background (per-process bytes/connections)
nettop -P -L $((DURATION / 5)) -s 5 -p "${PIDS//,/ -p }" > "$OUT/nettop.csv" 2>/dev/null &
NETTOP_PID=$!

# 2. lsof polling loop — capture every TCP connection the app opens
END=$(( $(date +%s) + DURATION ))
while [ "$(date +%s)" -lt "$END" ]; do
  # re-discover pids in case helpers spawn mid-test
  CUR=$(get_pids | tr '\n' ',' | sed 's/,$//')
  [ -n "$CUR" ] && lsof -a -p "$CUR" -iTCP -P -n 2>/dev/null \
    | awk -v t="$(date +%H:%M:%S)" 'NR>1 {print t, $1, $2, $8, $9, $10}' >> "$OUT/conns.log"
  sleep "$INTERVAL"
done
wait "$NETTOP_PID" 2>/dev/null

echo
echo '################ REPORT ################'

echo
echo '=== A. Unique remote endpoints contacted (with state summary) ==='
awk '{split($5, a, "->"); if (a[2] != "") print a[2], $6}' "$OUT/conns.log" \
  | sort | uniq -c | sort -rn | head -25

echo
echo '=== B. Reverse-DNS of contacted IPs ==='
awk '{split($5, a, "->"); if (a[2] != "") {split(a[2], b, ":"); print b[1]}}' "$OUT/conns.log" \
  | sort -u | head -15 | while read -r ip; do
      host=$(dig +short -x "$ip" 2>/dev/null | head -1)
      printf '%-40s %s\n' "$ip" "${host:-?}"
    done

echo
echo '=== C. Non-ESTABLISHED states seen (SYN_SENT lingering = blocked/unreachable) ==='
grep -vE '\(ESTABLISHED\)' "$OUT/conns.log" | awk '{print $6}' | sort | uniq -c || echo '(none — all connections established cleanly)'

echo
echo '=== D. Connection timeline (first/last sighting per endpoint) ==='
awk '{split($5, a, "->"); if (a[2] != "") print a[2]}' "$OUT/conns.log" | sort -u | while read -r ep; do
  first=$(grep -F "$ep" "$OUT/conns.log" | head -1 | awk '{print $1}')
  last=$(grep -F "$ep" "$OUT/conns.log" | tail -1 | awk '{print $1}')
  printf '%-45s %s -> %s\n' "$ep" "$first" "$last"
done | head -20

echo
echo '=== E. nettop per-process byte totals ==='
[ -s "$OUT/nettop.csv" ] && tail -5 "$OUT/nettop.csv" || echo '(nettop produced no data — may need different flags on this macOS version)'

echo
echo "raw data kept at: $OUT"