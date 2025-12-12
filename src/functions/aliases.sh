# Aliases here always mean functions


# Note: none
abs() { realpath "$@"; }
# Note: none
c() { cursor "$@"; }
# Note: none
convert() { magick "$@"; }
# Note: none
env() { /usr/bin/env | sort; }
# Note: this will overwrite the /usr/bin/ex command
ex() { exiftool "$@"; }
# Note: none
ls() { /bin/ls -AGhlo "$@"; }
# Note: none
path() { python3 "$DOTFILES_DIR/src/python/path.py"; }
# Note: none
src() { exec "$SHELL" -l; }
