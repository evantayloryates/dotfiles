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
}

setopt extendedglob
__CLIP_LASTLINE=''
preexec() { __CLIP_LASTLINE="$2" }

__clip () {
  local cmd="$__CLIP_LASTLINE"
  cmd="${cmd%%[[:space:]]##\|[[:space:]]##__clip([[:space:]]##)#}" # drop "| __clip"
  cmd="${cmd%%[[:space:]]##c([[:space:]]##)#}"                    # drop trailing " c"
  {
    printf '$ %s\n' "$cmd"
    cat
  } | strip_ansi | /usr/bin/pbcopy
}





alias -g c='| __clip'
alias -g copy='| __clip'

# Keeping for reference. the new official "clip" function strips ANSI (CSI + OSC) before copying.
__oldclip () {
  {
    printf '$ %s\n' "$@"
    "$@"
  } | perl -pe 'chomp if eof' | /usr/bin/pbcopy
}
