#!/usr/bin/env bash
#
# Clone the GitHub repos this machine expects into $GITHUB_DIR (default
# ~/src/github). Called from install.sh; also safe to run on its own.
#
# Contract:
#   - Idempotent. An existing clone is never touched, re-fetched, or reset.
#   - Never fatal. Repos the current git credentials can't reach (e.g.
#     getrembrand/* once the Rembrand org access goes away) are reported and
#     skipped, so setup still completes on a personal machine.
#   - Reachability is probed BEFORE any cloning, so the run can't half-finish
#     on an auth wall partway through the list.
#   - Parallel: probes and clones both fan out (REPO_CLONE_JOBS, default 8).
#
# Env overrides:
#   GITHUB_DIR       destination root            (default ~/src/github)
#   REPO_CLONE_JOBS  max concurrent git jobs     (default 8)

GITHUB_DIR="${GITHUB_DIR:-$HOME/src/github}"
REPO_CLONE_JOBS="${REPO_CLONE_JOBS:-8}"

# BatchMode makes ssh fail fast instead of hanging on a passphrase/2FA prompt
# when the key is gone — a setup script must never block on stdin.
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes -o ConnectTimeout=10}"

REPOS=(
  evantayloryates/evantayloryates
  evantayloryates/podsauce
  evantayloryates/isabella
  getrembrand/amplify-ops
  getrembrand/nexrender-api
  getrembrand/nexrender-scripts
  getrembrand/dbt-models
  getrembrand/creative-demos
  getrembrand/browser-extension-mv3
  getrembrand/r1
  getrembrand/amplify
)

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg"
  echo "$msg" >> "$HOME/log.txt"
}

repo_url()  { echo "git@github.com:$1.git"; }
repo_name() { echo "${1##*/}"; }

# --- worker modes -----------------------------------------------------------
# Re-invoked by xargs so the fan-out works on bash 3.2 (macOS) without `wait -n`.
# Each worker drops a one-line verdict in $REPO_STATUS_DIR/<name>.

if [[ "$1" == "--probe-one" ]]; then
  repo="$2"; name="$(repo_name "$repo")"
  if git ls-remote "$(repo_url "$repo")" HEAD >/dev/null 2>&1; then
    echo "reachable" > "$REPO_STATUS_DIR/$name"
  else
    echo "unreachable" > "$REPO_STATUS_DIR/$name"
    log "  🔒 $repo — not reachable with current git auth, skipping"
  fi
  exit 0
fi

if [[ "$1" == "--clone-one" ]]; then
  repo="$2"; name="$(repo_name "$repo")"; dest="$GITHUB_DIR/$name"
  # Clone to a scratch path and rename into place, so an interrupted clone
  # leaves no half-populated $dest for the next run to mistake for a clone.
  tmp="$GITHUB_DIR/.clone-tmp.$name.$$"
  rm -rf "$tmp"
  trap 'rm -rf "$tmp"' EXIT
  if git clone --quiet "$(repo_url "$repo")" "$tmp" 2>/dev/null && [[ ! -e "$dest" ]] && mv "$tmp" "$dest"; then
    echo "cloned" > "$REPO_STATUS_DIR/$name"
    log "  ✅ $repo → $dest"
  else
    echo "failed" > "$REPO_STATUS_DIR/$name"
    log "  ❌ $repo — clone failed"
  fi
  exit 0
fi

# --- main -------------------------------------------------------------------

SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

mkdir -p "$GITHUB_DIR" || { log "❌ Cannot create $GITHUB_DIR — skipping repo clone step"; exit 0; }

REPO_STATUS_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dotfiles-repos.XXXXXX")" || exit 0
export REPO_STATUS_DIR GITHUB_DIR
trap 'rm -rf "$REPO_STATUS_DIR"' EXIT

# Sweep scratch dirs abandoned by a previous interrupted run.
rm -rf "$GITHUB_DIR"/.clone-tmp.* 2>/dev/null

log "📚 Repos → $GITHUB_DIR"

# Pass 1: classify what's already on disk. Only unknowns get probed.
present=(); occupied=(); candidates=()
for repo in "${REPOS[@]}"; do
  name="$(repo_name "$repo")"; dest="$GITHUB_DIR/$name"
  if [[ -e "$dest/.git" ]]; then
    present+=("$name")
  elif [[ -e "$dest" ]]; then
    occupied+=("$name")
  else
    candidates+=("$repo")
  fi
done

[[ ${#present[@]} -gt 0 ]]  && log "  ⏭  Already cloned (${#present[@]}): ${present[*]}"
for name in "${occupied[@]}"; do
  log "  ⚠️  $GITHUB_DIR/$name exists but is not a git repo — leaving it alone"
done

if [[ ${#candidates[@]} -eq 0 ]]; then
  log "📚 Nothing to clone."
  exit 0
fi

# Pass 2: probe reachability for every missing repo, in parallel.
log "  🔎 Checking git access for ${#candidates[@]} repo(s)…"
printf '%s\n' "${candidates[@]}" | xargs -P "$REPO_CLONE_JOBS" -n 1 bash "$SELF" --probe-one

reachable=()
for repo in "${candidates[@]}"; do
  name="$(repo_name "$repo")"
  [[ "$(cat "$REPO_STATUS_DIR/$name" 2>/dev/null)" == "reachable" ]] && reachable+=("$repo")
done

if [[ ${#reachable[@]} -eq 0 ]]; then
  log "📚 No reachable repos to clone."
  exit 0
fi

# Pass 3: clone the reachable ones, in parallel.
log "  ⬇️  Cloning ${#reachable[@]} repo(s) with up to $REPO_CLONE_JOBS parallel jobs…"
printf '%s\n' "${reachable[@]}" | xargs -P "$REPO_CLONE_JOBS" -n 1 bash "$SELF" --clone-one

cloned=0; failed=0; skipped=0
for repo in "${candidates[@]}"; do
  case "$(cat "$REPO_STATUS_DIR/$(repo_name "$repo")" 2>/dev/null)" in
    cloned)      cloned=$((cloned + 1)) ;;
    unreachable) skipped=$((skipped + 1)) ;;
    *)           failed=$((failed + 1)) ;;
  esac
done
log "📚 Repos: $cloned cloned, ${#present[@]} already present, $skipped skipped (no access), $failed failed"

# Always succeed — missing org access must not fail the whole install.
exit 0
