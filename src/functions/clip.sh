
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
