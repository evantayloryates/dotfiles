#!/bin/sh
# Make ~/.local/bin/codex the single codex entry point, linked to this repo's
# launcher. Idempotent. Run again if anything replaces the link (the retired
# standalone installer used to own it).
set -eu
here=$(CDPATH= cd -P -- "$(dirname -- "$0")" && pwd)
mkdir -p "$HOME/.local/bin"
ln -sfn "$here/codex" "$HOME/.local/bin/codex"
echo "linked $HOME/.local/bin/codex -> $here/codex ($("$HOME/.local/bin/codex" --version))"
