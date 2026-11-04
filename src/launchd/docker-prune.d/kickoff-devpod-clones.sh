#!/bin/zsh
# Kickoff DevPod: report scratch clones nobody has used for a while. On 2026-11-03 the `kickoff-worktrees`
# volume held 33 clones (160 GB) and left the DevPod 1.4 GiB free. Clones can hold the only copy of
# uncommitted work, so this never deletes: it logs idle clones and notifies when the DevPod runs short.
# Idle = no leased rig slot, no process inside, and no file outside dependencies and .git touched for
# KICKOFF_CLONE_IDLE_DAYS (default 7). Notifies below KICKOFF_CLONE_MIN_FREE_GIB free (default 40).
setopt extended_glob
idle_days=${KICKOFF_CLONE_IDLE_DAYS:-7}
min_free=${KICKOFF_CLONE_MIN_FREE_GIB:-40}
roots=$(sed -n 's/^root=//p' "$HOME"/src/github/kickoff/.scratch/rig/slots/*(N) 2>/dev/null | tr '\n' ' ')
for c in ${(f)"$(docker ps --format '{{.Names}}' | grep -E '^default-[a-z0-9]+-[a-z0-9]+-dev-1$')"}; do
  [[ -n "$c" ]] || continue
  idle=$(docker exec -e ROOTS="$roots" -e DAYS="$idle_days" "$c" bash -c 'cd /workspaces/worktrees 2>/dev/null || exit 0
    cwds=$(for p in /proc/[0-9]*; do readlink "$p/cwd" 2>/dev/null; done)
    for w in *; do [ -d "$w" ] || continue
      case " $ROOTS " in *" /workspaces/worktrees/$w "*) continue;; esac
      printf "%s\n" "$cwds" | grep -q "^/workspaces/worktrees/$w\(/\|$\)" && continue
      [ -n "$(find "$w" \( -name node_modules -o -name .git -o -name ".next*" -o -name .webpack \) -prune -o -type f -mtime -"$DAYS" -print -quit 2>/dev/null)" ] && continue
      echo "$(du -sk "$w" | cut -f1) $w"
    done')
  free=$(docker exec "$c" df -k /workspaces/worktrees 2>/dev/null | awk 'NR==2{print int($4/1048576)}')
  if [[ -z "$idle" ]]; then
    print -- "$c: no idle scratch clones, ${free} GiB free"
    continue
  fi
  # Text from docker exec is untrusted: zsh arithmetic can run commands, so keep only "<number> <safe name>" lines.
  lines=(${(M)${(f)idle}:#<-> [A-Za-z0-9._-]##})
  total=0; for l in $lines; do n=${l%% *}; total=$((total + n)); done
  total=$((total / 1048576))
  print -r -- "$c: ${#lines} scratch clones idle ${idle_days}+ days (${total} GB), ${free} GiB free:"
  print -rl -- $lines
  if [[ "$free" == <-> ]] && (( free < min_free )); then
    # Text from docker exec is untrusted, so only computed numbers reach the notification.
    osascript -e 'on run argv' -e 'display notification (item 1 of argv) with title "Docker cleanup"' -e 'end run' -- "DevPod has ${free} GiB free; ${#lines} idle clones hold ${total} GB" >/dev/null 2>&1
  fi
done
