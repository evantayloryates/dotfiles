#!/usr/bin/env bash
set -euo pipefail

# --- Helper functions ---
log() {
  local msg="[install_zsh] $*"
  echo "$msg" | tee -a "$HOME/log.txt"
  # Ensure output is flushed
  sync 2>/dev/null || true
}

# --- Detect OS and Architecture ---
detect_platform() {
  local os=""
  local arch=""
  
  # Detect OS
  case "$OSTYPE" in
    linux*)   os="linux" ;;
    darwin*)  os="darwin" ;;
    freebsd*) os="freebsd" ;;
    *)
      log "Unsupported OS type: $OSTYPE"
      exit 1
      ;;
  esac
  
  # Detect architecture
  arch=$(uname -m)
  case "$arch" in
    x86_64|amd64)
      arch="x86_64"
      ;;
    aarch64|arm64)
      arch="arm64"
      ;;
    i686|i386)
      arch="i686"
      ;;
    *)
      log "Unsupported architecture: $arch"
      exit 1
      ;;
  esac
  
  echo "${os}-${arch}"
}

# --- Main installation ---
log "Starting zsh binary installation..."

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$SCRIPT_DIR/bin"

# Detect platform
PLATFORM=$(detect_platform)
log "Detected platform: $PLATFORM"

# zsh-bin naming uses versioned archives like zsh-5.8-<kernel>-<arch>.tar.gz
# We support three sources, in order of preference:
#  1) Extracted package dir at bin/zsh-*-<platform>/ with bin/zsh inside
#  2) Archive at bin/zsh-*-<platform>.tar.gz (will extract)
#  3) Single-file binary at bin/zsh-<platform> (fallback, limited functionality)

found_source=""
SRC_DIR=""
ARCHIVE_FILE=""

# 1) Look for extracted package dir
if [[ -d "$BIN_DIR" ]]; then
  while IFS= read -r -d '' dir; do
    if [[ -x "$dir/bin/zsh" ]]; then
      SRC_DIR="$dir"
      found_source="dir"
      break
    fi
  done < <(find "$BIN_DIR" -maxdepth 1 -type d -name "zsh-*-${PLATFORM}" -print0 2>/dev/null || true)
fi

# 2) If not found, look for an archive
if [[ -z "$found_source" && -d "$BIN_DIR" ]]; then
  # Pick the first matching archive (sorted lexicographically)
  ARCHIVE_FILE=$(ls -1 "$BIN_DIR"/zsh-*-"${PLATFORM}".tar.gz 2>/dev/null | head -n 1 || true)
  if [[ -n "$ARCHIVE_FILE" ]]; then
    found_source="archive"
  fi
fi

# 3) Fallback to single binary
ZSH_SINGLE_BIN="$BIN_DIR/zsh-$PLATFORM"
if [[ -z "$found_source" && -f "$ZSH_SINGLE_BIN" ]]; then
  found_source="single"
fi

if [[ -z "$found_source" ]]; then
  log "❌ Error: No zsh package found for platform $PLATFORM"
  log "Looked for:"
  log "  - directory: $BIN_DIR/zsh-*-${PLATFORM}/bin/zsh"
  log "  - archive:   $BIN_DIR/zsh-*-${PLATFORM}.tar.gz"
  log "  - binary:    $ZSH_SINGLE_BIN"
  exit 1
fi

# Installation target directory
INSTALL_DIR_BASE="$SCRIPT_DIR/local"
mkdir -p "$INSTALL_DIR_BASE"
INSTALL_DIR="$INSTALL_DIR_BASE/zsh-$PLATFORM"

if [[ "$found_source" == "dir" ]]; then
  log "Using extracted zsh package at: $SRC_DIR"
  # Relocate into INSTALL_DIR if relocate script exists
  if [[ -x "$SRC_DIR/share/zsh/5.8/scripts/relocate" ]]; then
    log "Relocating zsh package to: $INSTALL_DIR"
    "$SRC_DIR/share/zsh/5.8/scripts/relocate" -s "$SRC_DIR" -d "$INSTALL_DIR"
  else
    log "Relocate script not found; copying package to: $INSTALL_DIR"
    rsync -a --delete "$SRC_DIR"/ "$INSTALL_DIR"/
  fi
  ZSH_PATH="$INSTALL_DIR/bin/zsh"
elif [[ "$found_source" == "archive" ]]; then
  log "Using zsh archive: $ARCHIVE_FILE"
  TEMP_DIR="${TMPDIR:-/tmp}/zsh-install.$$.tmp"
  mkdir -p "$TEMP_DIR"
  tar -xzf "$ARCHIVE_FILE" -C "$TEMP_DIR"
  # The archive extracts into a directory named like the archive basename without .tar.gz
  EXTRACTED_DIR="$(find "$TEMP_DIR" -maxdepth 1 -type d -name "zsh-*-${PLATFORM}" | head -n 1 || true)"
  if [[ -z "$EXTRACTED_DIR" ]]; then
    log "❌ Error: Failed to find extracted zsh directory in $TEMP_DIR"
    exit 1
  fi
  if [[ -x "$EXTRACTED_DIR/share/zsh/5.8/scripts/relocate" ]]; then
    log "Relocating zsh package to: $INSTALL_DIR"
    "$EXTRACTED_DIR/share/zsh/5.8/scripts/relocate" -s "$EXTRACTED_DIR" -d "$INSTALL_DIR"
  else
    log "Relocate script not found; copying package to: $INSTALL_DIR"
    rsync -a --delete "$EXTRACTED_DIR"/ "$INSTALL_DIR"/
  fi
  rm -rf "$TEMP_DIR"
  ZSH_PATH="$INSTALL_DIR/bin/zsh"
else
  # Single-binary fallback
  log "Using single zsh binary: $ZSH_SINGLE_BIN"
  chmod +x "$ZSH_SINGLE_BIN"
  LOCAL_BIN="$INSTALL_DIR_BASE/bin"
  mkdir -p "$LOCAL_BIN"
  ZSH_PATH="$LOCAL_BIN/zsh"
  cp "$ZSH_SINGLE_BIN" "$ZSH_PATH"
  chmod +x "$ZSH_PATH"
fi

# Verify the binary works
if ! "$ZSH_PATH" --version &>/dev/null; then
  log "⚠️  Warning: zsh may not be working properly at $ZSH_PATH"
  log "Attempting to get version info:"
  "$ZSH_PATH" --version 2>&1 | tee -a "$HOME/log.txt" || true
else
  ZSH_VERSION=$("$ZSH_PATH" --version 2>&1)
  log "zsh version: $ZSH_VERSION"
fi

# --- Update PATH in .zshrc if it exists ---
if [[ -f "$HOME/.zshrc" ]]; then
  if [[ -x "$INSTALL_DIR/bin/zsh" ]]; then
    TARGET_BIN_DIR="$INSTALL_DIR/bin"
  else
    TARGET_BIN_DIR="$INSTALL_DIR_BASE/bin"
  fi
  if ! grep -q "$TARGET_BIN_DIR" "$HOME/.zshrc" 2>/dev/null; then
    log "Adding $TARGET_BIN_DIR to PATH in .zshrc"
    echo "" >> "$HOME/.zshrc"
    echo "# Dotfiles local zsh" >> "$HOME/.zshrc"
    echo "export PATH=\"$TARGET_BIN_DIR:\$PATH\"" >> "$HOME/.zshrc"
  else
    log "PATH already includes $TARGET_BIN_DIR in .zshrc"
  fi
fi

# --- Update current PATH ---
if [[ -x "$INSTALL_DIR/bin/zsh" ]]; then
  export PATH="$INSTALL_DIR/bin:$PATH"
  log "Updated current PATH to include: $INSTALL_DIR/bin"
else
  export PATH="$INSTALL_DIR_BASE/bin:$PATH"
  log "Updated current PATH to include: $INSTALL_DIR_BASE/bin"
fi

# --- Try to set as default shell (optional, may fail without proper setup) ---
log "Attempting to register zsh as default shell..."

# Check if we can modify /etc/shells
if [[ -w /etc/shells ]]; then
  if ! grep -qxF "$ZSH_PATH" /etc/shells 2>/dev/null; then
    echo "$ZSH_PATH" | sudo tee -a /etc/shells >/dev/null 2>&1 && \
      log "Added $ZSH_PATH to /etc/shells" || \
      log "⚠️  Could not add to /etc/shells (continuing anyway)"
  fi
else
  log "⚠️  Cannot modify /etc/shells (no write access)"
fi

# Try to change default shell (this often requires the binary to be in /etc/shells)
set +e
USER="${USER:-$(whoami)}"
CURRENT_SHELL=$(getent passwd "$USER" 2>/dev/null | cut -d: -f7 || dscl . -read ~/ UserShell 2>/dev/null | awk '{print $2}' || echo "unknown")
log "Current shell: $CURRENT_SHELL"

if [[ "$CURRENT_SHELL" != "$ZSH_PATH" ]]; then
  if command -v chsh &>/dev/null; then
    log "Attempting to change shell with chsh..."
    chsh -s "$ZSH_PATH" 2>/dev/null && \
      log "✅ Successfully changed default shell to zsh" || \
      log "⚠️  Could not change default shell (you can manually run: chsh -s $ZSH_PATH)"
  else
    log "⚠️  chsh command not available"
  fi
else
  log "zsh is already the default shell"
fi
set -e

# --- Instructions for the user ---
log "✅ zsh binary installation complete!"
log ""
log "To use zsh immediately, run:"
log "  export PATH=\"$LOCAL_BIN:\$PATH\""
log "  exec \$LOCAL_BIN/zsh"
log ""
log "Or simply close and reopen your terminal if the default shell was changed."


