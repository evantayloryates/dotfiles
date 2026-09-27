ls() {
  if (( $# >= 2 )); then
    /bin/ls "$@"
    return $?
  fi

  emulate -L zsh
  setopt null_glob

  local target=${1:-.}

  # Config: callers set `local __LS_DIRS_ONLY=1` before calling ls to list
  # only directories and directory symlinks (see ld below).
  local dirs_only=${__LS_DIRS_ONLY:-0}

  # Colors (zsh prompt sequences; use print -P)
  local RESET='%f%b'
  local RED='%F{red}'
  local MAG_BOLD='%B%F{magenta}'
  local GRAY='%F{244}'
  local LYELLOW='%F{229}'
  local BLUE='%F{33}'
  local BOLD_BLUE='%B%F{33}'
  local BOLD_DIM_BLUE='%B%F{31}'
  
  # semantic colors
  local ARROW_COLOR="${GRAY}"
  local FILE_LINK_SRC="${MAG_BOLD}"
  local FILE_LINK_DST="${LYELLOW}"
  local FILE="${LYELLOW}"
  local EXECUTABLE_FILE="${RED}"
  local DIRECTORY="${BOLD_BLUE}"
  local DIR_LINK_SRC="${BOLD_BLUE}"
  local DIR_LINK_DST="${LYELLOW}"
  local HIDDEN_DIRECTORY="${BOLD_DIM_BLUE}"
  local HIDDEN_DIR_LINK_SRC="${BOLD_DIM_BLUE}"

  local COLUMN_PADDING=2
  local LEFT_PAD_ARROW_GAP=1
  local CACHE_ENABLED=1 # 0 or 1
  # Pre-compute gap string once
  local GAP_STR=$(printf '%*s' $LEFT_PAD_ARROW_GAP '')

  _is_dir_link() {
    # symlink whose resolved target is a directory
    local p=$1
    [[ -L $p && -d $p ]]
  }

  _readlink() {
    command readlink -- "$1" 2>/dev/null
  }

  _replace_home() {
    # Replace /Users/taylor with ~ in paths
    local path=$1
    [[ $path == /Users/taylor/* ]] && path="~${path#/Users/taylor}"
    print -r -- "$path"
  }

  _get_display_width() {
    # Get the display width of an entry name (without colors)
    local p=$1
    local name=${p:t}
    if _is_dir_link "$p"; then
      # Directory symlink: name + "/"
      print -r -- $((${#name} + 1))
    elif [[ -d $p && ! -L $p ]]; then
      # Regular directory: name + "/"
      print -r -- $((${#name} + 1))
    else
      # File (symlink or regular): just name
      print -r -- ${#name}
    fi
  }

  _make_arrow() {
    # Create a dynamic arrow with dashes
    # $1: current display width
    # $2: target arrow column width
    # $3: gap spaces before arrow
    local current_width=$1
    local target_width=$2
    local gap=$3
    local total_chars=$((target_width > current_width ? target_width - current_width : gap + 1))
    # Account for gap: total_chars - gap - 1 dashes, then the >
    local dash_count=$((total_chars > gap + 1 ? total_chars - gap - 1 : 0))
    if (( dash_count > 0 )); then
      # Generate dashes efficiently using printf (faster than tr subprocess)
      local dashes=$(printf '%.0s-' {1..$dash_count} 2>/dev/null || printf '%*s' $dash_count '' | tr ' ' '-')
      print -rP -- "${ARROW_COLOR}${dashes}>${RESET}"
    else
      print -rP -- "${ARROW_COLOR}>${RESET}"
    fi
  }

  _print_dir() {
    local p=$1
    local name=${p:t}
    local width=${2:-0}
    local cached_target=$3  # Optional: cached readlink result

    [[ $name == '.DS_Store' || $name == '.' || $name == '..' ]] && return 0

    # Hidden directories get a slightly dimmer blue
    local dir_color=$DIRECTORY link_src_color=$DIR_LINK_SRC
    if [[ $name == .* ]]; then
      dir_color=$HIDDEN_DIRECTORY
      link_src_color=$HIDDEN_DIR_LINK_SRC
    fi

    # Use cached target if provided, otherwise check file system
    if [[ -n $cached_target ]]; then
      local dst=$(_replace_home "$cached_target")
      local src="${name}/"
      [[ -n $dst && $dst != */ ]] && dst="${dst}/"
      local display_width=$((${#name} + 1))
      local arrow=$(_make_arrow $display_width $width $LEFT_PAD_ARROW_GAP)
      print -rP -- "${link_src_color}${src}${RESET}${GAP_STR}${arrow} ${DIR_LINK_DST}${dst}${RESET}"
    elif [[ -L $p && -d $p ]]; then
      # Fallback: not cached, check file system
      local dst=$(_readlink "$p")
      dst=$(_replace_home "$dst")
      local src="${name}/"
      [[ -n $dst && $dst != */ ]] && dst="${dst}/"
      local display_width=$((${#name} + 1))
      local arrow=$(_make_arrow $display_width $width $LEFT_PAD_ARROW_GAP)
      print -rP -- "${link_src_color}${src}${RESET}${GAP_STR}${arrow} ${DIR_LINK_DST}${dst}${RESET}"
    else
      # directory name + trailing slash
      print -rP -- "${dir_color}${name}${RESET}${dir_color}/${RESET}"
    fi
  }

  _print_file() {
    local p=$1
    local name=${p:t}
    local width=${2:-0}
    local cached_target=$3  # Optional: cached readlink result

    [[ $name == '.DS_Store' || $name == '.' || $name == '..' ]] && return 0

    if [[ -n $cached_target ]]; then
      # Use cached target
      local dst=$(_replace_home "$cached_target")
      local display_width=${#name}
      local arrow=$(_make_arrow $display_width $width $LEFT_PAD_ARROW_GAP)
      print -rP -- "${FILE_LINK_SRC}${name}${RESET}${GAP_STR}${arrow} ${FILE_LINK_DST}${dst}${RESET}"
    elif [[ -L $p ]]; then
      # Fallback: not cached, check file system
      local dst=$(_readlink "$p")
      dst=$(_replace_home "$dst")
      local display_width=${#name}
      local arrow=$(_make_arrow $display_width $width $LEFT_PAD_ARROW_GAP)
      print -rP -- "${FILE_LINK_SRC}${name}${RESET}${GAP_STR}${arrow} ${FILE_LINK_DST}${dst}${RESET}"
    else
      if [[ -x $p ]]; then
        print -rP -- "${EXECUTABLE_FILE}${name}${RESET}"
      else
        print -r -- "$name"
      fi
    fi
  }

  _sort_hidden_first_ci() {
    # Input: paths; Output: sorted paths (hidden first, case-insensitive)
    local -a hidden=() normal=()
    local p base
    for p in "$@"; do
      base=${p:t}
      [[ $base == .* ]] && hidden+=("$p") || normal+=("$p")
    done

    if (( ${#hidden[@]} )); then
      printf '%s\n' "${hidden[@]}" | LC_ALL=C sort -f
    fi
    if (( ${#normal[@]} )); then
      printf '%s\n' "${normal[@]}" | LC_ALL=C sort -f
    fi
  }

  # If target is not a directory (or is a symlink), format just that entry
  if [[ ! -d $target || -L $target ]]; then
    if _is_dir_link "$target" || ([[ -d $target && ! -L $target ]]); then
      _print_dir "$target"
    else
      _print_file "$target"
    fi
    return 0
  fi

  # Directory contents: use zsh glob qualifiers to avoid '.' and '..'
  # (D) include dotfiles, (N) nullglob
  local -a entries
  entries=( "$target"/*(DN) )

  # Single pass: split into dirs/files, calculate max width, and cache symlink targets
  # Use associative arrays to cache file type and readlink results
  typeset -A link_targets
  local -a dirs files
  local max_width=0
  local p bn name w is_link is_dir is_dir_link

  for p in "${entries[@]}"; do
    bn=${p:t}
    [[ $bn == '.DS_Store' ]] && continue

    name=$bn
    is_link=0
    is_dir=0
    is_dir_link=0

    # Single file system check per entry
    if [[ -L $p ]]; then
      is_link=1
      # Cache readlink result only if caching is enabled
      if (( CACHE_ENABLED )); then
        link_targets[$p]=$(_readlink "$p")
      fi
      # Check if symlink target is a directory (cached for later use)
      [[ -d $p ]] && is_dir_link=1
    elif [[ -d $p ]]; then
      is_dir=1
    fi

    # Dirs-only mode: files don't print, so they don't count toward width
    (( dirs_only && ! is_dir && ! is_dir_link )) && continue

    # Calculate display width immediately (avoid function call overhead)
    if (( is_dir_link )); then
      w=$((${#name} + 1))
      dirs+=("$p")
    elif (( is_dir )); then
      w=$((${#name} + 1))
      dirs+=("$p")
    else
      w=${#name}
      files+=("$p")
    fi

    # Track max width
    (( w > max_width )) && max_width=$w
  done

  local arrow_column_width=$((max_width + LEFT_PAD_ARROW_GAP + COLUMN_PADDING))

  local line cached_target
  while IFS= read -r line; do
    if [[ -n $line ]]; then
      if (( CACHE_ENABLED )); then
        cached_target=${link_targets[$line]}
      else
        cached_target=""
      fi
      _print_file "$line" "$arrow_column_width" "$cached_target"
    fi
  done < <(_sort_hidden_first_ci "${files[@]}")

  while IFS= read -r line; do
    if [[ -n $line ]]; then
      if (( CACHE_ENABLED )); then
        cached_target=${link_targets[$line]}
      else
        cached_target=""
      fi
      _print_dir "$line" "$arrow_column_width" "$cached_target"
    fi
  done < <(_sort_hidden_first_ci "${dirs[@]}")
}

# lsg [dir] words...  →  ls [dir] | grep -i -e "words..."
# With 2+ args, a first arg that has no leading hyphen and is a directory is
# the ls target; otherwise it is part of the pattern and ls lists the current
# dir. The remaining args join into one literal pattern, so `lsg -x cool`
# searches for "-x cool" rather than passing -x to grep. ls's color codes are
# stripped first so grep matches names, not escape sequences.
lsg() {
  if (( $# == 0 )); then
    print -u2 "usage: lsg [dir] <pattern words...>"
    return 2
  fi
  local target=.
  if (( $# >= 2 )) && [[ $1 != -* && -d $1 ]]; then
    target=$1
    shift
  fi
  ls "$target" | sed $'s/\e\\[[0-9;]*m//g' | grep -i --color=auto -e "$*"
}

# ld [dir...]  →  ls, directories only (including directory symlinks)
# Interactive-only: this file loads from .zshrc, so compilers, make and
# scripts still reach /usr/bin/ld (the linker). Anything that looks like
# linker input — a flag, an object/library file or an @response file — is
# passed straight to the real linker, so pasted link commands still work.
# `command ld ...` always reaches the linker.
ld() {
  local arg
  for arg in "$@"; do
    case $arg in
      -*|@*|*.o|*.a|*.dylib|*.tbd|*.so)
        command ld "$@"
        return $?
        ;;
    esac
  done

  local __LS_DIRS_ONLY=1
  (( $# == 0 )) && set -- .

  local target rc=0 first=1
  for target in "$@"; do
    if [[ ! -d $target ]]; then
      print -u2 "ld: not a directory: $target"
      rc=2
      continue
    fi
    if (( $# > 1 )); then
      (( first )) || print
      print -r -- "${target}:"
    fi
    first=0
    ls "$target"
  done
  return $rc
}
