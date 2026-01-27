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

function _sb_prod() {
  ssh-keygen -R ssh-app.spaceback.me
  ssh -i ~/.ssh/aws-eb -tt root@ssh-app.spaceback.me 'echo "echo \"RUN: cd ~ && source activate && cd /app && rails c\" && source /root/activate" | bash -s && bash -i'
}

function _sb_stage() {
  ssh-keygen -R ssh-app-stage.spaceback.me
  ssh -i ~/.ssh/aws-eb -tt root@ssh-app-stage.spaceback.me 'echo "echo \"RUN: cd ~ && source activate && cd /app && rails c\" && source /root/activate" | bash -s && bash -i'
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
