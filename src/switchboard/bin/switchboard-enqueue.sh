#!/bin/zsh
# switchboard-enqueue.sh "<text>"  — drop a message into the outbox; the outbox agent (GUI session) sends it via Messages.
set -eu
dir=$HOME/.local/state/switchboard/outbox; mkdir -p "$dir"
f=$dir/$(date +%s)-$$.txt
print -r -- "$1" > "$f.tmp" && mv "$f.tmp" "$f"
echo "queued $f"
