#!/bin/zsh
# Periodic, hands-off Docker cleanup, fired by the com.taylor.docker-prune LaunchAgent.
#
# Schedule: the agent fires every 15 minutes, but a cleanup runs only when the
# last *successful* one is 3 hours old or more (state in
# ~/.local/state/docker-prune/). A fire while Docker is down or hung does not
# count as success, so the next fire after Docker comes back (or after the Mac
# wakes) runs the overdue cleanup at once: missed windows are caught up at the
# first opportunity instead of waiting for the next interval.
#
# What it removes, in order:
#   1. The SAME safe `docker-prune` function the interactive shell uses
#      (src/functions/docker.sh): dangling images, detached anonymous volumes,
#      unused build cache down to a 5GB floor. Never tagged images, named
#      volumes, or containers.
#   2. Hooks in docker-prune.d/*.sh: container-specific cleanups for regenerable
#      junk that lives INSIDE running containers, which step 1 never sees
#      (2026-10-27: DevPod live-check tars grew the containers to 57 GB while
#      every prune reclaimed 0 B).
#
# A hung daemon (`docker info` does not answer within 30 s) is reported with a
# macOS notification at most every 6 hours, instead of being mistaken for
# "Docker not running". Output is appended to ~/Library/Logs and self-trimmed.
# The script always exits 0: a skipped or Docker-off fire is not a failure.

: "${DOTFILES_DIR:=$HOME/dotfiles}"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

INTERVAL=$(( ${DOCKER_PRUNE_INTERVAL_HOURS:-3} * 3600 ))
STATE="$HOME/.local/state/docker-prune"
LOG="$HOME/Library/Logs/com.taylor.docker-prune.log"
HOOKS="${0:A:h}/docker-prune.d"
mkdir -p "$STATE" "${LOG:h}"

now=$(date +%s)
last=$(cat "$STATE/last-success" 2>/dev/null || echo 0)
[[ "$last" == <-> ]] || last=0
(( now - last < INTERVAL )) && exit 0   # not due yet; stay silent

# Bounded command: coreutils timeout when present, else run as is.
bounded() { local s=$1; shift; if (( $+commands[timeout] )); then timeout "$s" "$@"; else "$@"; fi; }

notify_once() {  # $1 = key, $2 = message; at most once per 6 hours per key
  local f="$STATE/notified-$1" t
  t=$(cat "$f" 2>/dev/null || echo 0); [[ "$t" == <-> ]] || t=0
  (( now - t < 21600 )) && return
  print -- "$now" > "$f"
  osascript -e "display notification \"$2\" with title \"Docker cleanup\"" >/dev/null 2>&1
}

[[ -f "$LOG" ]] && { tail -n 1000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"; }
print -- "$now" > "$STATE/last-attempt"

{
  print -- "===== docker-prune $(date '+%Y-%m-%d %H:%M:%S %Z') (last success $(( last ? (now - last) / 60 : -1 )) min ago) ====="
  bounded 30 docker info >/dev/null 2>&1
  rc=$?
  if (( rc == 124 )); then
    print -- "docker-prune: Docker daemon is HUNG (no answer in 30 s); not counted as a run, will retry."
    notify_once hung "Docker is not responding, so cleanup is overdue. Restart Docker Desktop."
  elif (( rc != 0 )); then
    print -- "docker-prune: Docker daemon is not running; not counted as a run, will retry at the next fire."
  else
    bounded 1800 zsh -c "source '$DOTFILES_DIR/src/functions/docker.sh'; docker-prune"
    prune_rc=$?
    for hook in "$HOOKS"/*.sh(N); do
      print -- "\n--- hook ${hook:t}"
      bounded 600 /bin/zsh "$hook" || print -- "hook ${hook:t} exited $?"
    done
    if (( prune_rc == 0 )); then
      print -- "$now" > "$STATE/last-success"
    else
      print -- "docker-prune: exited $prune_rc; not counted as a run."
    fi
    raw=$(du -k "$HOME/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw" 2>/dev/null | awk '{print int($1/1048576)}')
    print -- "Docker.raw allocated on the Mac: ${raw:-?} GiB"
    (( ${raw:-0} > ${DOCKER_PRUNE_ALERT_GIB:-180} )) && notify_once big "Docker's disk is ${raw} GiB, above ${DOCKER_PRUNE_ALERT_GIB:-180}. Check volumes and containers."
  fi
  print -- ""
} >> "$LOG" 2>&1

exit 0
