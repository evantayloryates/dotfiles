# pathfuncs shell helpers — sourced by generated pathfuncs output.
# Thin wrappers around Python selectors; action execution stays in-shell (cd, etc.).

_pathfuncs_py() {
  python3 "$DOTFILES_DIR/src/python/pathfuncs_actions.py" "$@"
}

# Run Python with UI on stderr; capture stdout payload.
# Copy mode: path + dim "(copied)" (Python also pbcopies).
# Run mode:  __PATHFUNCS_RUN__\n<action>\n<path>
_pathfuncs_run_select() {
  local kind="$1"
  local root="$2"
  local out ec
  out="$(_pathfuncs_py "$kind" "$root")"
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

_skills_select() {
  _pathfuncs_run_select skills "${1:?skills root required}"
}

_html_select() {
  _pathfuncs_run_select html "${1:?html root required}"
}

# Desktop arrangement — args arrive as one string from the generated case arm.
_desk_clean() {
  python3 "$DOTFILES_DIR/src/python/desktop.py" clean ${=1}
}
