#!/bin/zsh
# switchboard-notify.sh "<text>" — runs on theo-air. Delivers a notify to Taylor's Mac by SSH,
# tailnet hostname first (works off-LAN), mDNS .local as fallback (same Wi-Fi only).
set -u
text=$1
remote=/Users/taylor/.local/bin/switchboard-enqueue.sh
log=$HOME/.local/state/switchboard/notify.log; mkdir -p "${log:h}"
for host in macbook-pro-3.taile8fdd0.ts.net MacBook-Pro-3.local; do
  if out=$(ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new "taylor@$host" "$remote" "${(q)text}" 2>&1); then
    print -r -- "$(date '+%F %T') ok via $host: $out" >> "$log"; exit 0
  fi
  print -r -- "$(date '+%F %T') fail via $host: $out" >> "$log"
done
exit 1
