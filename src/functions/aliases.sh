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
python() { /Users/taylor/.venvs/dotfiles/bin/python -q "$@"; }
python3() { python "$@"; }
pip3() { pip "$@"; }

clip() {
  "$@" | perl -pe 'chomp if eof' | /usr/bin/pbcopy
}

cblue() {
  echo -e "\033[34m$*\033[0m"
}

pbcopy() {
  if [ -t 0 ]; then
    clip "$@"
  else
    cblue "Tip: use 'clip <command>' to copy command output directly" >&2
    /usr/bin/pbcopy "$@"
  fi
}