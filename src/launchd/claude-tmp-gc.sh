#!/bin/bash
# Garbage-collects Claude Code's temp tree (scratchpads, background task output)
# after a month of disuse, instead of macOS wiping it at every reboot.
#
# Claude Code puts that tree under $CLAUDE_CODE_TMPDIR (default /tmp, which
# macOS clears at boot). dotfiles/.env points it at ~/.cache/claude-tmp, so a
# session's scratchpad survives restarts and reboots, and this job is what
# eventually removes it.
#
# Layout: <root>/claude-<uid>/<project-slug>/<session-id>/{scratchpad,tasks}.
# A session directory is removed only when BOTH have been idle for DAYS:
#   - nothing inside it was modified, and
#   - its transcript ~/.claude/projects/<project-slug>/<session-id>.jsonl was not
#     modified (resuming or consulting a session touches the transcript, which
#     keeps its scratchpad alive even if nothing new was written there).
# Loose files directly under claude-<uid>/ (cache state, edit diffs) go after
# DAYS of no modification. Empty project directories are removed last.
#
# Usage: claude-tmp-gc.sh [--dry-run] [--days N]
#   CLAUDE_TMP_GC_ROOT overrides the tree (tests); it must be under $HOME/.cache.
set -uo pipefail

DAYS=30
DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --days) DAYS="${2:?--days needs a number}"; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
case "$DAYS" in ''|*[!0-9]*) echo "--days must be a whole number" >&2; exit 2 ;; esac
[ "$DAYS" -ge 7 ] || { echo "refusing --days under 7" >&2; exit 2; }

ROOT="${CLAUDE_TMP_GC_ROOT:-${CLAUDE_CODE_TMPDIR:-$HOME/.cache/claude-tmp}}"
TRANSCRIPTS="${CLAUDE_TMP_GC_TRANSCRIPTS:-$HOME/.claude/projects}"
case "$ROOT" in
  "$HOME"/.cache/?*) ;;
  *) echo "refusing root outside \$HOME/.cache: $ROOT" >&2; exit 2 ;;
esac
[ -d "$ROOT" ] || { echo "no tree at $ROOT; nothing to do"; exit 0; }

stamp() { date '+%Y-%m-%d %H:%M:%S'; }
remove() { # remove <path> <why>
  if [ "$DRY" = 1 ]; then echo "$(stamp) would remove $1 ($2)"; return; fi
  rm -rf -- "$1" && echo "$(stamp) removed $1 ($2)"
}

kept=0 removed=0
for uid_dir in "$ROOT"/claude-*/; do
  [ -d "$uid_dir" ] || continue
  for project_dir in "$uid_dir"*/; do
    [ -d "$project_dir" ] || continue
    project="$(basename "$project_dir")"
    for session_dir in "$project_dir"*/; do
      [ -d "$session_dir" ] || continue
      session="$(basename "$session_dir")"
      transcript="$TRANSCRIPTS/$project/$session.jsonl"
      if [ -n "$(find "$session_dir" -mtime -"$DAYS" -print -quit 2>/dev/null)" ]; then
        kept=$((kept + 1)); continue
      fi
      if [ -f "$transcript" ] && [ -n "$(find "$transcript" -mtime -"$DAYS" -print -quit)" ]; then
        kept=$((kept + 1)); continue
      fi
      remove "${session_dir%/}" "idle ${DAYS}+ days"
      removed=$((removed + 1))
    done
    if [ "$DRY" = 0 ]; then rmdir "$project_dir" 2>/dev/null || true; fi
  done
  while IFS= read -r -d '' loose; do
    remove "$loose" "loose entry idle ${DAYS}+ days"
  done < <(find "$uid_dir" -mindepth 1 -maxdepth 1 ! -name '-*' -mtime +"$DAYS" -print0)
done
echo "$(stamp) done: kept $kept session dirs, removed $removed (days=$DAYS dry=$DRY)"
