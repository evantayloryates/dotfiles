#!/bin/bash
# storage-retention: disk hygiene for leftovers that agent work keeps creating on this Mac.
# Fired every 15 minutes by the com.taylor.storage-retention LaunchAgent; runs only when the last
# successful run is 6 hours old (state in ~/.local/state/storage-retention), so a window missed
# while the Mac slept is caught up at the next fire. See README.md. Docker is NOT handled here:
# that is com.taylor.docker-prune.
# Removes only regenerable or merged leftovers, each under a strict test (merged kickoff worktrees
# via the fleet's local-cleanup.sh, merged Codex worktrees, node_modules in untracked worktree
# folders, old ios-agent build jobs, unused Chrome code-sign clones, 14-day-idle agent scratchpads),
# and compresses Codex logs older than 7 days. --dry-run prints what it would do (and ignores the gate).
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
STATE="$HOME/.local/state/storage-retention"; mkdir -p "$STATE"
NOW=$(date +%s); LAST=$(cat "$STATE/last-success" 2>/dev/null || echo 0)
case "$LAST" in ''|*[!0-9]*) LAST=0;; esac
[ $DRY = 0 ] && [ $((NOW - LAST)) -lt $(( ${STORAGE_RETENTION_INTERVAL_HOURS:-6} * 3600 )) ] && exit 0
K="$HOME/src/github/kickoff"; W="$HOME/src/github/worktrees"; C=default-ki-e3ee9-dev-1
free_gib() { df -k /System/Volumes/Data | awk 'NR==2{printf "%.1f", $4/1048576}'; }
act() { if [ $DRY = 1 ]; then echo "  would: $*"; else "$@" && echo "  done: $*"; fi; }
L="$HOME/Library/Logs/storage-retention.log"; [ -f "$L" ] && tail -n 2000 "$L" > "$L.tmp" 2>/dev/null && cat "$L.tmp" > "$L"; rm -f "$L.tmp"
echo "== $(date '+%F %T') storage-retention $([ $DRY = 1 ] && echo DRY-RUN) free=$(free_gib)G"

# 1. Merged work, whichever orchestrator created it.
# 1a. ~/src/github/worktrees: the fleet's local-cleanup.sh over every local branch. It removes a worktree
#     and its local branch only when the newest PR merged, none is open, the local tip is inside the merged
#     PR head, the worktree is clean, unlocked and no process works in it. Never --force.
LC="$HOME/.claude/skills/taylor-fleet-manage/scripts/local-cleanup.sh"
if [ -x "$LC" ] && [ -d "$K" ]; then
  if [ $DRY = 1 ]; then "$LC" "$K" "$W" | grep -vE '^KEEP'
  else "$LC" "$K" "$W" --apply | grep -vE '^KEEP'; fi
fi
# 1b. Codex worktrees (~/.codex/worktrees/*/kickoff): same strict test, by merged PR head, >24h after merge.
if command -v gh >/dev/null && [ -d "$K" ]; then
  merged=$(cd "$K" && gh pr list --state merged --limit 300 --json headRefName,headRefOid,mergedAt 2>/dev/null)
  cwds=$(lsof -d cwd 2>/dev/null | awk '{print $NF}')
  git -C "$K" worktree list --porcelain | awk '/^worktree /{w=$2} /^branch /{sub("refs/heads/","",$2); print w"\t"$2}' |
  while IFS=$'\t' read -r w b; do
    case "$w" in "$HOME/.codex/worktrees"/*) ;; *) continue;; esac
    oid=$(printf '%s' "$merged" | jq -r --arg b "$b" --arg cut "$(date -u -v-24H +%FT%TZ)" \
      '[.[]|select(.headRefName==$b and .mergedAt < $cut)]|sort_by(.mergedAt)|last|.headRefOid // empty')
    [ -n "$oid" ] || continue
    [ "$(git -C "$w" rev-parse HEAD)" = "$oid" ] || { echo "  keep (head differs from merged PR): $w"; continue; }
    [ -z "$(git -C "$w" status --porcelain)" ] || { echo "  keep (uncommitted): $w"; continue; }
    printf '%s\n' "$cwds" | grep -q "^$w" && { echo "  keep (in use): $w"; continue; }
    act git -C "$K" worktree remove "$w"
  done
  git -C "$K" worktree prune
fi

# 2. node_modules in worktree folders git no longer tracks, untouched for 2+ days
tracked=$(git -C "$K" worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p')
for d in "$W"/*/; do
  d=${d%/}; printf '%s\n' "$tracked" | grep -qx "$d" && continue
  [ -n "$(find "$d" -maxdepth 0 -mtime +1)" ] || continue
  find "$d" -maxdepth 3 -type d -name node_modules -prune -print0 | while IFS= read -r -d '' nm; do act rm -rf "$nm"; done
done

# 3. Docker (build cache, images, DevPod /tmp tars) is handled by dotfiles' com.taylor.docker-prune
#    (every 3 h, state-gated, with docker-prune.d hooks). Nothing Docker-related here.

# 4. ios-agent build jobs: keep the newest 2, skip while a build runs
J="$HOME/Library/Application Support/ios-agent/build-jobs"
if [ -d "$J" ] && ! pgrep -x xcodebuild >/dev/null; then
  ls -1t "$J" | tail -n +3 | while read -r d; do
    [ -n "$(find "$J/$d" -maxdepth 0 -mtime +1)" ] && act rm -rf "$J/$d"
  done
fi

# 5. Chrome code-sign clones older than a day that no process holds
for c in "$(getconf DARWIN_USER_TEMP_DIR)"/../X/*.code_sign_clone/code_sign_clone.*; do
  [ -d "$c" ] && [ -n "$(find "$c" -maxdepth 0 -mtime +0)" ] || continue
  lsof +D "$c" >/dev/null 2>&1 && continue
  act rm -rf "$c"
done

# 6. Agent scratchpads untouched for 14+ days
find "$HOME/.cache/claude-tmp" -mindepth 3 -maxdepth 3 -type d -mtime +13 2>/dev/null | while read -r s; do
  [ -z "$(find "$s" -mtime -14 -print -quit)" ] && act rm -rf "$s"
done

# 7. Codex session logs older than 7 days: transparent APFS compression (lossless, kept only if it compressed)
find "$HOME/.codex/sessions" "$HOME/.codex/archived_sessions" -type f -name '*.jsonl' -mtime +7 -print0 2>/dev/null |
while IFS= read -r -d '' f; do
  ls -lO "$f" | grep -q ' compressed ' && continue
  [ $DRY = 1 ] && { echo "  would compress: $f" >> "${TMPDIR:-/tmp}/sr-compress.txt"; continue; }
  if ditto --hfsCompression "$f" "$f.zc" 2>/dev/null && ls -lO "$f.zc" | grep -q ' compressed ' && cmp -s "$f" "$f.zc"; then
    touch -r "$f" "$f.zc" && mv "$f.zc" "$f"
  else rm -f "$f.zc"; fi
done

[ $DRY = 1 ] && [ -f "${TMPDIR:-/tmp}/sr-compress.txt" ] && { echo "  would compress $(wc -l < "${TMPDIR:-/tmp}/sr-compress.txt") Codex logs"; rm -f "${TMPDIR:-/tmp}/sr-compress.txt"; }
# 8. Time Machine automatic backups are off (2026-10-27, Taylor), so no local snapshots to thin.

f=$(free_gib); echo "== end free=${f}G"
# Early warning below 30 GiB
if [ $DRY = 0 ] && [ "${f%.*}" -lt 30 ]; then
  osascript -e "display notification \"Only ${f} GiB free on the Mac. Ask Storage Saver.\" with title \"Disk space low\"" 2>/dev/null
fi
[ $DRY = 0 ] && echo "$NOW" > "$STATE/last-success"
exit 0
