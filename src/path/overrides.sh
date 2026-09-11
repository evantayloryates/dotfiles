# POSIX shell syntax: shared by zsh, bash, sh and the GUI PATH bridge.
# Only macOS has the launchd-backed op broker. Keep devcontainers unaffected.
if [ "$(/usr/bin/uname -s)" = Darwin ]; then
    _dotfiles_bin="$HOME/dotfiles/bin"
    _dotfiles_remaining=${PATH-}
    _dotfiles_path=$_dotfiles_bin
    while :; do
        _dotfiles_entry=${_dotfiles_remaining%%:*}
        if [ "$_dotfiles_entry" != "$_dotfiles_bin" ]; then
            _dotfiles_path="$_dotfiles_path:$_dotfiles_entry"
        fi
        case $_dotfiles_remaining in
            *:*) _dotfiles_remaining=${_dotfiles_remaining#*:} ;;
            *) break ;;
        esac
    done
    PATH=$_dotfiles_path
    export PATH
    unset _dotfiles_bin _dotfiles_remaining _dotfiles_path _dotfiles_entry
fi
