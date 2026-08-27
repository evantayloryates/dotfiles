#!/bin/zsh
# Interactive-shell access to the shared binary resolver.
#
# The implementation is POSIX sh in src/lib/ so the bash MCP launchers in
# src/mcps/ can source the exact same logic. This file only puts resolve_binary
# on the interactive path; it deliberately adds no behavior of its own.
#
#   resolve_binary npx   -> /usr/local/bin/npx
#
# src/lib/ is not one of the categories index.sh sources, so pull it in here.
: "${DOTFILES_DIR:=$HOME/dotfiles}"
if [ -r "$DOTFILES_DIR/src/lib/resolve-binary.sh" ]; then
  source "$DOTFILES_DIR/src/lib/resolve-binary.sh"
fi
