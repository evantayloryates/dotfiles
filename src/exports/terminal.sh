#!/bin/zsh

# TERM_UNICODE: 1 when this terminal can be trusted to draw non-ASCII glyphs
# such as … and ↳, else 0; readers fall back to ASCII on 0 (git_log_pretty.py:
# "..." and "->"). A shell can't ask the font, so this goes by what the session
# declares: a UTF-8 locale or a known Unicode terminal says yes, the Linux
# console and dumb/vt terminals say no. TERM_UNICODE_FORCE=0|1 overrides.
() {
  local charset="${(L)${LC_ALL:-${LC_CTYPE:-$LANG}}}"
  if [[ -n "$TERM_UNICODE_FORCE" ]]; then
    TERM_UNICODE="$TERM_UNICODE_FORCE"
  elif [[ "$TERM" == (dumb|linux|vt[0-9]*) ]]; then
    TERM_UNICODE=0
  elif [[ "$charset" == *utf(-|)8* ]]; then
    TERM_UNICODE=1
  elif [[ "$TERM_PROGRAM" == (ghostty|iTerm.app|Apple_Terminal|vscode|WezTerm|kitty) ||
          "$TERM" == (xterm-ghostty|xterm-kitty|wezterm|alacritty) ]]; then
    TERM_UNICODE=1
  else
    TERM_UNICODE=0
  fi
}
export TERM_UNICODE
