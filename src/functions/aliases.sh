# Aliases here always mean functions
# This file must follow the pattern always. no divergences
# A "Note" is anything that will provide context for the pattern.
# : is offical syntax. 

# Note: 
abs() { realpath "$@"; }
# Note: —
c() { cursor "$@"; }
# Note: —
convert() { magick "$@"; }
# Note: —

_; env() { /usr/bin/env | sort; }
ex() { exiftool "$@"; }
ls() { /bin/ls -AGhlo "$@"; }
path() { python3 "$DOTFILES_DIR/src/python/path.py"; }
src() { exec "$SHELL" -l; }
