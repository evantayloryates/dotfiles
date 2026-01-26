# "Aliases" here really mean tiny oneliner functions that would 
# normally be aliases, but I prefer to avoid using the alias keyword.
# This file must follow the pattern always. no divergences
# A "Note" is anything that will provide context for the pattern.
# : is offical syntax. 
abs     () { realpath "$@"                                                               ;} # 
c       () { clip "$@"                                                                   ;} # 
clip    () { { printf '$ %s\n' "$*"; "$@"; } | perl -pe 'chomp if eof' | /usr/bin/pbcopy ;} # 
convert () { magick "$@"                                                                 ;} # 
dc      () { docker compose "$@"                                                         ;} # 
env     () { /usr/bin/env | sort                                                         ;} # 
ex      () { exiftool "$@"                                                               ;} # Note: this will overwrite the /usr/bin/ex command
ls      () { /bin/ls -AGhlo "$@"                                                         ;} # 
o       () { open "$(pwd -P 2>/dev/null || pwd)"                                         ;} # 
path    () { python3 "$DOTFILES_DIR/src/python/path.py"                                  ;} # 
pip3    () { pip "$@"                                                                    ;} # 
py      () { python "$@"                                                                 ;} # 
py3     () { python "$@"                                                                 ;} # 
python  () { /Users/taylor/.venvs/dotfiles/bin/python -q "$@"                            ;} # 
python3 () { python "$@"                                                                 ;} # 
reload  () { echo "NO EFFECT\nPlease use "$'\033[35m'"\`src\`"$'\033[0m'" instead.\n"    ;} #
src     () { clear; exec "$SHELL" -l                                                     ;} # 
yab     () { source ~/.yabairc                                                           ;} # 




git     () { if [[ $# -eq 1 && "$1" == "branch" ]]; then /usr/bin/git branch --sort=-committerdate; else /usr/bin/git "$@"; fi ;}
# Dotfiles sync
# source "$HOME/dotfiles/sync_dotfiles.sh"
# alias sync='sync_dotfiles'
# Git shortcuts
# alias gs='git status'
# alias ga='git add'
# alias gc='git commit'
# alias gp='git push'
# alias gl='git log --oneline'
# alias dc="docker compose"
# Utilities
# alias mkdir='/bin/mkdir -pv'
alias password="python3 $DOTFILES_DIR/src/python/password.py"
alias words="open $DOTFILES_DIR/src/__data/words.txt"