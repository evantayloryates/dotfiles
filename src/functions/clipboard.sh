# clip [command]
# Note: this won't work for pipelines. use either of these approaches for complex clip:
#  1. [command] c
#  2. [command] copy
clip () {
  local cmd="$*"
  {
    printf '$ %s\n' "$cmd"
    "$@"
  } | strip_ansi | /usr/bin/pbcopy

  # informational log (not copied to clipboard)
  printf 'Use \033[1;35m%s cl\033[0m or \033[1;35m%s copy\033[0m for a more robust copy\n' "$cmd" "$cmd" >&2
}

setopt extendedglob
__CLIP_LASTLINE=''
preexec() { __CLIP_LASTLINE="$2" }

__clip () {
  local cmd="$__CLIP_LASTLINE"
  cmd="${cmd%%[[:space:]]##\|[[:space:]]##__clip([[:space:]]##)#}" # drop "| __clip"
  cmd="${cmd%%[[:space:]]##\|[[:space:]]##copy([[:space:]]##)#}"   # drop "| copy"
  {
    printf '$ %s\n' "$cmd"
    cat
  } | strip_ansi | /usr/bin/pbcopy
}

# Cases that failed:
#  - docker compose up -d --remove-orphans cl 
#  - dc logs --tail=200 --follow --ansi=always sidekiq cl
#   - this command throws an error, so we may need to update the logic to capture stderr as well
# improvements:
#  - add final $ line to indicate where the new terminal prompt begins
alias -g cl='| __clip'
alias -g copy='| __clip'

# Keeping for reference. the new official "clip" function strips ANSI (CSI + OSC) before copying.
__oldclip () {
  {
    printf '$ %s\n' "$@"
    "$@"
  } | perl -pe 'chomp if eof' | /usr/bin/pbcopy
}
