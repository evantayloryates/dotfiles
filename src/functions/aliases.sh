# "Aliases" here really mean tiny oneliner functions that would 
# normally be aliases, but I prefer to avoid using the alias keyword.
# This file must follow the pattern always. no divergences
# A "Note" is anything that will provide context for the pattern.
# : is offical syntax. 
abs     () { realpath "$@"                                                           ;} # 
c       () { cursor "$@"                                                             ;} # 
o       () { open "$(pwd -P 2>/dev/null || pwd)"                                     ;} # 
clip    () { "$@" | perl -pe 'chomp if eof' | /usr/bin/pbcopy                        ;} # 
convert () { magick "$@"                                                             ;} # 
env     () { /usr/bin/env | sort                                                     ;} # 
ex      () { exiftool "$@"                                                           ;} # Note: this will overwrite the /usr/bin/ex command
ls      () { /bin/ls -AGhlo "$@"                                                     ;} # 
path    () { python3 "$DOTFILES_DIR/src/python/path.py"                              ;} # 
pip3    () { pip "$@"                                                                ;} # 
python  () { /Users/taylor/.venvs/dotfiles/bin/python -q "$@"                        ;} # 
python3 () { python "$@"                                                             ;} # 
src     () { clear; exec "$SHELL" -l                                                 ;} # 
reload  () { echo "NO EFFECT\nPlease use "$'\033[35m'"\`src\`"$'\033[0m'" instead.\n";} #
