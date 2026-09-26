# Copy a command's output to the clipboard by appending a global alias:
#   <command> cl    copies "<pwd> $ <command>" followed by the output
#   <command> cll   copies the output only
# Works at the end of pipelines (`foo | grep bar cl`). ANSI (CSI + OSC) and the
# trailing newline are stripped.
#
# Known gaps:
#  - stderr isn't captured (e.g. `dc logs --tail=200 --follow sidekiq cl` on error)
#  - no closing `$` line to mark where the next prompt begins

setopt extendedglob

__CL_LASTLINE=''
__CL_PWD=''
_cl_preexec() {
  __CL_LASTLINE="$2"   # alias-expanded command line, so it ends in "| __cl <mode>"
  __CL_PWD="${PWD:A}"
}
autoload -Uz add-zsh-hook 2>/dev/null
add-zsh-hook preexec _cl_preexec 2>/dev/null

__cl () {
  local mode="${1:-full}"
  case "$mode" in
    full|compact) ;;
    *) printf '__cl: unknown mode %q\n' "$mode" >&2; return 1 ;;
  esac

  {
    if [[ "$mode" == full ]]; then
      local cmd="${__CL_LASTLINE%%[[:space:]]##\|[[:space:]]##__cl([[:space:]]##)(full|compact)([[:space:]]##)#}"
      printf '%s $ %s\n' "${__CL_PWD:-${PWD:A}}" "$cmd"
    fi
    cat
  } | perl -pe '
    s/(?:\e\[|\x9b)[0-9;?]*[a-zA-Z]//g;   # CSI
    s/\e\][^\e]*?(?:\a|\e\\)//g;         # OSC
    chomp if eof
  ' | /usr/bin/pbcopy
}

alias -g cl='| __cl full'
alias -g cll='| __cl compact'
