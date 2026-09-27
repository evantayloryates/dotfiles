# Nudge toward a short alias when its long command is typed in full.
#   __alias_nudge <short>
# Call it from inside the long function. It stays quiet when the long
# function was reached through any caller (the alias, or another function or
# script), so only a command typed at the prompt gets the heads-up. The long
# name comes from $funcstack, so the call site only names the alias.
# To add one: define `short () { long "$@" ;}` in aliases.sh and put
# `__alias_nudge short` in `long` wherever the message should print (after any
# `clear`, or it gets wiped).
__alias_nudge() {
  (( ${#funcstack} > 2 )) && return 0
  printf 'Use \e[32m%s\e[0m instead of \e[31m%s\e[0m\n\n' "$1" "${funcstack[2]}" >&2
}
