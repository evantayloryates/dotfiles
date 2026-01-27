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
  local DBLUE='%F{18}'
  
  # semantic colors
  local ARROW_COLOR="${GRAY}"
  local FILE_LINK_SRC="${MAG_BOLD}"
  local FILE_LINK_DST="${LYELLOW}"
  local FILE="${LYELLOW}"
  local EXECUTABLE_FILE="${RED}"
  local DIRECTORY="${BLUE}"
  local DIR_LINK_SRC="${DBLUE}"
  local DIR_LINK_DST="${LYELLOW}"

  local ARROW="${ARROW_COLOR} -> ${RESET}"

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

  _print_dir() {
    local p=$1
    local name=${p:t}

    [[ $name == '.DS_Store' || $name == '.' || $name == '..' ]] && return 0

    if _is_dir_link "$p"; then
      local dst=$(_readlink "$p")
      dst=$(_replace_home "$dst")
      local src="${name}/"
      [[ -n $dst && $dst != */ ]] && dst="${dst}/"
      print -rP -- "${DIR_LINK_SRC}${src}${RESET}${ARROW}${DIR_LINK_DST}${dst}${RESET}"
    else
      # directory name + trailing slash
      print -rP -- "${DIRECTORY}${name}${RESET}${DIRECTORY}/${RESET}"
    fi
  }

  _print_file() {
    local p=$1
    local name=${p:t}

    [[ $name == '.DS_Store' || $name == '.' || $name == '..' ]] && return 0

    if [[ -L $p ]]; then
      local dst=$(_readlink "$p")
      dst=$(_replace_home "$dst")
      print -rP -- "${FILE_LINK_SRC}${name}${RESET}${ARROW}${FILE_LINK_DST}${dst}${RESET}"
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

  local line
  while IFS= read -r line; do
    [[ -n $line ]] && _print_file "$line"
  done < <(_sort_hidden_first_ci "${files[@]}")

  while IFS= read -r line; do
    [[ -n $line ]] && _print_dir "$line"
  done < <(_sort_hidden_first_ci "${dirs[@]}")
}
