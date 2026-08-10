# Terminal key bindings that need shell cooperation.

# cmd+k. Ghostty sends ^[^L for it (see ~/.config/ghostty/config); the plain
# Ctrl+L route does not work here because Ghostty's ED2 erases the visible
# screen in place rather than scrolling it into history the way kitty did, so
# whatever was on screen is lost instead of remaining scrollable. Emitting a
# screenful of newlines first pushes the viewport into scrollback, and the
# clear then only wipes rows that are already blank.
_clear_keep_scrollback() {
  printf '\n%.0s' {1..$LINES}
  zle .clear-screen
}

if [[ -o interactive ]]; then
  zle -N _clear_keep_scrollback
  bindkey '^[^L' _clear_keep_scrollback
fi
