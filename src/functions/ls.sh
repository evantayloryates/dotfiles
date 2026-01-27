ls() {
  if (( $# >= 2 )); then
    /bin/ls "$@"
    return $?
  fi

  emulate -L zsh
  setopt null_glob

  local target=${1:-.}

  # Colors (zsh prompt sequences; use print -P)
  local RESET='%f%b'
  local RED='%F{red}'
  local MAG_BOLD='%B%F{magenta}'
  local GRAY='%F{244}'
  local LYELLOW='%F{229}'
  local BLUE='%F{33}'
  local BOLD_BLUE='%B%F{33}'
  local DBLUE='%F{18}'
  
  # semantic colors
  local ARROW_COLOR="${GRAY}"
  local FILE_LINK_SRC="${MAG_BOLD}"
  local FILE_LINK_DST="${LYELLOW}"
  local FILE="${LYELLOW}"
  local EXECUTABLE_FILE="${RED}"
  local DIRECTORY="${BOLD_BLUE}"
  local DIR_LINK_SRC="${BOLD_BLUE}"
  local DIR_LINK_DST="${LYELLOW}"

  local COLUMN_PADDING=2
  local LEFT_PAD_ARROW_GAP=1

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
      local dashes=$(printf '%*s' $dash_count '' | tr ' ' '-')
      print -rP -- "${ARROW_COLOR}${dashes}>${RESET}"
    else
      print -rP -- "${ARROW_COLOR}>${RESET}"
    fi
  }

  _print_dir() {
    local p=$1
    local name=${p:t}
    local width=${2:-0}

    [[ $name == '.DS_Store' || $name == '.' || $name == '..' ]] && return 0

    if _is_dir_link "$p"; then
      local dst=$(_readlink "$p")
      dst=$(_replace_home "$dst")
      local src="${name}/"
      [[ -n $dst && $dst != */ ]] && dst="${dst}/"
      local display_width=$((${#name} + 1))
      local gap_str=$(printf '%*s' $LEFT_PAD_ARROW_GAP '')
      local arrow=$(_make_arrow $display_width $width $LEFT_PAD_ARROW_GAP)
      print -rP -- "${DIR_LINK_SRC}${src}${RESET}${gap_str}${arrow} ${DIR_LINK_DST}${dst}${RESET}"
    else
      # directory name + trailing slash
      print -rP -- "${DIRECTORY}${name}${RESET}${DIRECTORY}/${RESET}"
    fi
  }

  _print_file() {
    local p=$1
    local name=${p:t}
    local width=${2:-0}

    [[ $name == '.DS_Store' || $name == '.' || $name == '..' ]] && return 0

    if [[ -L $p ]]; then
      local dst=$(_readlink "$p")
      dst=$(_replace_home "$dst")
      local display_width=${#name}
      local gap_str=$(printf '%*s' $LEFT_PAD_ARROW_GAP '')
      local arrow=$(_make_arrow $display_width $width $LEFT_PAD_ARROW_GAP)
      print -rP -- "${FILE_LINK_SRC}${name}${RESET}${gap_str}${arrow} ${FILE_LINK_DST}${dst}${RESET}"
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

  # Split into dirs (including dir symlinks) vs files (including file symlinks)
  local -a dirs files
  local p
  for p in "${entries[@]}"; do
    local bn=${p:t}
    [[ $bn == '.DS_Store' ]] && continue

    if [[ -d $p && ! -L $p ]]; then
      dirs+=("$p")
    elif _is_dir_link "$p"; then
      dirs+=("$p")
    else
      files+=("$p")
    fi
  done

  # Calculate maximum display width for alignment
  local max_width=0
  local w
  for p in "${files[@]}" "${dirs[@]}"; do
    w=$(_get_display_width "$p")
    (( w > max_width )) && max_width=$w
  done
  local arrow_column_width=$((max_width + LEFT_PAD_ARROW_GAP + COLUMN_PADDING))

  local line
  while IFS= read -r line; do
    [[ -n $line ]] && _print_file "$line" "$arrow_column_width"
  done < <(_sort_hidden_first_ci "${files[@]}")

  while IFS= read -r line; do
    [[ -n $line ]] && _print_dir "$line" "$arrow_column_width"
  done < <(_sort_hidden_first_ci "${dirs[@]}")
}
