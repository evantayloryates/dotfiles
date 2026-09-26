# Copy a command's output to the clipboard by appending a global alias:
#   <command> cl    copies "<pwd> $ <command>" followed by the output
#   <command> cll   copies the output only
# Works at the end of pipelines (`foo | grep bar cl`). ANSI (CSI + OSC) is stripped.

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
  cmd="${cmd%%[[:space:]]##\|[[:space:]]##__split([[:space:]]##)(full|compact)([[:space:]]##)#}" # drop "| __split …"

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

# Cases that failed:
#  - docker compose up -d --remove-orphans cl
#  - dc logs --tail=200 --follow --ansi=always sidekiq cl
#   - this command throws an error, so we may need to update the logic to capture stderr as well
# improvements:
#  - add final $ line to indicate where the new terminal prompt begins
alias -g cl='| __split full'
alias -g cll='| __split compact'
