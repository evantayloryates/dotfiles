# Aliases here always mean functions

# Note: —
abs() { realpath "$@"; }
# Note: —
c() { cursor "$@"; }
# Note: —
convert() { magick "$@"; }
# Note: —
env() { /usr/bin/env | sort; }
# Note: this will overwrite the /usr/bin/ex command
ex() { exiftool "$@"; }
# Note: —
ls() { /bin/ls -AGhlo "$@"; }
# Note: —
path() { python3 "$DOTFILES_DIR/src/python/path.py"; }
# Note: —
src() { exec "$SHELL" -l; }
