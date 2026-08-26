#!/usr/bin/env bash
#
# Homebrew + the formulae this machine expects. Called from install.sh; also
# safe to run on its own.
#
# Contract:
#   - Idempotent, and quiet when nothing is missing.
#   - `brew update` is the expensive step (it fetches every tap), so it runs
#     ONLY when at least one formula is actually missing. A re-run with
#     everything installed touches the network zero times.
#   - Linking is converged too: a formula that's installed but unlinked gets
#     re-linked, so $(brew --prefix)/bin matches what src/path/common.sh puts
#     on PATH.
#   - Never fatal. A failed install is logged and the run still exits 0, so
#     the rest of setup completes.
#   - macOS only. Homebrew runs on Linux, but pulling a full Homebrew install
#     into a devcontainer is not something setup should do behind your back.
#
# Env overrides:
#   BREW_FORMULAE  space-separated formula list (default: the array below)

[[ "$(uname)" == "Darwin" ]] || exit 0

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg"
  echo "$msg" >> "$HOME/log.txt"
}

# The formulae this machine expects. Image/video tooling — imagemagick and
# ffmpeg are the workhorses; libtiff and webp are pinned explicitly because
# they're also depended on directly (webp for assets/wallpaper.webp) rather
# than being left as incidental dependencies that a future `brew autoremove`
# could take out from under us.
FORMULAE=(libtiff webp ffmpeg imagemagick)
[[ -n "$BREW_FORMULAE" ]] && read -r -a FORMULAE <<< "$BREW_FORMULAE"

# --- Homebrew itself --------------------------------------------------------
# A fresh install doesn't put brew on PATH for the *current* process (that's
# what src/path/common.sh does for future shells), so look in both prefixes —
# /opt/homebrew on Apple Silicon, /usr/local on Intel — before concluding it's
# missing, and eval `brew shellenv` so the rest of this script can use it.

brew_bin() {
  command -v brew 2>/dev/null && return 0
  for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    [[ -x "$candidate" ]] && { echo "$candidate"; return 0; }
  done
  return 1
}

BREW="$(brew_bin)"

if [[ -z "$BREW" ]]; then
  log "🍺 Homebrew not found — installing (this may prompt for your password)"
  # NONINTERACTIVE=1 skips the installer's "press RETURN to continue" gate.
  # sudo can still prompt once, to create the prefix; that's unavoidable.
  if ! NONINTERACTIVE=1 /bin/bash -c \
      "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; then
    log "❌ Homebrew install failed — skipping the package step"
    exit 0
  fi
  BREW="$(brew_bin)"
  if [[ -z "$BREW" ]]; then
    log "❌ Homebrew installed but brew is still not on PATH — skipping the package step"
    exit 0
  fi
  log "🍺 Homebrew installed at $BREW"
fi

# Puts $(brew --prefix)/bin on PATH for the remainder of this script and any
# child process, which is the same shape src/path/common.sh gives interactive
# shells. Without it, a just-installed brew's formulae wouldn't be callable
# until the next login.
eval "$("$BREW" shellenv)"

HOMEBREW_PREFIX="$("$BREW" --prefix)"

# --- Formulae ---------------------------------------------------------------
# One `brew list` for the whole set rather than one `brew info` per formula:
# each brew invocation carries a fixed Ruby startup cost, and this step runs
# on every setup.

installed="$("$BREW" list --formula 2>/dev/null)"

missing=()
for formula in "${FORMULAE[@]}"; do
  grep -qx "$formula" <<< "$installed" || missing+=("$formula")
done

if [[ ${#missing[@]} -gt 0 ]]; then
  log "🍺 Missing ${#missing[@]} formula(e): ${missing[*]}"
  log "  🔄 brew update…"
  "$BREW" update >/dev/null 2>&1 || log "  ⚠️  brew update failed — installing against the current tap state anyway"

  # Install one at a time so a single broken formula can't take the rest of
  # the list down with it.
  for formula in "${missing[@]}"; do
    if "$BREW" install "$formula" >/dev/null 2>&1; then
      log "  ✅ Installed $formula"
    else
      log "  ❌ Failed to install $formula"
    fi
  done
else
  log "🟰 All ${#FORMULAE[@]} Homebrew formula(e) already installed — skipping brew update"
fi

# --- Linking ----------------------------------------------------------------
# Homebrew records each linked keg as a symlink under var/homebrew/linked. If
# one of ours isn't there, its binaries and headers aren't in
# $(brew --prefix)/{bin,lib,include} either, and PATH won't find them. Re-link
# only in that case — `brew link` on an already-linked formula is wasted work.
# A keg-only formula (never linked by design) fails here; that's expected and
# only worth a note.

for formula in "${FORMULAE[@]}"; do
  # Skip anything that isn't installed — a failed install above is already logged.
  [[ -d "$HOMEBREW_PREFIX/Cellar/$formula" ]] || continue
  [[ -e "$HOMEBREW_PREFIX/var/homebrew/linked/$formula" ]] && continue

  if "$BREW" link --overwrite "$formula" >/dev/null 2>&1; then
    log "  🔗 Linked $formula into $HOMEBREW_PREFIX"
  else
    log "  ℹ️  $formula is installed but not linked (keg-only) — nothing to do"
  fi
done

exit 0
