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

function __ssh_prod() {
  ssh-keygen -R ssh-app.spaceback.me
  ssh -i ~/.ssh/aws-eb -tt root@ssh-app.spaceback.me 'echo "echo \"RUN: cd ~ && source activate && cd /app && rails c\" && source /root/activate" | bash -s && bash -i'
}

function __ssh_stage() {
  ssh-keygen -R ssh-app-stage.spaceback.me
  ssh -i ~/.ssh/aws-eb -tt root@ssh-app-stage.spaceback.me 'echo "echo \"RUN: cd ~ && source activate && cd /app && rails c\" && source /root/activate" | bash -s && bash -i'
}

__red() { printf '\033[31m%s\033[0m' "$1"; }
__magenta() { printf '\033[35m%s\033[0m' "$1"; }

function __log() {
  local tty='/dev/tty'
  if [ -w "${tty}" ]; then
    printf '%s\n' "$1" > "${tty}"
  else
    printf '%s\n' "$1" >&2
  fi
}

function __select_container() {
  local initial_input="$1"
  printf '%s\n' "${initial_input}" | python3 "${DOTFILES_DIR}/src/python/selector.py"
}

function __amplify_validate_services() {
  local caller="$1"
  shift
  local amplify_dir="${HOME}/src/github/amplify"
  local available
  available="$(docker compose --project-directory "${amplify_dir}" ps --services)" || return 1

  local s
  for s in "$@"; do
    if ! grep -qx "${s}" <<<"${available}"; then
      __log "$(__red "${caller}: unknown service '${s}'")"
      return 1
    fi
  done
}

function __amplify_exec() {
  local raw="$1"
  local amplify_dir="${HOME}/src/github/amplify"

  raw="$(__select_container "${raw}")" || true
  if [ -z "${raw}" ]; then
    return 0
  fi

  # exec only targets a single container; take the first selected service
  local service="${raw%%$'\n'*}"

  __amplify_validate_services "exec_amplify" "${service}" || return 1

  __log "↓ Opening shell in: $(__magenta "${service}")"
  __log ""

  # prefer bash if available; fall back to sh
  if docker compose --project-directory "${amplify_dir}" exec -T "${service}" /bin/bash -lc 'exit' >/dev/null 2>&1; then
    docker compose --project-directory "${amplify_dir}" exec -it "${service}" /bin/bash
  else
    docker compose --project-directory "${amplify_dir}" exec -it "${service}" /bin/sh
  fi
}

function __amplify_logs() {
  local raw="$1"
  local amplify_dir="${HOME}/src/github/amplify"

  raw="$(__select_container "${raw}")" || true
  if [ -z "${raw}" ]; then
    return 0
  fi

  local -a services
  services=(${(f)raw})

  __amplify_validate_services "__amplify_logs" "${services[@]}" || return 1

  __log "↓ Tailing logs for: $(__magenta "${services[*]}")"
  __log ""

  dc --project-directory "${amplify_dir}" logs --tail=200 --follow "${services[@]}"
}

function __amplify_restart() {
  local raw="$1"
  local amplify_dir="${HOME}/src/github/amplify"

  raw="$(__select_container "${raw}")" || true
  if [ -z "${raw}" ]; then
    return 0
  fi

  local -a services
  services=(${(f)raw})

  __amplify_validate_services "__amplify_restart" "${services[@]}" || return 1

  __log "↓ Restarting container: $(__magenta "${services[*]}")"
  __log ""

  dc --project-directory "${amplify_dir}" restart "${services[@]}"
}

function __amplify_update() {
  local amplify_dir="${HOME}/src/github/amplify"
  local branch
  branch="$(git -C "${amplify_dir}" rev-parse --abbrev-ref HEAD 2>/dev/null)" || {
    __log "$(__red "__amplify_update: cannot determine current branch")"
    return 1
  }

  case "$branch" in
    master | production)
      __log "$(__red "__amplify_update: refused on branch '${branch}'")"
      return 1
      ;;
  esac
  local msg="$*"
  [[ -z "$msg" ]] && msg="updates"
  git -C "${amplify_dir}" add -A ;
    git -C "${amplify_dir}" reset -- config/application.rb config/environments/development.rb packages spec/fixtures/files/.X11-unix/ ;
    git -C "${amplify_dir}" commit -m "${msg}" ;
    git -C "${amplify_dir}" push -f
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
  local MINIFY_ARGS=()

  if [[ "$2" == min ]] || { [[ "$1" == min ]] && [[ $# -eq 1 ]]; }; then
    MINIFY_ARGS=(min)
  fi

  JSON_PARSE_ERROR_SIGNAL='[JSON_PARSE_ERROR_SIGNAL]'
  export JSON_PARSE_ERROR_SIGNAL
  TMPFILE="$(mktemp /tmp/jsonfmt.XXXXXX)"

  pbpaste > "$TMPFILE"

  # npx node ~/src/scripts/json-inline-format.ts "$TMPFILE" >/dev/null 2>&1
  /opt/homebrew/bin/node "$DOTFILES_DIR/src/javascript/json-inline-format.js" "$TMPFILE" "${MINIFY_ARGS[@]}" >/dev/null 2>&1

  TMPFILE_CONTENT="$(<"$TMPFILE")"
  if [[ "$TMPFILE_CONTENT" == "${JSON_PARSE_ERROR_SIGNAL}"* ]]; then
    SIGNAL_LEN=${#JSON_PARSE_ERROR_SIGNAL}
    ERROR_MESSAGE="${TMPFILE_CONTENT:$SIGNAL_LEN}"
    ERROR_MESSAGE="${ERROR_MESSAGE#\[}"
    ERROR_MESSAGE="${ERROR_MESSAGE%\]}"
    printf 'Error parsing JSON:\n\n \033[0;90m==>\033[0m \033[1;31m%s\033[0m\n\n' "$ERROR_MESSAGE"
  else
    pbcopy < "$TMPFILE"
    if [[ ${#MINIFY_ARGS[@]} -gt 0 ]]; then
      echo '✅ JSON minified and copied back to clipboard'
    else
      echo '✅ JSON formatted and copied back to clipboard'
    fi
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

# Echo a path in $1 for name $2 that does not exist yet, adding -1, -2, ...
# before the extension until it is free.
__clipsend_free_path() {
  local dir="$1"
  local name="$2"
  local stem="$name"
  local ext=""
  local candidate="$dir/$name"
  local n=1

  if [[ "$name" == *.* && "$name" != .* ]]; then
    stem="${name%.*}"
    ext=".${name##*.}"
  fi

  while [[ -e "$candidate" ]]; do
    candidate="$dir/${stem}-${n}${ext}"
    ((n++))
  done
  printf '%s' "$candidate"
}

# Save the clipboard to ~/Desktop and put the saved path on the clipboard.
#   clipsend [name]
# Text is written as-is. A copied Finder file (or several) is copied over with
# its own name. Image data (screenshot, "Copy Image") is saved as PNG, or as
# the format the name's extension asks for (.jpg, .tiff, .gif, .bmp).
clipsend() {
  local desktop="$HOME/Desktop"
  local custom_name="${1##*/}"
  local helper="$DOTFILES_DIR/src/javascript/clipsend-pasteboard.js"
  local ts
  local info
  local kind
  local src
  local name
  local fmt
  local tmp
  local lines
  local out
  local -a sources
  local -a outs

  ts="$(date '+%H%M%S')"
  mkdir -p "$desktop"

  if ! info="$(/usr/bin/osascript -l JavaScript "$helper" inspect 2>&1)"; then
    echo "❌ Could not read the clipboard: $info" >&2
    return 1
  fi
  kind="${info%%$'\n'*}"

  case "$kind" in
    files)
      sources=("${(@f)${info#*$'\n'}}")
      if [[ -n "$custom_name" && ${#sources} -gt 1 ]]; then
        echo "⚠️  ${#sources} files on the clipboard; ignoring name '$custom_name'" >&2
        custom_name=""
      fi
      for src in "${sources[@]}"; do
        name="${src:t}"
        if [[ -n "$custom_name" ]]; then
          name="$custom_name"
          # keep the source extension when the given name has none
          if [[ "$name" != *.* && "${src:t}" == ?*.* ]]; then
            name="$name.${src:t:e}"
          fi
        fi
        out="$(__clipsend_free_path "$desktop" "$name")"
        if ! /bin/cp -Rp "$src" "$out"; then
          echo "❌ Could not copy $src" >&2
          return 1
        fi
        outs+=("$out")
      done
      ;;
    image)
      name="${custom_name:-clipsend-$ts-image.png}"
      case "${name:e:l}" in
        png) fmt=png ;;
        jpg|jpeg) fmt=jpeg ;;
        tif|tiff) fmt=tiff ;;
        gif) fmt=gif ;;
        bmp) fmt=bmp ;;
        *) fmt=png; name="$name.png" ;;
      esac
      out="$(__clipsend_free_path "$desktop" "$name")"
      if ! info="$(/usr/bin/osascript -l JavaScript "$helper" write-image "$out" "$fmt" 2>&1)"; then
        echo "❌ Could not save clipboard image: $info" >&2
        return 1
      fi
      outs+=("$out")
      ;;
    empty)
      echo '❌ Nothing on the clipboard that clipsend can save' >&2
      return 1
      ;;
    *)
      tmp="$(mktemp)"
      pbpaste > "$tmp"
      lines="$(wc -l < "$tmp" | tr -d '[:space:]')"
      out="$(__clipsend_free_path "$desktop" "${custom_name:-clipsend-$ts-$lines-lines.txt}")"
      mv "$tmp" "$out"
      outs+=("$out")
      ;;
  esac

  printf '%s' "${(F)outs}" | /usr/bin/pbcopy
  printf '%s\n' "${outs[@]}"
  if (( ${#outs} > 1 )); then
    echo '✅ File paths copied to clipboard'
  else
    echo '✅ File path copied to clipboard'
  fi
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

cursor_path() {
  local target_item="${1:-.}"

  if [[ ! -e "$target_item" ]]; then
    __log "$(__red "cursor_path: invalid target '${target_item}'")"
    return 1
  fi

  # --classic disables Cursor's "glass" multi-workbench mode, which otherwise
  # opens the target in the agents window instead of a normal editor window.
  # Matches the `cur` alias, which has always passed it.
  if ! command cursor --classic "$target_item"; then
    __log "$(__red "cursor_path: cursor failed for '${target_item}'")"
    return 1
  fi
}

cd_and_cursor() {
  cursor_path "$@"
}


typeset -A _cc_models
_cc_model_slug() {
  local model="$1"
  shift
  local slug
  for slug in "$@"; do
    _cc_models[$slug]="$model"
  done
}

_cc_model_slug claude-fable-5-1            fab fab5 fable fable5 fab51 fable51
_cc_model_slug claude-fable-5              fab50 fable50
_cc_model_slug claude-haiku-4-5-20251001   hai hai4 hai45 haiku haiku4 haiku45
_cc_model_slug claude-opus-5               op op5 opus opus5
_cc_model_slug claude-opus-4-8             op4 op48 opus4 opus48
_cc_model_slug claude-opus-4-7             op47 opus47
_cc_model_slug claude-opus-4-6             op46 opus46
_cc_model_slug claude-opus-4-5-20251101    op45 opus45
_cc_model_slug claude-opus-4-20250514      op42 opus42
_cc_model_slug claude-opus-4-1-20250805    op41 opus41
_cc_model_slug claude-sonnet-5             son son5 sonnet sonnet5
_cc_model_slug claude-sonnet-4-6           son4 son46 sonnet4 sonnet46
_cc_model_slug claude-sonnet-4-5-20250929  son45 sonnet45
_cc_model_slug claude-sonnet-4-20250514    son40 sonnet40

# Model used when `cc` is called without a slug or an explicit --model.
_CC_DEFAULT_MODEL=claude-opus-5

# Note: this will overwrite the /usr/bin/cc command
cc() {
  local model="$_CC_DEFAULT_MODEL"
  if [[ -n "$1" && -n "${_cc_models[$1]:-}" ]]; then
    model="${_cc_models[$1]}"
    shift
  fi

  # An explicit --model/--model=... in the args wins over the default.
  local arg
  for arg in "$@"; do
    if [[ "$arg" == --model || "$arg" == --model=* ]]; then
      "$HOME/.local/bin/claude" --dangerously-skip-permissions "$@"
      return
    fi
  done

  "$HOME/.local/bin/claude" --dangerously-skip-permissions --model "$model" "$@"
}
