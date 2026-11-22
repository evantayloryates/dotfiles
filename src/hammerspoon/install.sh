#!/bin/sh
set -eu

source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
target="$HOME/.hammerspoon"

if [ -L "$target" ]; then
  [ "$(readlink "$target")" = "$source_dir" ] || {
    echo "Existing Hammerspoon symlink points elsewhere: $target" >&2
    exit 1
  }
elif [ -e "$target" ]; then
  echo "Existing Hammerspoon directory must be migrated before install: $target" >&2
  exit 1
else
  ln -s "$source_dir" "$target"
fi

test -f "$target/init.lua"
test -x "$target/SkillPicker/SkillPicker.app/Contents/MacOS/SkillPicker"
# App Nap throttles Hammerspoon timers and drops it to background priority,
# which delays hotkeys and the SecureInputHotkeys watcher. Takes effect on relaunch.
defaults write org.hammerspoon.Hammerspoon NSAppSleepDisabled -bool YES
echo "Hammerspoon source linked: $target -> $source_dir"
