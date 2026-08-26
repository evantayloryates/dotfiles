#!/usr/bin/env bash
#
# Desktop wallpaper. Called from install.sh; also safe to run on its own.
#
# Contract:
#   - Idempotent, and gated on real change: System Events is asked what every
#     desktop is currently showing, and the setter only runs if at least one
#     of them differs. Setting the picture is a visible flash on every space,
#     so a re-run with the right wallpaper already up does nothing at all.
#   - Never fatal. A missing asset or a System Events refusal (e.g. Automation
#     permission not yet granted) is logged and the run still exits 0.
#   - No-op on non-Darwin.
#
# Env overrides:
#   WALLPAPER  path to the image (default: assets/wallpaper.webp in this checkout)

[[ "$(uname)" == "Darwin" ]] || exit 0

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg"
  echo "$msg" >> "$HOME/log.txt"
}

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"
WALLPAPER="${WALLPAPER:-$DOTFILES_DIR/assets/wallpaper.webp}"

if [[ ! -f "$WALLPAPER" ]]; then
  log "⚠️  Wallpaper not found at $WALLPAPER — skipping"
  exit 0
fi

# `get picture` returns one path per desktop, comma-separated:
#   /path/to/a.webp, /path/to/a.webp
# System Events echoes back verbatim whatever path it was *set* with — it does
# not resolve symlinks (verified). So normalize to the physical path here:
# invoked through ~/dotfiles the script would otherwise set the symlink path,
# and a later run from the real checkout would see a mismatch and re-set it,
# flip-flopping forever. Normalizing means either entry point converges on the
# same string and every run after the first no-ops.
WALLPAPER="$(cd "$(dirname "$WALLPAPER")" && pwd -P)/$(basename "$WALLPAPER")"

current="$(osascript -e 'tell application "System Events" to tell every desktop to get picture' 2>/dev/null)"

needs_set=0
if [[ -z "$current" ]]; then
  # Couldn't read it (no desktop session, or Automation permission not granted
  # yet). Fall through and try to set it — the setter's own error is the more
  # useful signal.
  needs_set=1
  log "⚠️  Couldn't read the current wallpaper — attempting to set it anyway"
else
  saved_ifs="$IFS"
  IFS=','
  for pic in $current; do
    # Trim the space AppleScript puts after each comma.
    pic="${pic#"${pic%%[![:space:]]*}"}"
    pic="${pic%"${pic##*[![:space:]]}"}"
    [[ "$pic" == "$WALLPAPER" ]] || needs_set=1
  done
  IFS="$saved_ifs"
fi

if [[ "$needs_set" -eq 0 ]]; then
  log "🟰 Wallpaper already set to $WALLPAPER"
  exit 0
fi

if osascript -e "tell application \"System Events\" to tell every desktop to set picture to \"$WALLPAPER\"" >/dev/null 2>&1; then
  log "🖼  Wallpaper → $WALLPAPER"
else
  log "⚠️  Failed to set the wallpaper — grant Automation access for System Events and re-run"
fi

exit 0
