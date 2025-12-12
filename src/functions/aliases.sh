# "Aliases" here really mean tiny oneliner functions that would 
# normally be aliases, but I prefer to avoid using the alias keyword.
# This file must follow the pattern always. no divergences
# A "Note" is anything that will provide context for the pattern.
# : is offical syntax. 
_ ' Note: this will overwrite the /usr/bin/ex command'; ex() { exiftool "$@"; }
_; abs() { realpath "$@"; }
_; c() { cursor "$@"; }
_; clip() { "$@" | perl -pe 'chomp if eof' | /usr/bin/pbcopy; }
_; convert() { magick "$@"; }
_; env() { /usr/bin/env | sort; }
_; ls() { /bin/ls -AGhlo "$@"; }
_; path() { python3 "$DOTFILES_DIR/src/python/path.py"; }
_; pip3() { pip "$@"; }
_; python() { /Users/taylor/.venvs/dotfiles/bin/python -q "$@"; }
_; python3() { python "$@"; }
_; src() { exec "$SHELL" -l; }


