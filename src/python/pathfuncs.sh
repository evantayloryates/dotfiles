# pathfuncs shell helpers — sourced by generated pathfuncs output.
# Thin wrappers around Python selectors; action execution stays in-shell (cd, etc.).

__pathfuncs_py() {
  python3 "$DOTFILES_DIR/src/python/pathfuncs_actions.py" "$@"
}

# Passthrough transaction: `dot git status` runs `git status` as if typed inside
# the pathfunc target, then returns to where the caller was.
#   __pathfuncs_in <target dir> <command> [args...]
# Runs in the caller's shell (no subshell), so the command drives the outcome: if
# it changes directory itself (`dot cd ~/.ssh`, or a global remap like `cd .`) the
# new dir sticks; otherwise PWD, OLDPWD and the dir stack are restored. The move in
# is `cd -q` so chpwd hooks only ever see directory changes the command made.
# Locals are __pf_-prefixed because the command can see them (dynamic scoping).
__pathfuncs_chpwd() { __pf_moved=1 }

__pathfuncs_in() {
  local __pf_dir="${1:?target dir required}"; shift
  # Global remap only on an exact match of everything typed after the trigger.
  local __pf_key="$*"
  local __pf_cmd="${__PATHFUNCS_GLOBALS[$__pf_key]}"
  if [[ -z "$__pf_cmd" ]]; then
    # eval so aliases expand like at the prompt; everything else stays quoted.
    if (( $+aliases[$1] )); then __pf_cmd="$1"; else __pf_cmd="${(q)1}"; fi
    (( $# > 1 )) && __pf_cmd+=" ${(j: :)${(@q)@[2,-1]}}"
  fi

  local __pf_pwd="$PWD" __pf_oldpwd="$OLDPWD" __pf_moved=0 __pf_ec=0
  local -a __pf_stack=("${dirstack[@]}")
  builtin cd -q -- "$__pf_dir" || return

  chpwd_functions+=(__pathfuncs_chpwd)
  {
    eval "$__pf_cmd"
    __pf_ec=$?
  } always {
    chpwd_functions=(${chpwd_functions:#__pathfuncs_chpwd})
    if (( __pf_moved )); then
      # One hop straight out of the target: make `cd -` return to where the
      # caller was, not to the target they never visibly entered.
      if [[ "$OLDPWD" == "$__pf_dir" && "$PWD" != "$__pf_pwd" ]]; then
        local __pf_final="$PWD"
        builtin cd -q -- "$__pf_pwd" 2>/dev/null && builtin cd -q -- "$__pf_final"
        dirstack=("${__pf_stack[@]}")
        [[ -o autopushd ]] && dirstack=("$__pf_pwd" "${__pf_stack[@]}")
      fi
    else
      # OLDPWD is not assignable in a way `cd -` honors; hop through it instead.
      builtin cd -q -- "$__pf_oldpwd" 2>/dev/null
      builtin cd -q -- "$__pf_pwd"
      dirstack=("${__pf_stack[@]}")
    fi
  }
  return $__pf_ec
}

# Run Python with UI on stderr; capture stdout payload.
# Copy mode: path + dim "(copied)" (Python also pbcopies).
# Run mode:  __PATHFUNCS_RUN__\n<action>\n<path>
__pathfuncs_run_select() {
  local kind="$1"
  local root="$2"
  local out ec
  out="$(__pathfuncs_py "$kind" "$root")"
  ec=$?
  (( ec != 0 )) && return "$ec"

  if [[ "$out" == '__PATHFUNCS_RUN__'* ]]; then
    local -a lines
    lines=("${(@f)out}")
    local action="${lines[2]}"
    local path="${lines[3]}"
    [[ -z "$action" || -z "$path" ]] && return 1
    local -a cmd
    cmd=(${(z)action})
    "${cmd[@]}" "$path"
  else
    printf '%s\n' "$out"
  fi
}

__skills_select() {
  __pathfuncs_run_select skills "${1:?skills root required}"
}

__html_select() {
  __pathfuncs_run_select html "${1:?html root required}"
}

# Desktop arrangement — args arrive as one string from the generated case arm.
__desk_clean() {
  python3 "$DOTFILES_DIR/src/python/desktop.py" clean ${=1}
}
