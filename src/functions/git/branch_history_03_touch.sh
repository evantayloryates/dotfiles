#!/bin/zsh
# Git branch history — touch logic (blocking, in-shell, compact).
#
# Entry types: start / latest / final.
# Same-branch stretch: at most two sequential entries (start + latest/final).
# If newest entry matches current branch → update `latest` in place.
# On branch change → demote `latest` → `final`, then start/latest for new branch.

_gbh_current_branch() {
  /usr/bin/git -C "${1:-.}" --no-pager branch --show-current 2>/dev/null
}

_gbh_git_head() {
  /usr/bin/git -C "${1:-.}" rev-parse --short HEAD 2>/dev/null
}

# Pure-zsh JSON line for touch events (keeps the precmd hot path free of python).
_gbh_touch_line() {
  local type="$1" branch="$2" root="$3" head="$4"
  printf '{"schema_version":%s,"type":"%s","branch":"%s","ts":"%s","source":"hook","git_head":"%s","repo_root":"%s","shell_pid":"%s"}' \
    "$GBH_SCHEMA_VERSION" \
    "$(_gbh_json_escape "$type")" \
    "$(_gbh_json_escape "$branch")" \
    "$(_gbh_json_escape "$(_gbh_utc_now)")" \
    "$(_gbh_json_escape "$head")" \
    "$(_gbh_json_escape "$root")" \
    "$$"
}

# Record a touch for the current branch in repo_dir. Fast path when already latest.
_gbh_record_touch() {
  local root="$1"
  local repo_dir="$2"
  local branch head touches last_line last_type last_branch line

  branch=$(_gbh_current_branch "$root")
  [[ -n "$branch" ]] || return 0  # detached HEAD: skip quietly

  head=$(_gbh_git_head "$root")
  touches=$(_gbh_touches_file "$repo_dir")

  last_line=$(_gbh_read_last_line "$touches" 2>/dev/null) || last_line=""
  if [[ -n "$last_line" ]]; then
    last_type=$(_gbh_json_str_field "$last_line" type)
    last_branch=$(_gbh_json_str_field "$last_line" branch)
  else
    last_type=""
    last_branch=""
  fi

  if [[ "$last_branch" == "$branch" ]]; then
    case "$last_type" in
      start)
        line=$(_gbh_touch_line latest "$branch" "$root" "$head") || return 1
        _gbh_append_jsonl "$touches" "$line"
        ;;
      latest)
        line=$(_gbh_touch_line latest "$branch" "$root" "$head") || return 1
        _gbh_replace_last_line "$touches" "$line"
        ;;
      final)
        line=$(_gbh_touch_line start "$branch" "$root" "$head") || return 1
        _gbh_append_jsonl "$touches" "$line"
        ;;
      *)
        line=$(_gbh_touch_line start "$branch" "$root" "$head") || return 1
        _gbh_append_jsonl "$touches" "$line"
        ;;
    esac
    return 0
  fi

  # Branch changed: demote previous latest → final, then start new stretch.
  if [[ "$last_type" == "latest" && -n "$last_branch" ]]; then
    line=$(_gbh_touch_line final "$last_branch" "$root" \
      "$(_gbh_json_str_field "$last_line" git_head)") || return 1
    _gbh_replace_last_line "$touches" "$line"
  fi

  line=$(_gbh_touch_line start "$branch" "$root" "$head") || return 1
  _gbh_append_jsonl "$touches" "$line"
}
