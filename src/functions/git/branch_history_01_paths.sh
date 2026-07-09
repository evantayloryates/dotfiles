#!/bin/zsh
# Git branch history — path encoding and layout helpers.
# Layout:
#   $DOTFILES_DATA_DIR/git_branch_history/<encoded_repo>/touches.jsonl
#   $DOTFILES_DATA_DIR/git_branch_history/<encoded_repo>/last_used.jsonl
#   $DOTFILES_DATA_DIR/logs/git_branch_history.log
#
# Repo key: snake_case slug of canonical abs path + "__" + 12-char sha256.
# Readable for humans; hash is collision-proof (see Desktop path-encoding research).

: "${DOTFILES_DATA_DIR:=${DOTFILES_DIR:-$HOME/dotfiles}/data}"

GBH_SCHEMA_VERSION=1
GBH_DATA_CLASS="git_branch_history"
GBH_REINDEX_STALE_SECONDS=$((60 * 60 * 24 * 60))   # 2 months
GBH_INDEX_COOLDOWN_SECONDS=$((60 * 60 * 3))         # ~3 hours
GBH_RECENT_WINDOW_SECONDS=$((60 * 60 * 24 * 14))    # 2 weeks
GBH_REST_FILTER_SECONDS=$((60 * 60 * 24 * 90))      # 3 months
GBH_RECENT_MAX_ITEMS=7

# Encode a canonical absolute repo path into a single snake_case directory name.
# Example: /Users/taylor/src/github/r1 → users_taylor_src_github_r1__<12-hex>
_gbh_encode_repo_path() {
  local abs="$1"
  local hash slug
  hash=$(printf '%s' "$abs" | /usr/bin/shasum -a 256 | /usr/bin/cut -c1-12)
  slug=$(printf '%s' "${abs#/}" | /usr/bin/tr '[:upper:]' '[:lower:]' | /usr/bin/tr -cs 'a-z0-9' '_')
  slug="${slug##_}"
  slug="${slug%%_}"
  # Keep under NAME_MAX even with multibyte expansion; hash covers truncation collisions.
  (( ${#slug} > 200 )) && slug="${slug:0:200}"
  printf '%s__%s' "$slug" "$hash"
}

# Resolve canonical repo root (physical path). Empty stdout if not in a git repo.
_gbh_repo_root() {
  local root
  root=$(/usr/bin/git -C "${1:-.}" rev-parse --show-toplevel 2>/dev/null) || return 1
  # Prefer physical path so symlinked checkouts share one history key.
  root=$(cd "$root" 2>/dev/null && pwd -P) || return 1
  printf '%s' "$root"
}

_gbh_repo_data_dir() {
  local root="$1"
  local key
  key=$(_gbh_encode_repo_path "$root") || return 1
  printf '%s/%s/%s' "$DOTFILES_DATA_DIR" "$GBH_DATA_CLASS" "$key"
}

_gbh_touches_file() {
  printf '%s/touches.jsonl' "$1"
}

_gbh_last_used_file() {
  printf '%s/last_used.jsonl' "$1"
}

_gbh_log_file() {
  printf '%s/logs/git_branch_history.log' "$DOTFILES_DATA_DIR"
}

# Near-free: walk parents for .git without spawning git. Returns 0 if likely in a repo.
_gbh_likely_in_git_repo() {
  local d="${1:-$PWD}"
  while [[ -n "$d" && "$d" != "/" ]]; do
    [[ -e "$d/.git" ]] && return 0
    d="${d:h}"
  done
  [[ -e "/.git" ]]
}

_gbh_utc_now() {
  TZ=UTC /bin/date -u +%Y-%m-%dT%H:%M:%SZ
}

_gbh_epoch_now() {
  /bin/date +%s
}
