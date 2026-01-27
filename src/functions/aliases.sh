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
  # >= 2 args: passthrough to BSD ls
  if (( $# >= 2 )); then
    /bin/ls "$@"
    return $?
  fi

  emulate -L zsh
  setopt null_glob

  local target=${1:-.}

  # Colors (256-color)
  local C_RESET='%f%b'
  local C_RED='%F{red}'
  local C_MAG_BOLD='%B%F{magenta}'
  local C_GRAY='%F{244}'
  local C_LYELLOW='%F{229}'
  local C_BLUE='%F{33}'
  local C_DBLUE='%F{18}'

  zmodload -F zsh/stat b:zstat 2>/dev/null || true

  # Formatters
  local -r arrow="${C_GRAY} -> ${C_RESET}"

  _print_file() {
    local p=$1
    local name=${p:t}
    [[ $name == '.' || $name == '..' || $name == '.DS_Store' ]] && return 0

    if [[ -L $p ]]; then
      local dst
      dst=$(command readlink -- "$p" 2>/dev/null || true)

      # Executable if the resolved target is executable
      local file_color=''
      [[ -x $p ]] && file_color=$C_RED

      print -rP -- "${C_MAG_BOLD}${name}${C_RESET}${arrow}${C_LYELLOW}${dst}${C_RESET}"
    else
      if [[ -x $p ]]; then
        print -rP -- "${C_RED}${name}${C_RESET}"
      else
        print -r -- "$name"
      fi
    fi
  }

  _print_dir() {
    local p=$1
    local name=${p:t}
    [[ $name == '.' || $name == '..' || $name == '.DS_Store' ]] && return 0

    if [[ -L $p ]]; then
      local dst
      dst=$(command readlink -- "$p" 2>/dev/null || true)

      # ensure trailing slashes for src/dst
      [[ $name != */ ]] && name="${name}/"
      [[ $dst != */ ]] && dst="${dst}/"

      print -rP -- "${C_MAG_BOLD}${name}${C_RESET}${arrow}${C_LYELLOW}${dst}${C_RESET}"
    else
      # blue dir name + dark-blue slash
      print -rP -- "${C_BLUE}${name}${C_RESET}${C_DBLUE}/${C_RESET}"
    fi
  }

  _sort_ci_hidden_first() {
    # args: list of paths; output: sorted paths
    local -a hidden=() normal=()
    local p base

    for p in "$@"; do
      base=${p:t}
      [[ $base == .* ]] && hidden+=("$p") || normal+=("$p")
    done

    local -a out=() s

    if (( ${#hidden[@]} )); then
      s=("${(@f)$(printf '%s\n' "${hidden[@]}" | LC_ALL=C sort -f)}")
      out+=("${s[@]}")
    fi

    if (( ${#normal[@]} )); then
      s=("${(@f)$(printf '%s\n' "${normal[@]}" | LC_ALL=C sort -f)}")
      out+=("${s[@]}")
    fi

    print -r -- "${out[@]}"
  }

  # If target is a file/symlink: print just that one entry with custom styling
  if [[ ! -d $target || -L $target ]]; then
    if [[ -d $target && -L $target ]]; then
      _print_dir "$target"
    else
      _print_file "$target"
    fi
    return 0
  fi

  # Directory listing (contents)
  local -a entries=() dirs=() files=()
  # include both visible and hidden (excluding . and .. via the pattern)
  entries+=("$target"/*(N) "$target"/.*~"$target"/.(|.)(N))

  local p bn
  for p in "${entries[@]}"; do
    bn=${p:t}
    [[ $bn == '.DS_Store' ]] && continue

    if [[ -d $p && ! -L $p ]]; then
      dirs+=("$p")
    elif [[ -L $p && -d $p ]]; then
      # symlink that resolves to a dir -> treat as dir link
      dirs+=("$p")
    else
      files+=("$p")
    fi
  done

  local -a sorted_dirs sorted_files
  sorted_dirs=("${(@f)$(_sort_ci_hidden_first "${dirs[@]}")}")
  sorted_files=("${(@f)$(_sort_ci_hidden_first "${files[@]}")}")

  local item
  for item in "${sorted_dirs[@]}"; do
    _print_dir "$item"
  done

  for item in "${sorted_files[@]}"; do
    _print_file "$item"
  done
}
