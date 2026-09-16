# Keep OLDPWD useful: never let it equal the current directory.
#
# zsh (5.9) has no option for this — every successful `cd`, `pushd`, or `popd`
# records the directory you were in as OLDPWD, even when that is the directory
# you just moved to (e.g. `cd ~/Desktop` from ~/Desktop, or `kck` twice).
# After such a no-op, `cd -` goes nowhere.
#
# These wrappers undo that. Note that `cd -` and `~-` read zsh's INTERNAL
# previous-directory slot, not the $OLDPWD parameter, so assigning $OLDPWD is
# not enough: the only way to reset that slot is to actually cd back to the
# previous OLDPWD and then return, which lands with PWD unchanged and OLDPWD
# (both the parameter and the internal slot) equal to what it was before the
# no-op. `builtin cd` is untouched, so code that bypasses the wrapper gets
# stock behavior.

_oldpwd_keep() {
  local prev_oldpwd="$OLDPWD" builtin_name="$1"
  shift
  builtin "$builtin_name" "$@" || return $?
  if [[ "$PWD" == "$OLDPWD" && -n "$prev_oldpwd" && -d "$prev_oldpwd" ]]; then
    local here="$PWD"
    builtin cd -q -- "$prev_oldpwd" && builtin cd -q -- "$here"
  fi
  return 0
}

cd()    { _oldpwd_keep cd    "$@"; }
pushd() { _oldpwd_keep pushd "$@"; }
popd()  { _oldpwd_keep popd  "$@"; }
