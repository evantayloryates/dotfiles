# "Aliases" here really mean tiny oneliner functions that would 
# normally be aliases, but I prefer to avoid using the alias keyword.
# This file must follow the pattern always. no divergences
# A "Note" is anything that will provide context for the pattern.
# : is offical syntax. 
_; abs() { realpath "$@"; }
_; c() { cursor "$@"; }
_; convert() { magick "$@"; }
_; env() { /usr/bin/env | sort; }
_ ' Note: this will overwrite the /usr/bin/ex command'; ex() { exiftool "$@"; }
_; ls() { /bin/ls -AGhlo "$@"; }
_; path() { python3 "$DOTFILES_DIR/src/python/path.py"; }
_; src() { exec "$SHELL" -l; }
function python() { /Users/taylor/.venvs/dotfiles/bin/python -q "$@"; }
function python3() { python "$@"; }
function pip3() { pip "$@"; }
python3() {
  if [ "$VIRTUAL_ENV" != '/Users/taylor/.venvs/dotfiles' ]; then
    echo 'error: dotfiles venv not active' >&2
    return 1
  fi

  python "$@"
}

pip3() {
  if [ "$VIRTUAL_ENV" != '/Users/taylor/.venvs/dotfiles' ]; then
    echo 'error: dotfiles venv not active' >&2
    return 1
  fi

  pip "$@"
}
