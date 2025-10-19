#!/usr/bin/env bash

ZSHRC="$HOME/.zshrc"

# Backup existing zshrc
if [ -f "$ZSHRC" ]; then
  cp "$ZSHRC" "$ZSHRC.backup.$(date +%Y%m%d%H%M%S)"
fi

cat > "$ZSHRC" <<'EOF'
# --- ZSH Setup ---

# Enable colors and git prompt support
autoload -Uz colors && colors
autoload -Uz vcs_info

# Show git info in the prompt
precmd() {
  vcs_info
}

zstyle ':vcs_info:git:*' formats '%F{blue} %b%f%F{red}%a%f'
zstyle ':vcs_info:*' enable git

# Prompt format:
# user@host:cwd (git info) ➜
# example: taylor@macbook:~/projects/spaceback  main ➜
PROMPT='%F{green}%n@%m%f:%F{yellow}%~%f ${vcs_info_msg_0_} %F{cyan}➜%f '

# Right prompt with time
RPROMPT='%F{magenta}%*%f'

# --- Quality of Life ---
setopt prompt_subst
setopt autocd
setopt correct
setopt hist_ignore_dups

# Add git branch icons and color changes if dirty
git_dirty() {
  [[ -n "$(git status --porcelain 2>/dev/null)" ]] && echo "✗" || echo "✔"
}

# Override precmd to include dirty flag
precmd() {
  vcs_info
  if git rev-parse --is-inside-work-tree &>/dev/null; then
    if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
      vcs_info_msg_0_+=" %F{red}✗%f"
    else
      vcs_info_msg_0_+=" %F{green}✔%f"
    fi
  fi
}

# --- Aliases ---
alias ll='ls -lah'
alias gs='git status'
alias gl='git log --oneline --graph --decorate'
alias gc='git commit'
alias gp='git push'
alias gco='git checkout'

# --- PATH Example ---
export PATH="$HOME/bin:$PATH"

# --- Completion and Syntax Highlighting (optional) ---
if [ -d "$HOME/.zsh-plugins" ]; then
  source $HOME/.zsh-plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
  source $HOME/.zsh-plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
fi

EOF

echo "✅ New Zsh config written to $ZSHRC"
echo "🔁 Reload with: source ~/.zshrc"
