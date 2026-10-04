#!/bin/zsh
# Drains ~/.local/state/switchboard/outbox: each *.txt is sent as one iMessage via switchboard-send.sh, then removed.
# Runs from launchd in the GUI session so Messages automation is authorized (first run prompts once).
set -u
dir=$HOME/.local/state/switchboard/outbox; log=$HOME/.local/state/switchboard/outbox.log
for f in "$dir"/*.txt(N); do
  if "$HOME/.local/bin/switchboard-send.sh" --text "$(<"$f")" >>"$log" 2>&1; then
    echo "[$(date '+%F %T')] sent ${f:t}" >> "$log"; rm -f "$f"
  else
    echo "[$(date '+%F %T')] FAILED ${f:t} (left in outbox)" >> "$log"; mv "$f" "$f.failed"
  fi
done
