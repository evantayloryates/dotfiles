# "Aliases" here really mean tiny oneliner functions that would 
# normally be aliases, but I prefer to avoid using the alias keyword.
# This file must follow the pattern always. no divergences
# A "Note" is anything that will provide context for the pattern.
# : is offical syntax. 
_kitsrc () { /Applications/kitty.app/Contents/MacOS/kitty @ load-config "$HOME/.config/kitty/kitty.conf"  ;} #
abs     () { realpath "$@"                                                                                ;} # 
__clip  () { { cat; } | strip_ansi | /usr/bin/pbcopy                                                      ;} # Used by the "c" and "clip" global aliases
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


clip () {
  
}

alias -g c='| clip'
