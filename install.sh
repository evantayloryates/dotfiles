#!/usr/bin/env bash
#
# Machine setup. Designed to be re-run at any time: every step below either
# converges to the same state or no-ops, and no step overwrites machine-local
# edits without first taking a backup.

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg"
  echo "$msg" >> "$HOME/log.txt"
}

# Absolute path to this checkout — resolved once so every step below works the
# same whether install.sh was invoked by relative path, absolute path, or from
# another directory.
DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"

# Install zsh and configure auto-exec hooks
bash "$DOTFILES_DIR/install_zsh.sh"

# ~/dotfiles is the path every config here hardcodes (.zshrc, .zshenv, the
# LaunchAgents). Point it at this checkout when it isn't already. Never touch a
# real directory living there — only create the link or repoint a stale one.
if [[ "$DOTFILES_DIR" != "$HOME/dotfiles" ]]; then
  if [[ -L "$HOME/dotfiles" || ! -e "$HOME/dotfiles" ]]; then
    if [[ "$(readlink "$HOME/dotfiles" 2>/dev/null)" != "$DOTFILES_DIR" ]]; then
      ln -sfn "$DOTFILES_DIR" "$HOME/dotfiles"
      log "🔗 Linked ~/dotfiles → $DOTFILES_DIR"
    fi
  else
    log "⚠️  ~/dotfiles exists and is not a symlink — leaving it alone"
  fi
fi

# ~/.zshrc: the repo copy is a template, not a mirror. Once a dotfiles-managed
# ~/.zshrc is in place it stays — this machine's copy carries local additions
# (brew/bun/PATH lines; cf. .zshrc.local) that an unconditional `cp` would
# silently destroy on every re-run. Only install over a file that isn't ours,
# and back that one up first.
ZSHRC_DEST="$HOME/.zshrc"
if [[ ! -f "$ZSHRC_DEST" ]]; then
  cp "$DOTFILES_DIR/.zshrc" "$ZSHRC_DEST"
  log "📄 Installed ~/.zshrc from the dotfiles template"
elif grep -qF '$HOME/dotfiles/' "$ZSHRC_DEST"; then
  log "📄 ~/.zshrc already dotfiles-managed — leaving local edits intact"
else
  ZSHRC_BACKUP="$ZSHRC_DEST.pre-dotfiles.$(date '+%Y%m%d%H%M%S')"
  cp "$ZSHRC_DEST" "$ZSHRC_BACKUP"
  cp "$DOTFILES_DIR/.zshrc" "$ZSHRC_DEST"
  log "📄 Replaced unmanaged ~/.zshrc (backup: $ZSHRC_BACKUP)"
fi

# Ensure non-interactive shells (agents, scripts, `zsh -c`) load exported
# .env vars. ~/.zshenv is the only startup file sourced for every shell type.
# Append idempotently so we don't clobber existing ~/.zshenv content.
ZSHENV="$HOME/.zshenv"
ZSHENV_LINE='source "$HOME/dotfiles/src/exports/dotenv.sh"'
touch "$ZSHENV"
grep -qF "$ZSHENV_LINE" "$ZSHENV" || printf '\n# Load exported dotfiles env (.env) for ALL shells, incl. non-interactive\n%s\n' "$ZSHENV_LINE" >> "$ZSHENV"

# Homebrew + the formulae this machine expects (image/video tooling). Installs
# Homebrew if it's missing, and only runs `brew update` when something is
# actually missing. macOS only; never fatal.
bash "$DOTFILES_DIR/install_brew.sh"

# Clone the GitHub repos this machine expects into ~/src/github. Skips repos
# already on disk and repos the current git auth can't reach; never fatal.
bash "$DOTFILES_DIR/install_repos.sh"

# macOS system preferences (Dock position/autohide, key repeat rate). No-ops on
# Linux, and only restarts the Dock when a Dock key actually changed.
bash "$DOTFILES_DIR/install_macos_defaults.sh"

# Desktop wallpaper from assets/. No-ops on Linux, and only touches System
# Events when a desktop isn't already showing it.
bash "$DOTFILES_DIR/install_wallpaper.sh"

# macOS only: quiet the login banner, then install the user LaunchAgents kept
# in src/launchd/. See its README.md.
#   - com.taylor.mcp-tokens: bridge .env tokens into the launchd session at login
#     so GUI apps (Claude desktop, which don't read ~/.zshenv) inherit them.
#   - com.taylor.docker-prune: periodic safe Docker cleanup (no-ops when Docker
#     is down).
#   - com.taylor.keyrepeat: re-apply the persisted key-repeat preference to the
#     live HID system at each login (the live store resets every boot).
# No-op on Linux/devcontainers.
if [[ "$(uname)" == "Darwin" ]]; then
  # ~/.hushlogin suppresses Terminal's "Last login: ..." banner on every new
  # shell. Presence is the whole signal — the file's contents are irrelevant, so
  # creating it is idempotent and never clobbers anything.
  if [[ ! -f "$HOME/.hushlogin" ]]; then
    touch "$HOME/.hushlogin"
    log "🤫 Created ~/.hushlogin (silences the login banner)"
  fi

  UID_NUM=$(id -u)
  mkdir -p "$HOME/Library/LaunchAgents"
  for LA_LABEL in com.taylor.mcp-tokens com.taylor.docker-prune com.taylor.keyrepeat; do
    LA_SRC="$DOTFILES_DIR/src/launchd/$LA_LABEL.plist"
    LA_DEST="$HOME/Library/LaunchAgents/$LA_LABEL.plist"
    if [[ ! -f "$LA_SRC" ]]; then
      log "⚠️  Missing $LA_SRC — skipping $LA_LABEL"
      continue
    fi
    ln -sf "$LA_SRC" "$LA_DEST"
    launchctl bootout "gui/$UID_NUM/$LA_LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$UID_NUM" "$LA_DEST" 2>/dev/null || true
    launchctl kickstart -k "gui/$UID_NUM/$LA_LABEL" 2>/dev/null || true
    log "🔗 Linked + loaded $LA_LABEL LaunchAgent"
  done
fi

# Capture start time from devcontainer onCreateCommand and calculate total setup time
START_TIMESTAMP_FILE="/tmp/dotfiles-setup-start.timestamp"
if [[ -f "$START_TIMESTAMP_FILE" ]]; then
  SETUP_START=$(cat "$START_TIMESTAMP_FILE")
  # %3N is a GNU date extension; BSD/macOS date leaves it literal, so fall back
  # to whole seconds rather than feeding "…%3N" into the arithmetic below.
  SETUP_END=$(date +%s.%3N)
  [[ "$SETUP_END" == *N* ]] && SETUP_END=$(date +%s)
  TOTAL_DURATION=$(awk "BEGIN {printf \"%.2f\", $SETUP_END - $SETUP_START}" 2>/dev/null)
  log "📊 TOTAL SETUP TIME: ${TOTAL_DURATION}s"
  rm -f "$START_TIMESTAMP_FILE" 2>/dev/null
fi

log "✅ Setup complete"
