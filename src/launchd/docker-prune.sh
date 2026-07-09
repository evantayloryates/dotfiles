#!/bin/zsh
# Periodic, hands-off Docker cleanup. Fired on an interval by the
# com.taylor.docker-prune LaunchAgent. Reuses the SAME safe `docker-prune`
# function the interactive shell uses (src/functions/docker.sh) so there is one
# source of truth for what is safe to remove: dangling images, detached
# anonymous volumes, and unused build cache (down to a 5GB floor). It never
# touches tagged images, named volumes, or containers.
#
# Docker runs on-demand on this machine (Login Items are off), so most fires
# happen while Docker is down — docker-prune detects that and no-ops cleanly.
# That makes this safe to run at literally any time.
#
# Output is appended to ~/Library/Logs and self-trimmed to bound growth. The
# script always exits 0: this is best-effort maintenance, not a critical job, so
# a "Docker not running" fire should not read as a launchd failure.

: "${DOTFILES_DIR:=$HOME/dotfiles}"

# launchd gives us a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) that does NOT
# include the Docker CLI, so `docker` would be "not found" and every run would
# wrongly report the daemon as down. Prepend the usual macOS Docker CLI homes.
# (The docker *context*/socket resolves fine on its own once the binary is found.)
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

LOG="$HOME/Library/Logs/com.taylor.docker-prune.log"
mkdir -p "${LOG:h}"

# Keep only the most recent ~1000 lines before this run appends (bounds growth).
[[ -f "$LOG" ]] && { tail -n 1000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"; }

{
  print -- "===== docker-prune $(date '+%Y-%m-%d %H:%M:%S %Z') ====="
  source "$DOTFILES_DIR/src/functions/docker.sh"
  docker-prune
  print -- ""
} >> "$LOG" 2>&1

exit 0
