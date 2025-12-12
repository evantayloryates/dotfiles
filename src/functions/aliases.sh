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
note: 'some prefix comment';
env() { /usr/bin/env | sort; }
# Note: this will overwrite the /usr/bin/ex command
ex() { exiftool "$@"; }
# Note: —
ls() { /bin/ls -AGhlo "$@"; }
# Note: —
path() { python3 "$DOTFILES_DIR/src/python/path.py"; }
# Note: —
src() { exec "$SHELL" -l; }
