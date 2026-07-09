#!/bin/zsh
# Bridge every variable defined in dotfiles/.env into the launchd *user
# session* so GUI-launched apps inherit them.
#
# Why this exists:
#   macOS apps started from Finder/Dock/Spotlight (e.g. the Claude desktop
#   app) do NOT read ~/.zshenv or ~/.zshrc, so any token defined only in the
#   shell is invisible to them. Claude's MCP config (~/.claude.json) references
#   these tokens via ${VAR}; without them the http Linear server fails auth on
#   connect (401) and the stdio rollbar/webflow servers spawn unauthenticated.
#
#   `launchctl setenv` puts the values into the per-user launchd environment,
#   which GUI apps launched *afterward* inherit. Run at login by the
#   com.taylor.mcp-tokens LaunchAgent (RunAtLoad). Idempotent — safe to re-run.
#
# Secrets are NOT stored here: they are read at runtime from the gitignored
# dotfiles/.env via the same loader the shell uses.

: "${DOTFILES_DIR:=$HOME/dotfiles}"

# Loads .env into the environment (dotenv.sh uses `set -a` internally).
source "$DOTFILES_DIR/src/exports/dotenv.sh"

# Export EVERY variable defined in .env into the launchd user session. .env is
# the single source of truth: add a secret there and GUI apps pick it up on the
# next login (or after re-running this script) — no edit here required.
#
# Names are parsed from the file (assignment lines, optional `export ` prefix);
# values come from the environment sourced above, so quoting/escaping is handled
# by the shell exactly as the interactive path sees them.
for var in ${(f)"$(grep -oE '^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*=' "$DOTFILES_DIR/.env" | sed -E 's/^[[:space:]]*(export[[:space:]]+)?//; s/=$//')"}; do
  val="${(P)var}"            # zsh indirect expansion: value of the named var
  if [[ -n "$val" ]]; then
    launchctl setenv "$var" "$val"
  fi
done
