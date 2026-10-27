#!/bin/zsh
# Kickoff DevPod: delete single-use live-check snapshots from the dev container's /tmp
# (`<name>.tar` source snapshots, ~240 MB each, and their `<name>-files.txt` lists) once
# they are a day old. 2026-10-18 and 2026-10-27 each found 16+ GB of them; nothing reads
# them after the snapshot is staged (see the kickoff-pr-live-check-recipe memory).
# Only regular files directly in /tmp are touched, and only in running DevPod dev containers.
for c in ${(f)"$(docker ps --format '{{.Names}}' | grep -E '^default-[a-z0-9]+-[a-z0-9]+-dev-1$')"}; do
  [[ -n "$c" ]] || continue
  print -- "$c: /tmp before $(docker exec "$c" du -xsh /tmp 2>/dev/null | cut -f1)"
  docker exec "$c" sh -c 'find /tmp -maxdepth 1 -type f \( -name "*.tar" -o -name "*-files.txt" \) -mtime +0 -print -delete | wc -l' |
    read -r n && print -- "$c: removed $n stale live-check files"
  print -- "$c: /tmp after $(docker exec "$c" du -xsh /tmp 2>/dev/null | cut -f1)"
done
