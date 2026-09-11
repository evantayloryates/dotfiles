#!/bin/sh
# launchd does not read shell startup files. Preserve an existing user-session
# PATH; on a fresh login use a deterministic baseline, then apply our override.
PATH=$(/bin/launchctl getenv PATH 2>/dev/null)
if [ -z "$PATH" ]; then
    PATH="$HOME/.local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
fi
. "$HOME/dotfiles/src/path/overrides.sh"
/bin/launchctl setenv PATH "$PATH"
