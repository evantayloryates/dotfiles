#!/bin/sh
set -eu

source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
target="$HOME/.config/ghostty"

if [ -L "$target" ]; then
  [ "$(readlink "$target")" = "$source_dir" ] || {
    echo "Existing Ghostty symlink points elsewhere: $target" >&2
    exit 1
  }
elif [ -e "$target" ]; then
  echo "Existing Ghostty directory must be migrated before install: $target" >&2
  exit 1
else
  mkdir -p "$HOME/.config"
  ln -s "$source_dir" "$target"
fi

test -f "$target/config"
echo "Ghostty source linked: $target -> $source_dir"
