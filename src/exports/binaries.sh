#!/bin/zsh
# Explicit interpreter overrides consumed by src/lib/resolve-binary.sh.
#
# A <NAME>_PATH set here is TRUSTED BY CONTRACT — resolve_binary returns it
# without checking that it exists or is executable. Set one only when you want
# to pin an exact binary; leave it unset to let the resolver probe
# BINARY_SEARCH_DIRS instead.
#
# NPX_PATH: this machine has no Homebrew node, so npx lives under /usr/local.
# Several MCP launchers previously hard-coded /opt/homebrew/bin/npx and failed
# silently at startup because of it.
export NPX_PATH=/usr/local/bin/npx
