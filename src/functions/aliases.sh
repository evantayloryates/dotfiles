# "Aliases" here really mean tiny oneliner functions that would 
# normally be aliases, but I prefer to avoid using the alias keyword.
# This file must follow the pattern always. no divergences
# A "Note" is anything that will provide context for the pattern.
# : is offical syntax. 
_kitsrc () { /Applications/kitty.app/Contents/MacOS/kitty @ load-config "$HOME/.config/kitty/kitty.conf"  ;} #
abs     () { realpath "$@"                                                                                ;} # 
c       () { clip "$@"                                                                                    ;} # 
clip    () { { printf '$ %s\n' "$*"; "$@"; } | perl -pe 'chomp if eof' | /usr/bin/pbcopy                  ;} # 
convert () { magick "$@"                                                                                  ;} # 
dc      () { docker compose "$@"                                                                          ;} # 
env     () { /usr/bin/env | sort                                                                          ;} # 
ex      () { exiftool "$@"                                                                                ;} # Note: this will overwrite the /usr/bin/ex command
ga      () { git add "$@"                                                                                 ;} # 
gc      () { git commit "$@"                                                                              ;} # 
git     () { if [[ $# -eq 1 && "$1" == "branch" ]]; then gbs; else /usr/bin/git "$@"; fi                  ;} #
gb      () { git branch "$@"                                                                              ;} #
gl      () { git log --oneline "$@"                                                                       ;} # 
gp      () { git push "$@"                                                                                ;} # 
lsa     () { /bin/ls -AGhlo "$@"                                                                          ;} # 
# ls() {
#   {
#     /bin/ls -AGhlo1d "$@" */ 2>/dev/null
#     /bin/ls -AGhlo1p "$@" 2>/dev/null | awk '!/\/$/'
#   }
# }

# ls      () { { /bin/ls -AGhlo1d "$@" */ 2>/dev/null; /bin/ls -AGhlo1 "$@" 2>/dev/null | awk '!/\/$/' ; }          ;} # 
mkdir   () { [ "$#" -eq 1 ] && /bin/mkdir -pv "$1" || /bin/mkdir "$@"                                     ;} #
o       () { if [ $# -eq 0 ]; then open "$(pwd -P 2>/dev/null || pwd)"; else open "$@"; fi                ;} # 
path    () { python3 "$DOTFILES_DIR/src/python/path.py"                                                   ;} # 
pip3    () { pip "$@"                                                                                     ;} # 
py      () { python "$@"                                                                                  ;} # 
py3     () { python "$@"                                                                                  ;} # 
python  () { /Users/taylor/.venvs/dotfiles/bin/python -q "$@"                                             ;} # 
python3 () { python "$@"                                                                                  ;} # 
reload  () { echo "NO EFFECT\nPlease use "$'\033[35m'"\`src\`"$'\033[0m'" instead.\n"                     ;} #
src     () { _kitsrc; clear; source "$HOME/dotfiles/src/index.sh"                                         ;} # 


alias password="python3 $DOTFILES_DIR/src/python/password.py"
alias words="open $DOTFILES_DIR/src/__data/words.txt"

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
  local ARROW="${GRAY} -> ${RESET}"

  _is_dir_link() {
    # symlink whose resolved target is a directory
    local p=$1
    [[ -L $p && -d $p ]]
  }

  _readlink() {
    command readlink -- "$1" 2>/dev/null
  }

  _print_dir() {
    local p=$1
    local name=${p:t}

    [[ $name == '.DS_Store' || $name == '.' || $name == '..' ]] && return 0

    if _is_dir_link "$p"; then
      local dst=$(_readlink "$p")
      local src="${name}/"
      [[ -n $dst && $dst != */ ]] && dst="${dst}/"
      print -rP -- "${MAG_BOLD}${src}${RESET}${ARROW}${LYELLOW}${dst}${RESET}"
    else
      # blue dir name + dark-blue trailing slash
      print -rP -- "${BLUE}${name}${RESET}${DBLUE}/${RESET}"
    fi
  }

  _print_file() {
    local p=$1
    local name=${p:t}

    [[ $name == '.DS_Store' || $name == '.' || $name == '..' ]] && return 0

    if [[ -L $p ]]; then
      local dst=$(_readlink "$p")
      print -rP -- "${MAG_BOLD}${name}${RESET}${ARROW}${LYELLOW}${dst}${RESET}"
    else
      if [[ -x $p ]]; then
        print -rP -- "${RED}${name}${RESET}"
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
    [[ -n $line ]] && _print_dir "$line"
  done < <(_sort_hidden_first_ci "${dirs[@]}")

  while IFS= read -r line; do
    [[ -n $line ]] && _print_file "$line"
  done < <(_sort_hidden_first_ci "${files[@]}")
}
