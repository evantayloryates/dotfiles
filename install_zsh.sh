#!/usr/bin/env bash
set -euo pipefail

# --- Helper functions ---
log() {
  local msg="[install_zsh] $*"
  echo "$msg" | tee -a "$HOME/log.txt"
}

have_cmd() {
  command -v "$1" &>/dev/null
}

try_sudo() {
  if have_cmd sudo && [[ $EUID -ne 0 ]]; then
    sudo "$@"
  else
    "$@"
  fi
}

install_pkg() {
  local pkg="$1"
  if have_cmd apt-get; then
    log "Installing $pkg with apt-get"
    try_sudo apt-get update -y && try_sudo apt-get install -y "$pkg"
  elif have_cmd dnf; then
    log "Installing $pkg with dnf"
    try_sudo dnf install -y "$pkg"
  elif have_cmd yum; then
    log "Installing $pkg with yum"
    try_sudo yum install -y "$pkg"
  elif have_cmd pacman; then
    log "Installing $pkg with pacman"
    try_sudo pacman -Sy --noconfirm "$pkg"
  elif have_cmd zypper; then
    log "Installing $pkg with zypper"
    try_sudo zypper install -y "$pkg"
  elif have_cmd apk; then
    log "Installing $pkg with apk"
    try_sudo apk add "$pkg"
  elif have_cmd brew; then
    log "Installing $pkg with Homebrew"
    brew install "$pkg"
  else
    log "No supported package manager found. Please install $pkg manually."
    exit 1
  fi
}

# --- Check and install zsh ---
if ! have_cmd zsh; then
  log "zsh not found, installing..."
  install_pkg zsh
else
  log "zsh is already installed."
fi

# --- Get zsh path ---
ZSH_PATH=$(command -v zsh)
log "Detected zsh at: $ZSH_PATH"

# --- Ensure zsh is listed in /etc/shells ---
if [[ -w /etc/shells ]]; then
  grep -qxF "$ZSH_PATH" /etc/shells || echo "$ZSH_PATH" | try_sudo tee -a /etc/shells >/dev/null
else
  log "Skipping /etc/shells update (no write access)."
fi

# --- Change default shell ---
CURRENT_SHELL=$(getent passwd "$USER" | cut -d: -f7)
if [[ "$CURRENT_SHELL" != "$ZSH_PATH" ]]; then
  log "Changing default shell to zsh..."
  try_sudo usermod -s "$ZSH_PATH" "$USER" 2>/dev/null || chsh -s "$ZSH_PATH" "$USER" 2>/dev/null || log "Could not change shell automatically. Please run: chsh -s $ZSH_PATH"
else
  log "zsh is already the default shell."
fi

# --- Set SHELL environment variable persistently ---
if [[ -d /etc/profile.d ]]; then
  log "Setting SHELL environment variable globally."
  echo "export SHELL=$ZSH_PATH" | try_sudo tee /etc/profile.d/zsh-default.sh >/dev/null
else
  log "Setting SHELL in ~/.profile"
  echo "export SHELL=$ZSH_PATH" >> "$HOME/.profile"
fi

# --- Detect special environments ---
if grep -qi microsoft /proc/version 2>/dev/null; then
  log "WSL detected. Restart your terminal to apply changes."
elif [[ "$OSTYPE" == "darwin"* ]]; then
  log "macOS detected. You may need to run: chsh -s $(which zsh)"
fi

log "✅ zsh installation and configuration complete."
