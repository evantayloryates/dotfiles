#!/usr/bin/env bash

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg"
  echo "$msg" >> "$HOME/log.txt"
}

# Install ncurses-term and system zsh for terminal definitions (fixes backspace
# display issues). Debian/Ubuntu only — gate on apt-get first so the dpkg probe
# is never reached on macOS, where `dpkg` is absent and `! dpkg ...` would
# otherwise read as "package missing" from a command-not-found exit.
if command -v apt-get >/dev/null 2>&1; then
  if ! command -v zsh >/dev/null 2>&1 || ! dpkg -s ncurses-term >/dev/null 2>&1; then
    sudo apt-get update -qq >/dev/null 2>&1
    sudo apt-get install -y ncurses-term zsh >/dev/null 2>&1
  fi
fi

# Add auto-exec hooks to .bashrc and .profile
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
  fi
done

