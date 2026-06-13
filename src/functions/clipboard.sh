# clip [command]
# Note: this won't work for pipelines. use either of these approaches for complex clip:
#  1. [command] c
#  2. [command] copy
clip () {
  local cmd="$*"
  {
    printf '%s $ %s\n' "${PWD:A}" "$cmd"
    "$@"
  } | strip_ansi | /usr/bin/pbcopy

  # informational log (not copied to clipboard)
  printf 'Use \033[1;35m%s cl\033[0m or \033[1;35m%s copy\033[0m for a more robust copy\n' "$cmd" "$cmd" >&2
}

setopt extendedglob
__CLIP_LASTLINE=''
__CLIP_PWD=''
preexec() {
  __CLIP_LASTLINE="$2"
  __CLIP_PWD="${PWD:A}"
}

__split () {
  local mode="${1:-full}"
  local cmd="$__CLIP_LASTLINE"
  cmd="${cmd%%[[:space:]]##\|[[:space:]]##__clip([[:space:]]##)#}"                    # drop "| __clip"
  cmd="${cmd%%[[:space:]]##\|[[:space:]]##__split([[:space:]]##)(full|compact)([[:space:]]##)#}" # drop "| __split …"
  # cmd="${cmd%%[[:space:]]##\|[[:space:]]##copy([[:space:]]##)#}"   # drop "| copy"

  case "$mode" in
    full)
      {
        printf '%s $ %s\n' "${__CLIP_PWD:-${PWD:A}}" "$cmd"
        cat
      } | strip_ansi | /usr/bin/pbcopy
      ;;
    compact)
      cat | strip_ansi | /usr/bin/pbcopy
      ;;
    *)
      printf '__split: unknown mode %q\n' "$mode" >&2
      return 1
      ;;
  esac
}

__clip () { __split full; }

# Cases that failed:
#  - docker compose up -d --remove-orphans cl 
#  - dc logs --tail=200 --follow --ansi=always sidekiq cl
#   - this command throws an error, so we may need to update the logic to capture stderr as well
# improvements:
#  - add final $ line to indicate where the new terminal prompt begins
alias -g cl='| __split full'
alias -g cll='| __split compact'
# alias -g copy='| __split full'

# Keeping for reference. the new official "clip" function strips ANSI (CSI + OSC) before copying.
__oldclip () {
  {
    printf '$ %s\n' "$@"
    "$@"
  } | perl -pe 'chomp if eof' | /usr/bin/pbcopy
}
