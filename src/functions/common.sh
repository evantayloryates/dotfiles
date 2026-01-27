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
  setopt localoptions ksharrays

  local choices=(
    app
    browser
    browserless
    client_webpack_dev
    memcached
    minio
    nginx
    ngrok
    postgres_db
    proxy
    redis
    sidekiq
    webpack_dev
  )

  local -A aliases=(
    app a
    browser br
    browserless bl
    client_webpack_dev c
    memcached mem
    minio mio
    nginx nx
    ngrok ng
    postgres_db pg
    proxy pr
    redis red
    sidekiq sk
    webpack_dev web
  )

  local tty='/dev/tty'

  local i=0
  while [ $i -lt ${#choices[@]} ]; do
    local name="${choices[$i]}"
    local alias="${aliases[$name]}"
    if [ -n "${alias}" ]; then
      printf '%s) %s (%s)\n' "$((i + 1))" "${name}" "${alias}" > "${tty}"
    else
      printf '%s) %s\n' "$((i + 1))" "${name}" > "${tty}"
    fi
    i=$((i + 1))
  done

  printf '\n' > "${tty}"

  local input
  printf 'Selected: \033[32m' > "${tty}"
  IFS= read -r input < "${tty}"
  printf '\033[0m' > "${tty}"

  # empty → invalid
  if [ -z "${input}" ]; then
    __log "$(_red 'Invalid input')"
    return 1
  fi

  # numeric selection
  if echo "${input}" | grep -Eq '^[0-9]+$'; then
    if [ "${input}" -ge 1 ] && [ "${input}" -le ${#choices[@]} ]; then
      echo "${choices[$((input - 1))]}"
      return 0
    fi

    __log "$(_red 'Invalid input')"
    return 1
  fi

  # service name OR alias
  local i=0
  while [ $i -lt ${#choices[@]} ]; do
    local name="${choices[$i]}"
    local alias="${aliases[$name]}"

    local index=$((i + 1))
    local index_fmt
    if [ "${index}" -lt 10 ]; then
      index_fmt=" ${index}"
    else
      index_fmt="${index}"
    fi

    if [ -n "${alias}" ]; then
      printf '%s) %s (%s)\n' "${index_fmt}" "${name}" "${alias}" > "${tty}"
    else
      printf '%s) %s\n' "${index_fmt}" "${name}" > "${tty}"
    fi

    i=$((i + 1))
  done


  __log "$(_red 'Invalid input')"
  return 1
}

function _exec_amplify() {
  local service="$1"

  if [ -z "${service}" ]; then
    service="$(_select_container)" || true
    if [ -z "${service}" ]; then
      __log "No service selected. Exiting."
      return 0
    fi
  fi

  # confirm service exists in this compose project
  if ! docker compose ps --services | grep -qx "${service}"; then
    __log "$(_red "exec_amplify: unknown service '${service}'")"
    return 1
  fi

  __log "Opening shell in service: $(_magenta "${service}")"

  # prefer bash if available; fall back to sh
  if docker compose exec -T "${service}" /bin/bash -lc 'exit' >/dev/null 2>&1; then
    docker compose exec -it "${service}" /bin/bash
  else
    docker compose exec -it "${service}" /bin/sh
  fi
}


function sb() {
  local magenta="\033[35m"
  local reset="\033[0m"
  echo "NO EFFECT"
  echo "Please use ${magenta}amp prod${reset} or ${magenta}amp stage${reset} instead"
}

json() {
  local TMPFILE
  TMPFILE="$(mktemp /tmp/jsonfmt.XXXXXX)"

  pbpaste > "$TMPFILE"

  npx ts-node ~/src/scripts/json-inline-format.ts "$TMPFILE" >/dev/null 2>&1

  pbcopy < "$TMPFILE"

  echo '✅ JSON formatted and copied back to clipboard'
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
  local ts
  local tmp
  local lines
  local out

  ts="$(date '+%H%M%S')"
  tmp="$(mktemp)"

  pbpaste > "$tmp"

  lines="$(wc -l < "$tmp" | tr -d '[:space:]')"
  out="$desktop/clipsend-$ts-$lines-lines.txt"

  mkdir -p "$desktop"
  mv "$tmp" "$out"
  printf '%s\n' "$out"
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
