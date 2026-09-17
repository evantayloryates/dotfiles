# "Aliases" here really mean tiny oneliner functions that would 
# normally be aliases, but I prefer to avoid using the alias keyword.
# This file must follow the pattern always. no divergences
# A "Note" is anything that will provide context for the pattern.
# : is offical syntax. 
__kitsrc() { /Applications/kitty.app/Contents/MacOS/kitty @ load-config "$HOME/.config/kitty/kitty.conf"  ;} #
abs     () { realpath -- "$@"                                                                             ;} # Note: -- ends option parsing so paths that start with a dash (e.g. Claude project dirs named -Users-taylor-src-github-r1) are treated as paths, not flags
convert () { magick "$@"                                                                                  ;} # 
cur     () { if [ $# -eq 0 ]; then command cursor --classic "$(pwd -P 2>/dev/null || pwd)"; else command cursor --classic "$@"; fi ;} # Note: resolved from PATH, not hard-coded — the brew cask links /opt/homebrew/bin/cursor, Cursor's own "Install command" links /usr/local/bin/cursor
dc      () { docker compose "$@"                                                                          ;} # 
env     () { if [ $# -eq 0 ]; then clear; python3 "$DOTFILES_DIR/src/python/env.py"; else /usr/bin/env "$@"; fi ;} # Note: bare env pretty-prints (secrets masked; ENV_REVEAL=1 reveals); with args, real /usr/bin/env
ex      () { exiftool "$@"                                                                                ;} # Note: this will overwrite the /usr/bin/ex command
ga      () { git add "$@"                                                                                 ;} # 
gb      () { gbs "$@"                                                                                     ;} #
gbv     () { gbs --verbose "$@"                                                                           ;} #
gc      () { git commit "$@"                                                                              ;} # 
git     () { if [[ $# -eq 2 && "$1" == "branch" && "$2" == "c" ]]; then gbc; else /usr/bin/git "$@"; fi ;} #
gl      () { git_log_local_pretty                                                                         ;} # 
gp      () { git push "$@"                                                                                ;} # 
gs      () { git status "$@"                                                                              ;} # Note: this will overwrite /opt/homebrew/bin/gs (Ghostscript) interactively only; scripts/ImageMagick still resolve it from PATH, and `command gs` reaches it
lsa     () { /bin/ls -AGhlo "$@"                                                                          ;} # 
mkdir   () { [ "$#" -eq 1 ] && /bin/mkdir -pv "$1" || /bin/mkdir "$@"                                     ;} # interactive convenience: -pv prints the path. Scripts/hooks in src must call `command mkdir`.
o       () { if [ $# -eq 0 ]; then open "$(pwd -P 2>/dev/null || pwd)"; else open "$@"; fi                ;} # 
path    () { clear ; python3 "$DOTFILES_DIR/src/python/path.py"                                           ;} # 
pip3    () { pip "$@"                                                                                     ;} # 
py      () { python "$@"                                                                                  ;} # 
py3     () { python "$@"                                                                                  ;} # 
python  () { /Users/taylor/.venvs/dotfiles/bin/python -q "$@"                                             ;} # 
python3 () { python "$@"                                                                                  ;} # 
reload  () { __kitsrc; clear; source "$HOME/dotfiles/src/index.sh"                                        ;} # Note: `src` is the ~/src pathfunc
touch   () { if [ "$#" -eq 1 ] && [[ "$1" != -* ]]; then /bin/mkdir -p "${1:h}" && /usr/bin/touch "$1"; else /usr/bin/touch "$@"; fi ;} #


alias password="python3 $DOTFILES_DIR/src/python/password.py"
alias words="open $DOTFILES_DIR/src/__assets/words.txt"
