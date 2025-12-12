# Aliases here always mean functions
# This file must follow the pattern always. no divergences
# A "Note" is anything that will provide context for the pattern.
# : is offical syntax. 

_; abs() { realpath "$@"; }
_; c() { cursor "$@"; }
_; convert() { magick "$@"; }
_; env() { /usr/bin/env | sort; }
_; ex() { exiftool "$@"; }
_; ls() { /bin/ls -AGhlo "$@"; }
_; path() { python3 "$DOTFILES_DIR/src/python/path.py"; }
_; src() { exec "$SHELL" -l; }
