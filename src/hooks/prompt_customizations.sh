# --- ZSH Prompt Setup ---

autoload -Uz colors && colors
autoload -Uz vcs_info

# Configure vcs_info
zstyle ':vcs_info:git:*' formats '%F{blue} %b%f%F{red}%a%f'
zstyle ':vcs_info:*' enable git

# Prompt: user@host:cwd (git info) ➜
PROMPT='%F{%(?.green.red)}%n@%m%f:%F{yellow}%~%f ${vcs_info_msg_0_} %F{cyan}➜%f '
RPROMPT='%F{magenta}%*%f'

setopt prompt_subst
setopt autocd
setopt correct
setopt hist_ignore_dups

# Unified precmd
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

# --- Plugins (optional) ---
if [ -d "$HOME/.zsh-plugins" ]; then
  source "$HOME/.zsh-plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
  source "$HOME/.zsh-plugins/zsh-autosuggestions/zsh-autosuggestions.zsh"
fi
