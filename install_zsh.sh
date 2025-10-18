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

# Build list of acceptable platform suffixes for asset name variations
PLATFORM_OS="${PLATFORM%%-*}"
PLATFORM_ARCH="${PLATFORM#*-}"
declare -a PLATFORM_SUFFIXES
PLATFORM_SUFFIXES=("$PLATFORM")

# zsh-bin uses linux-aarch64 (not linux-arm64)
if [[ "$PLATFORM_OS" == "linux" && "$PLATFORM_ARCH" == "arm64" ]]; then
  PLATFORM_SUFFIXES+=("linux-aarch64")
fi

# Some linux 32-bit builds use i386/i586/i686 variants
if [[ "$PLATFORM_OS" == "linux" && "$PLATFORM_ARCH" == "i686" ]]; then
  PLATFORM_SUFFIXES+=("linux-i386" "linux-i586")
fi

# freebsd uses amd64 rather than x86_64 in zsh-bin releases
if [[ "$PLATFORM_OS" == "freebsd" && "$PLATFORM_ARCH" == "x86_64" ]]; then
  PLATFORM_SUFFIXES+=("freebsd-amd64")
fi

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
  for suffix in "${PLATFORM_SUFFIXES[@]}"; do
    while IFS= read -r -d '' dir; do
      if [[ -x "$dir/bin/zsh" ]]; then
        SRC_DIR="$dir"
        found_source="dir"
        break 2
      fi
    done < <(find "$BIN_DIR" -maxdepth 1 -type d -name "zsh-*-${suffix}" -print0 2>/dev/null || true)
  done
fi

# 2) If not found, look for an archive
if [[ -z "$found_source" && -d "$BIN_DIR" ]]; then
  for suffix in "${PLATFORM_SUFFIXES[@]}"; do
    ARCHIVE_FILE=$(ls -1 "$BIN_DIR"/zsh-*-${suffix}.tar.gz 2>/dev/null | head -n 1 || true)
    if [[ -n "$ARCHIVE_FILE" ]]; then
      found_source="archive"
      break
    fi
  done
fi

# 3) Fallback to single binary
ZSH_SINGLE_BIN=""
if [[ -z "$found_source" ]]; then
  for suffix in "${PLATFORM_SUFFIXES[@]}"; do
    if [[ -f "$BIN_DIR/zsh-$suffix" ]]; then
      ZSH_SINGLE_BIN="$BIN_DIR/zsh-$suffix"
      found_source="single"
      break
    fi
  done
fi

if [[ -z "$found_source" ]]; then
  log "❌ Error: No zsh package found for platform $PLATFORM"
  log "Looked for these suffixes: ${PLATFORM_SUFFIXES[*]}"
  log "Examples per suffix:"
  for suffix in "${PLATFORM_SUFFIXES[@]}"; do
    log "  - directory: $BIN_DIR/zsh-*-${suffix}/bin/zsh"
    log "  - archive:   $BIN_DIR/zsh-*-${suffix}.tar.gz"
    log "  - binary:    $BIN_DIR/zsh-${suffix}"
  done
  exit 1
fi

# Installation target directory
INSTALL_DIR_BASE="$SCRIPT_DIR/local"
mkdir -p "$INSTALL_DIR_BASE"
INSTALL_DIR="$INSTALL_DIR_BASE/zsh-$PLATFORM"

if [[ "$found_source" == "dir" ]]; then
  log "Using extracted zsh package at: $SRC_DIR"
  log "Installing zsh package to: $INSTALL_DIR"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$SRC_DIR"/ "$INSTALL_DIR"/
  else
    mkdir -p "$INSTALL_DIR"
    cp -a "$SRC_DIR"/. "$INSTALL_DIR"/
  fi
  if [[ -x "$INSTALL_DIR/share/zsh/5.8/scripts/relocate" ]]; then
    log "Relocating zsh package in place: $INSTALL_DIR"
    "$INSTALL_DIR/share/zsh/5.8/scripts/relocate" -s "$INSTALL_DIR" -d "$INSTALL_DIR"
  else
    log "Relocate script not found in install; skipping relocation"
  fi
  ZSH_PATH="$INSTALL_DIR/bin/zsh"
elif [[ "$found_source" == "archive" ]]; then
  log "Using zsh archive: $ARCHIVE_FILE"
  TEMP_DIR="${TMPDIR:-/tmp}/zsh-install.$$.tmp"
  mkdir -p "$TEMP_DIR"
  tar -xzf "$ARCHIVE_FILE" -C "$TEMP_DIR"

  # zsh-bin archives typically extract bin/, share/, etc directly into the target directory.
  EXTRACTED_DIR="$TEMP_DIR"

  # If bin/zsh isn't at the root, try to find a single subdir containing bin/zsh
  if [[ ! -x "$EXTRACTED_DIR/bin/zsh" ]]; then
    CANDIDATE_DIR="$(find "$TEMP_DIR" -mindepth 1 -maxdepth 1 -type d \
      -exec test -x '{}/bin/zsh' ';' -print | head -n 1 || true)"
    if [[ -n "$CANDIDATE_DIR" ]]; then
      EXTRACTED_DIR="$CANDIDATE_DIR"
    fi
  fi

  if [[ -x "$EXTRACTED_DIR/bin/zsh" || -x "$EXTRACTED_DIR/share/zsh/5.8/scripts/relocate" ]]; then
    log "Installing zsh package to: $INSTALL_DIR"
    if command -v rsync >/dev/null 2>&1; then
      rsync -a --delete "$EXTRACTED_DIR"/ "$INSTALL_DIR"/
    else
      mkdir -p "$INSTALL_DIR"
      cp -a "$EXTRACTED_DIR"/. "$INSTALL_DIR"/
    fi
    if [[ -x "$INSTALL_DIR/share/zsh/5.8/scripts/relocate" ]]; then
      log "Relocating zsh package in place: $INSTALL_DIR"
      "$INSTALL_DIR/share/zsh/5.8/scripts/relocate" -s "$INSTALL_DIR" -d "$INSTALL_DIR"
    else
      log "Relocate script not found in install; skipping relocation"
    fi
  else
    log "❌ Error: Failed to find extracted zsh directory in $TEMP_DIR"
    rm -rf "$TEMP_DIR"
    exit 1
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

# Ensure zsh path is listed in /etc/shells (try via sudo)
if ! grep -qxF "$ZSH_PATH" /etc/shells 2>/dev/null; then
  if echo "$ZSH_PATH" | sudo tee -a /etc/shells >/dev/null 2>&1; then
    log "Added $ZSH_PATH to /etc/shells"
  else
    log "⚠️  Could not add to /etc/shells via sudo (continuing anyway)"
  fi
else
  log "$ZSH_PATH already present in /etc/shells"
fi

# Try to change default shell (this often requires the binary to be in /etc/shells)
set +e
USER="${USER:-$(whoami)}"
CURRENT_SHELL=$(getent passwd "$USER" 2>/dev/null | cut -d: -f7 || dscl . -read ~/ UserShell 2>/dev/null | awk '{print $2}' || echo "unknown")
log "Current shell: $CURRENT_SHELL"

if [[ "$CURRENT_SHELL" != "$ZSH_PATH" ]]; then
  if command -v chsh &>/dev/null; then
    log "Attempting to change shell with chsh..."
    if chsh -s "$ZSH_PATH" "$USER" 2>&1 | tee -a "$HOME/log.txt"; then
      log "✅ Successfully changed default shell to zsh"
    else
      log "⚠️  chsh failed or requires interaction"
    fi
  else
    log "⚠️  chsh command not available"
  fi
else
  log "zsh is already the default shell"
fi
set -e

# --- Setup auto-exec for devcontainers/non-login shells ---
# In devcontainers and some environments, login shell changes are ignored.
# Add a hook to auto-exec zsh from bash/sh if available.
for rcfile in "$HOME/.bashrc" "$HOME/.profile"; do
  if [[ -f "$rcfile" ]] && ! grep -q "auto-exec zsh from dotfiles" "$rcfile" 2>/dev/null; then
    log "Adding zsh auto-exec hook to $rcfile"
    cat >> "$rcfile" << 'HOOK_EOF'

# auto-exec zsh from dotfiles (added by install_zsh.sh)
if [ -z "$ZSH_VERSION" ] && [ -t 1 ]; then
  for zsh_candidate in \
    "$HOME/dotfiles/local/zsh-"*/bin/zsh \
    "$HOME/dotfiles/local/bin/zsh"
  do
    if [ -x "$zsh_candidate" ]; then
      export SHELL="$zsh_candidate"
      exec "$zsh_candidate" -l
    fi
  done
fi
HOOK_EOF
  fi
done

# --- Instructions for the user ---
log "✅ zsh binary installation complete!"
log ""
log "To use zsh immediately, run:"
log "  exec zsh -l"
log ""
log "Or close and reopen your terminal."


