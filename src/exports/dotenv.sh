#!/bin/zsh
# Load and export variables from dotfiles/.env.
#
# Self-contained on purpose: this is sourced two ways —
#   1. ~/.zshenv  → runs for EVERY shell (login/non-login, interactive AND
#      non-interactive `zsh -c`), so agents and scripts get the vars too.
#   2. src/index.sh exports loop → the normal interactive path.
# Loading is idempotent, so running it twice is harmless.
#
# `set -a` (allexport) auto-exports every assignment that `source` parses,
# so the shell handles quoting, comments, and blank lines for us.
: "${DOTFILES_DIR:=$HOME/dotfiles}"
if [ -r "$DOTFILES_DIR/.env" ]; then
  set -a
  source "$DOTFILES_DIR/.env"
  set +a
fi
