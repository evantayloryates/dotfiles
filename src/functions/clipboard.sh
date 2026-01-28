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
  printf 'Tip: use \033[35m[command] cl\033[0m for a more robust copy\n' >&2
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

_glob () {
  case "$1" in
    a|app)
      printf '*.{arm,axlsx,conf,css,default,erb,jbuilder,js,json,jsx,lock,md,rb,ru,scss,sh,template,txt}' | /usr/bin/pbcopy
      ;;
    c|client)
      printf '*.{js,json,md,scss,ts,tsx}' | /usr/bin/pbcopy
      ;;
    *)
      echo "Usage: _glob [app|a|client|c]" >&2
      ;;
  esac
}

alias -g cl='| __clip'
alias -g copy='| __clip'

# Keeping for reference. the new official "clip" function strips ANSI (CSI + OSC) before copying.
__oldclip () {
  {
    printf '$ %s\n' "$@"
    "$@"
  } | perl -pe 'chomp if eof' | /usr/bin/pbcopy
}
