#!/bin/zsh
# Kickoff DevPod: watch the scratch clones' git object stores. A SHALLOW clone that fetches from
# /workspaces/kickoff re-receives the whole history as a new ~1.7 GB pack on every fetch; on
# 2026-10-27 two live-check clones held 10-11 such packs each (34 GB). Report-only: notify when a
# clone is shallow or its objects pass 4 GB, so the fix (fetch --unshallow + gc) is applied by hand.
for c in ${(f)"$(docker ps --format '{{.Names}}' | grep -E '^default-[a-z0-9]+-[a-z0-9]+-dev-1$')"}; do
  [[ -n "$c" ]] || continue
  bad=$(docker exec "$c" sh -c 'cd /workspaces/worktrees 2>/dev/null || exit 0
    for w in *; do [ -d "$w/.git/objects" ] || continue
      kb=$(du -sk "$w/.git/objects" | cut -f1)
      if [ -f "$w/.git/shallow" ] || [ "$kb" -gt 4194304 ]; then
        echo "$w $((kb / 1048576))G $([ -f "$w/.git/shallow" ] && echo shallow)"; fi
    done')
  if [[ -n "$bad" ]]; then
    print -- "$c: clones needing attention:\n$bad"
    osascript -e "display notification \"DevPod clone git store is bloating: ${${(f)bad}[1]}\" with title \"Docker cleanup\"" >/dev/null 2>&1
  else
    print -- "$c: scratch clone git stores OK"
  fi
done
