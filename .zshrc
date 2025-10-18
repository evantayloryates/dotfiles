echo "Hello from zshrc!"
export SHELL=$(which zsh)
alias l="cat $HOME/log.txt"

# Setup dotfiles sync
export LIVE_DOTFILES_REPO_DIR="$HOME/.live-dotfiles"
export LATEST_DOTFILES_COMMIT=""

# Source and run sync_dotfiles function
source "$HOME/dotfiles/sync_dotfiles.sh"
sync_dotfiles