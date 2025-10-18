#!/bin/bash

# Log function
log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg" | tee -a "$HOME/log.txt"
}

# Install ncurses-term and system zsh for terminal definitions (fixes backspace display issues)
APT_START=$(date +%s)
if command -v zsh >/dev/null 2>&1 && dpkg -l ncurses-term >/dev/null 2>&1; then
  log "System zsh and ncurses-term already installed, skipping apt"
else
  log "Installing ncurses-term and system zsh..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq >/dev/null 2>&1 && \
    sudo apt-get install -y ncurses-term zsh >/dev/null 2>&1 && \
      log "✅ ncurses-term and zsh installed" || log "⚠️  Could not install packages"
  fi
fi
APT_END=$(date +%s)
APT_DURATION=$((APT_END - APT_START))
log "apt packages took ${APT_DURATION}s"

# Install and configure custom zsh (only if system zsh not available)
if ! command -v zsh >/dev/null 2>&1; then
  log "System zsh not found, installing custom zsh binary..."
  ZSH_START=$(date +%s)
  
  # TODO: Add custom zsh binary installation logic here
  # This section would download and install a pre-built zsh binary
  log "⚠️  Custom zsh binary installation not yet implemented"
  
  ZSH_END=$(date +%s)
  ZSH_DURATION=$((ZSH_END - ZSH_START))
  log "Custom zsh installation took ${ZSH_DURATION}s"
else
  log "System zsh detected at $(which zsh), skipping custom zsh installation"
fi

# Add auto-exec hooks to .bashrc and .profile
log "Adding zsh auto-exec hooks..."
for rcfile in "$HOME/.bashrc" "$HOME/.profile"; do
  if [[ -f "$rcfile" ]] && ! grep -q "auto-exec zsh" "$rcfile" 2>/dev/null; then
    cat >> "$rcfile" << 'HOOK_EOF'

# auto-exec zsh (added by install.sh)
if [ -z "$ZSH_VERSION" ] && [ -t 1 ]; then
  for zsh_candidate in /usr/bin/zsh /bin/zsh; do
    if [ -x "$zsh_candidate" ]; then
      export SHELL="$zsh_candidate"
      exec "$zsh_candidate" -l
    fi
  done
fi
HOOK_EOF
    log "✅ Added auto-exec hook to $rcfile"
  fi
done

log "✅ Zsh installation and configuration complete"

