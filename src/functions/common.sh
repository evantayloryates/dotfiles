#!/bin/zsh


# Generate the function file and source it
PATHFUNCS_FILE="$(python3 $DOTFILES_DIR/src/python/pathfuncs.py)"
if [[ -f "$PATHFUNCS_FILE" ]]; then
  source "$PATHFUNCS_FILE"
else
  echo "Failed to generate path functions"
fi

# Source all sibling .sh files
SCRIPT_DIR="$(dirname "$0")"
for f in "$SCRIPT_DIR"/*.sh; do
  [[ "$f" == "$0" ]] && continue  # skip self
  [[ -f "$f" ]] && source "$f"
done

function _ssh_prod() {
  ssh-keygen -R ssh-app.spaceback.me
  ssh -i ~/.ssh/aws-eb -tt root@ssh-app.spaceback.me 'echo "echo \"RUN: cd ~ && source activate && cd /app && rails c\" && source /root/activate" | bash -s && bash -i'
}

function _ssh_stage() {
  ssh-keygen -R ssh-app-stage.spaceback.me
  ssh -i ~/.ssh/aws-eb -tt root@ssh-app-stage.spaceback.me 'echo "echo \"RUN: cd ~ && source activate && cd /app && rails c\" && source /root/activate" | bash -s && bash -i'
}

_red() { printf '\033[31m%s\033[0m' "$1"; }
_magenta() { printf '\033[35m%s\033[0m' "$1"; }

function __log() {
  local tty='/dev/tty'
  if [ -w "${tty}" ]; then
    printf '%s\n' "$1" > "${tty}"
  else
    printf '%s\n' "$1" >&2
  fi
}

function _select_container() {
  local initial_input="$1"
  printf '%s\n' "${initial_input}" | python3 "${DOTFILES_DIR}/src/python/selector.py"
}

function _amplify_exec() {
  local service="$1"
  local amplify_dir="${HOME}/src/github/amplify"

  service="$(_select_container "${service}")" || true
  if [ -z "${service}" ]; then
    return 0
  fi

  # run from amplify project dir without changing cwd
  # confirm service exists in this compose project
  if ! docker compose --project-directory "${amplify_dir}" ps --services | grep -qx "${service}"; then
    __log "$(_red "exec_amplify: unknown service '${service}'")"
    return 1
  fi

  __log "↓ Opening shell in: $(_magenta "${service}")"
  __log ""

  # prefer bash if available; fall back to sh
  if docker compose --project-directory "${amplify_dir}" exec -T "${service}" /bin/bash -lc 'exit' >/dev/null 2>&1; then
    docker compose --project-directory "${amplify_dir}" exec -it "${service}" /bin/bash
  else
    docker compose --project-directory "${amplify_dir}" exec -it "${service}" /bin/sh
  fi
}

function _amplify_logs() {
  local service="$1"
  local amplify_dir="${HOME}/src/github/amplify"

  service="$(_select_container "${service}")" || true
  if [ -z "${service}" ]; then
    return 0
  fi

  if ! docker compose --project-directory "${amplify_dir}" ps --services | grep -qx "${service}"; then
    __log "$(_red "_amplify_logs: unknown service '${service}'")"
    return 1
  fi

  __log "↓ Tailing logs for: $(_magenta "${service}")"
  __log ""

  dc --project-directory "${amplify_dir}" logs --tail=200 --follow "${service}"
}

function _amplify_restart() {
  local service="$1"
  local amplify_dir="${HOME}/src/github/amplify"

  service="$(_select_container "${service}")" || true
  if [ -z "${service}" ]; then
    return 0
  fi

  if ! docker compose --project-directory "${amplify_dir}" ps --services | grep -qx "${service}"; then
    __log "$(_red "_amplify_restart: unknown service '${service}'")"
    return 1
  fi

  __log "↓ Restarting container: $(_magenta "${service}")"
  __log ""

  dc --project-directory "${amplify_dir}" restart "${service}"
}

function _amplify_update() {
  local amplify_dir="${HOME}/src/github/amplify"
  local branch
  branch="$(git -C "${amplify_dir}" rev-parse --abbrev-ref HEAD 2>/dev/null)" || {
    __log "$(_red "_amplify_update: cannot determine current branch")"
    return 1
  }
  printf 'dbg: %s=%s\n' "$branch" "$(printf '%q' "$branch")"

  case "$branch" in
    master | production)
      __log "$(_red "_amplify_update: refused on branch '${branch}'")"
      return 1
      ;;
  esac
  local msg="$*"
  [[ -z "$msg" ]] && msg="updates"
  git -C "${amplify_dir}" add -A &&
    git -C "${amplify_dir}" reset -- config/application.rb config/environments/development.rb &&
    git -C "${amplify_dir}" commit -m "${msg}" &&
    git -C "${amplify_dir}" push
}

function sb() {
  local magenta="\033[35m"
  local reset="\033[0m"
  echo "NO EFFECT"
  echo "Please use ${magenta}amp prod${reset} or ${magenta}amp stage${reset} instead"
}

json() {
  local TMPFILE
  local JSON_PARSE_ERROR_SIGNAL
  local TMPFILE_CONTENT
  local ERROR_MESSAGE
  local SIGNAL_LEN

  JSON_PARSE_ERROR_SIGNAL='[JSON_PARSE_ERROR_SIGNAL]'
  export JSON_PARSE_ERROR_SIGNAL
  TMPFILE="$(mktemp /tmp/jsonfmt.XXXXXX)"

  pbpaste > "$TMPFILE"

  # npx node ~/src/scripts/json-inline-format.ts "$TMPFILE" >/dev/null 2>&1
  /opt/homebrew/bin/node "$DOTFILES_DIR/src/javascript/json-inline-format.js" "$TMPFILE" >/dev/null 2>&1

  TMPFILE_CONTENT="$(<"$TMPFILE")"
  if [[ "$TMPFILE_CONTENT" == "${JSON_PARSE_ERROR_SIGNAL}"* ]]; then
    SIGNAL_LEN=${#JSON_PARSE_ERROR_SIGNAL}
    ERROR_MESSAGE="${TMPFILE_CONTENT:$SIGNAL_LEN}"
    ERROR_MESSAGE="${ERROR_MESSAGE#\[}"
    ERROR_MESSAGE="${ERROR_MESSAGE%\]}"
    printf 'Error parsing JSON:\n\n \033[0;90m==>\033[0m \033[1;31m%s\033[0m\n\n' "$ERROR_MESSAGE"
  else
    pbcopy < "$TMPFILE"
    echo '✅ JSON formatted and copied back to clipboard'
  fi

  unset JSON_PARSE_ERROR_SIGNAL
  rm -f "$TMPFILE"
}

note() {
  echo -e "\033[1;1H\033[J"
  cat > "${1:-/dev/stdout}"
}

pbcopy() {  
  if [ -t 0 ]; then
    clip "$@"
  else
    cblue() { echo -e "\033[34m$*\033[0m"; }
    cblue "Tip: use 'clip <command>' to copy command output directly" >&2
    /usr/bin/pbcopy "$@"
  fi
}

# strips ANSI (CSI + OSC) then copies 
strip_ansi() {
  perl -pe '
    # Strip ANSI escape sequences (CSI + OSC)
    s/(?:\e\[|\x9b)[0-9;?]*[a-zA-Z]//g;
    s/\e\][^\e]*?(?:\a|\e\\)//g;
    chomp if eof
  '
}

# safemv <src> <dest>
# Silently move src to dest with strict two-arg semantics.
# Success (0):
#   - src does not exist AND dest exists (noop)
#   - src exists AND dest does not, and move succeeds
# Failure (non-zero):
#   - wrong arg count
#   - both paths exist
#   - neither path exists
safemv() {
  local src dest

  # enforce exactly two args
  [ "$#" -eq 2 ] || return 2

  src=$1
  dest=$2

  # case 1: src missing, dest exists → success (noop)
  if [ ! -e "$src" ] && [ -e "$dest" ]; then
    return 0
  fi

  # case 2: src exists, dest missing → attempt move
  if [ -e "$src" ] && [ ! -e "$dest" ]; then
    mv "$src" "$dest" 2>/dev/null || return 1
    [ -e "$dest" ] || return 1
    return 0
  fi

  # all other cases are errors:
  # - both exist
  # - neither exist
  return 1
}

clipsend() {
  local desktop="$HOME/Desktop"
  local custom_name="$1"
  local ts
  local tmp
  local lines
  local out
  local stem
  local ext
  local candidate
  local n

  ts="$(date '+%H%M%S')"
  tmp="$(mktemp)"

  pbpaste > "$tmp"

  lines="$(wc -l < "$tmp" | tr -d '[:space:]')"
  mkdir -p "$desktop"

  if [[ -n "$custom_name" ]]; then
    custom_name="${custom_name##*/}"
    out="$desktop/$custom_name"

    if [[ -e "$out" ]]; then
      if [[ "$custom_name" == *.* && "$custom_name" != .* ]]; then
        stem="${custom_name%.*}"
        ext=".${custom_name##*.}"
      else
        stem="$custom_name"
        ext=""
      fi

      n=1
      candidate="$desktop/${stem}-${n}${ext}"
      while [[ -e "$candidate" ]]; do
        ((n++))
        candidate="$desktop/${stem}-${n}${ext}"
      done
      out="$candidate"
    fi
  else
    out="$desktop/clipsend-$ts-$lines-lines.txt"
  fi

  mv "$tmp" "$out"
  printf '%s' "$out" | /usr/bin/pbcopy
  printf '%s\n' "$out"
  echo '✅ File path copied to clipboard'
}

say() {
  local target_vol=30

  if [[ $# -gt 0 && $1 =~ ^[0-9]{1,3}$ ]] && (( $1 >= 0 && $1 <= 100 )); then
    target_vol=$1
    shift
  fi

  # Default speech if nothing left
  if (( $# == 0 )); then
    set -- 'Hi'
  fi

  local args=()
  while (( $# )); do
    args+=("$1")
    shift
  done

  local say_cmd='/usr/bin/say'
  local q
  for q in "${args[@]}"; do
    say_cmd+=" $(printf '%q' "$q")"
  done

  osascript -e 'on run argv
    set targetVol to (item 1 of argv) as integer
    set sayCmd to item 2 of argv

    set ogVol to output volume of (get volume settings)
    set volume output volume targetVol
    try
      do shell script sayCmd
    on error errMsg number errNum
      set volume output volume ogVol
      error errMsg number errNum
    end try
    set volume output volume ogVol
  end run' "$target_vol" "$say_cmd"
}


node() {
  if [[ $# -eq 0 ]]; then
    command /opt/homebrew/bin/node -e '
const repl = require("node:repl")
const r = repl.start()
r.context.lodash = require("lodash")
'
  else
    command /opt/homebrew/bin/node "$@"
  fi
}

esc() { escape "$@"; }
escape() { pbpaste | sed 's/"/\\"/g' | /usr/bin/pbcopy; }
unesc() { unescape "$@"; }
noesc() { unescape "$@"; }
unescape() { pbpaste | sed 's/\\"/"/g' | /usr/bin/pbcopy; }
