#!/bin/sh
# Scoped installer: shell routing + the two relevant LaunchAgents only.
# Does not run the broader machine installer or access any 1Password account.
set -eu
DOTFILES_CHECKOUT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
exec /usr/bin/python3 -B "$DOTFILES_CHECKOUT/src/onepassword/install.py" "$@"
