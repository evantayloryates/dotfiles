#!/bin/zsh

# Docker hygiene — safe, non-aggressive housekeeping to keep Docker's disk
# footprint from creeping. Removes ONLY what Docker itself treats as reclaimable
# with no owner:
#   - dangling images       (untagged <none> layers no image references)
#   - anonymous volumes      (detached, not attached to any container)
#   - unused build cache     (down to a floor, so recent cache survives)
#
# It deliberately NEVER removes:
#   - tagged images (even if no container currently uses them)
#   - named volumes (amplify_postgres, remotion_node_modules, etc.) — even when
#     detached; `volume prune` without --all leaves named volumes alone
#   - any container, running or stopped
#
# Usage:
#   docker-prune            run the safe cleanup
#   docker-prune -n         dry run — report what would be reclaimed, remove nothing
#   docker-prune -h         help
#
# Alias: `dprune` (see bottom of file).

docker-prune() {
  emulate -L zsh

  local dry_run=0
  local keep_cache="5GB"   # build-cache floor to leave behind (matches daemon.json GC reservedSpace)

  while [[ -n "$1" ]]; do
    case "$1" in
      -n|--dry-run) dry_run=1 ;;
      -h|--help)
        print -- "Usage: docker-prune [-n|--dry-run]"
        print -- "  Safe Docker cleanup: dangling images, anonymous volumes, unused build cache."
        print -- "  Never touches tagged images, named volumes, or containers."
        return 0
        ;;
      *) print -- "docker-prune: unknown option '$1' (try -h)"; return 1 ;;
    esac
    shift
  done

  # Colors only when writing to a terminal.
  local c_head c_ok c_dim c_reset
  if [[ -t 1 ]]; then
    c_head=$'\e[1;36m'; c_ok=$'\e[1;32m'; c_dim=$'\e[2m'; c_reset=$'\e[0m'
  fi

  # Docker runs on demand here, so bail cleanly if the daemon isn't up.
  if ! docker info >/dev/null 2>&1; then
    print -- "docker-prune: Docker daemon is not running — start Docker Desktop first."
    return 1
  fi

  print -- "${c_head}Docker disk usage (before)${c_reset}"
  docker system df

  if (( dry_run )); then
    local n_img n_vol
    n_img=$(docker images -f dangling=true -q | grep -c .)
    n_vol=$(docker volume ls -f dangling=true -q | grep -c .)
    print -- "\n${c_head}Dry run — nothing will be removed${c_reset}"
    print -- "  dangling images to remove:    ${n_img}"
    print -- "  anonymous volumes to remove:  ${n_vol}"
    print -- "  build cache: would prune unused, keeping ~${keep_cache}"
    print -- "${c_dim}Run without -n to reclaim.${c_reset}"
    return 0
  fi

  print -- "\n${c_head}Pruning dangling images…${c_reset}"
  docker image prune -f

  print -- "\n${c_head}Pruning anonymous (detached) volumes…${c_reset}"
  docker volume prune -f

  print -- "\n${c_head}Pruning unused build cache (keeping ~${keep_cache})…${c_reset}"
  # Docker 29+ renamed --keep-storage to --reserved-space. Prefer the new flag,
  # fall back to the old one on older engines, then to a plain unused-cache prune.
  docker builder prune -f --reserved-space "$keep_cache" 2>/dev/null \
    || docker builder prune -f --keep-storage "$keep_cache" 2>/dev/null \
    || docker builder prune -f

  print -- "\n${c_head}Docker disk usage (after)${c_reset}"
  docker system df
  print -- "${c_ok}Done.${c_reset}"
}

alias dprune='docker-prune'
