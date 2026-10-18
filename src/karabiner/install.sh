#!/bin/sh
set -eu

source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
target="$HOME/.config/karabiner"
linked=0

if [ -L "$target" ]; then
  [ "$(readlink "$target")" = "$source_dir" ] || {
    echo "Existing Karabiner symlink points elsewhere: $target" >&2
    exit 1
  }
elif [ -e "$target" ]; then
  echo "Existing Karabiner directory must be migrated before install: $target" >&2
  exit 1
else
  mkdir -p "$HOME/.config"
  ln -s "$source_dir" "$target"
  linked=1
fi

test -f "$target/karabiner.json"
if [ "$linked" -eq 1 ] && command -v launchctl >/dev/null 2>&1; then
  launchctl kickstart -k "gui/$(id -u)/org.pqrs.service.agent.Karabiner-Console-User-Server" 2>/dev/null || true
fi
echo "Karabiner source linked: $target -> $source_dir"
