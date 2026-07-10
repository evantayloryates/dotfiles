# NOTE: the interactive branch selector (`gbs`, aliased `gb`/`gbv`) now lives in
# src/functions/git/gb.sh, driven by the branch-history data layer in
# src/functions/git/branch_history.sh.
GIT_LOG_MAX_MSG_LEN=50
GIT_LOG_EXTRA_PADDING=2

gbc() {
    /usr/bin/git branch --show-current
}

function my_branch {
  local branch="$1"
  local base="origin/master"
  local email="taylor@spaceback.me"

  # 0) ensure we are in a git repo
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 1
  fi

  # 1) ensure remote branch exists
  if ! git ls-remote --heads origin "$branch" >/dev/null; then
    return 1
  fi

  # 2) check authors of commits unique to the branch
  if git log --no-merges --format='%ae' "$base..origin/$branch" \
    | grep -v -x "$email" >/dev/null; then
    return 1
  fi

  return 0
}

function rm_branch {
  local target="$1"
  local protected rehome_branch today_prefix mon day year lc_target rehome_full current

  if [[ -z "$target" ]]; then
    printf '%s\n' 'rm_branch: missing branch name'
    return 1
  fi

  # very first: protect critical branches
  case "$target" in
    master|main|production)
      printf '%s\n' "rm_branch: refusing to operate on protected branch: $target"
      return 1
      ;;
  esac

  # ensure we are in a git repo
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf '%s\n' 'rm_branch: not in a git repo'
    return 1
  fi

  # delete remote branch only if it's "mine"
  if my_branch "$target"; then
    if git push origin --delete "$target" >/dev/null 2>&1; then
      printf '%s\n' "rm_branch: deleted remote branch: $target"
    else
      printf '%s\n' "rm_branch: failed to delete remote branch: $target"
      return 1
    fi
  else
    printf '%s\n' "rm_branch: remote branch not deleted (missing or not exclusively authored by $email): $target"
  fi

  # local branch cleanup
  # step 1: check local branch exists
  if ! git show-ref --verify --quiet "refs/heads/$target"; then
    printf '%s\n' "rm_branch: local branch does not exist: $target"
    return 0
  fi

  # step 2: if currently on target branch, checkout master (or main fallback)
  current="$(git symbolic-ref --quiet --short HEAD 2>/dev/null)"
  if [[ "$current" == "$target" ]]; then
    if git show-ref --verify --quiet 'refs/heads/master'; then
      git checkout master >/dev/null 2>&1 || return 1
    elif git show-ref --verify --quiet 'refs/heads/main'; then
      git checkout main >/dev/null 2>&1 || return 1
    else
      printf '%s\n' 'rm_branch: neither master nor main exists locally; cannot move off target branch'
      return 1
    fi
  fi

  # step 3: create rehome copy, rename to __to-delete__mon-dd-yyyy__<lowercased original>
  mon="$(LC_ALL=C date '+%b' | tr '[:upper:]' '[:lower:]')"
  day="$(LC_ALL=C date '+%d' | tr -d '\n')"
  year="$(LC_ALL=C date '+%Y' | tr -d '\n')"
  lc_target="$(printf '%s' "$target" | tr '[:upper:]' '[:lower:]')"
  rehome_branch="__to-delete__${mon}-${day}-${year}__${lc_target}"

  if git show-ref --verify --quiet "refs/heads/$rehome_branch"; then
    printf '%s\n' "rm_branch: rehome branch already exists locally: $rehome_branch"
    return 1
  fi

  # checkout a copy (new branch at same commit)
  if ! git branch "$rehome_branch" "$target" >/dev/null 2>&1; then
    printf '%s\n' "rm_branch: failed to create rehome branch: $rehome_branch"
    return 1
  fi

  # hard delete original target branch
  if git branch -D "$target" >/dev/null 2>&1; then
    printf '%s\n' "rm_branch: deleted local branch: $target (rehomed as $rehome_branch)"
  else
    printf '%s\n' "rm_branch: failed to delete local branch: $target"
    return 1
  fi

  return 0
}

# Resolve local/remote trunk: prefer master, then main.
_git_log_resolve_trunk() {
  local ref
  for ref in master main origin/master origin/main; do
    if /usr/bin/git rev-parse --verify --quiet "$ref^{commit}" >/dev/null; then
      print -r -- "$ref"
      return 0
    fi
  done
  return 1
}

# Print one pretty log line: colored hash, padded subject, optional decorations.
_git_log_print_line() {
  local full_hash="$1" short_hash="$2" subject="$3" color="$4"
  local head_hash="$5" head_branch="$6" max_msg_len="$7" extra_pad="$8" reset_color="$9"
  local display_subject="$subject" decoration="" other_local_refs="" ref=""

  if (( ${#display_subject} > max_msg_len )); then
    display_subject="${display_subject:0:$((max_msg_len - 3))}..."
  fi
  printf -v display_subject "%-${max_msg_len}s" "$display_subject"

  while IFS= read -r ref; do
    [[ -z "$ref" ]] && continue
    if [[ "$full_hash" == "$head_hash" && -n "$head_branch" && "$ref" == "$head_branch" ]]; then
      continue
    fi
    if [[ -z "$other_local_refs" ]]; then
      other_local_refs="$ref"
    else
      other_local_refs="$other_local_refs, $ref"
    fi
  done < <(/usr/bin/git for-each-ref --format='%(refname:short)' --points-at "$full_hash" refs/heads 2>/dev/null)

  if [[ "$full_hash" == "$head_hash" && -n "$head_branch" ]]; then
    decoration="HEAD -> $head_branch"
    [[ -n "$other_local_refs" ]] && decoration="$decoration, $other_local_refs"
  else
    decoration="$other_local_refs"
  fi

  if [[ -n "$decoration" ]]; then
    printf '%s%s%s %s%s(%s)\n' "$color" "$short_hash" "$reset_color" "$display_subject" "$extra_pad" "$decoration"
  else
    printf '%s%s%s %s\n' "$color" "$short_hash" "$reset_color" "$display_subject"
  fi
}

# Pretty local log for `gl`: walk HEAD → nearest stacked branch tips → trunk,
# coloring each segment, then show the trunk merge-base plus one older trunk
# commit for context. Works in any repo whose trunk is master or main.
function git_log_local_pretty {
  local max_msg_len="${GIT_LOG_MAX_MSG_LEN:-50}"
  local extra_padding="${GIT_LOG_EXTRA_PADDING:-2}"
  local head_hash head_branch trunk merge_base extra_pad
  local reset_color trunk_color
  local -a seg_colors
  local -a boundary_hashes
  local -A on_path seen_boundary

  head_hash=$(/usr/bin/git rev-parse HEAD 2>/dev/null) || return 1
  head_branch=$(/usr/bin/git symbolic-ref --quiet --short HEAD 2>/dev/null || true)
  trunk=$(_git_log_resolve_trunk) || {
    printf '%s\n' 'git_log_local_pretty: no master/main trunk found'
    return 1
  }
  merge_base=$(/usr/bin/git merge-base "$trunk" HEAD 2>/dev/null) || {
    printf '%s\n' "git_log_local_pretty: cannot find merge-base with $trunk"
    return 1
  }

  reset_color=""
  trunk_color=""
  seg_colors=()
  if [[ -t 1 ]]; then
    reset_color=$'\033[0m'
    trunk_color=$'\033[90m'
    seg_colors=(
      $'\033[36m'  # cyan — current feature
      $'\033[33m'  # yellow — parent feature
      $'\033[32m'  # green
      $'\033[35m'  # magenta
      $'\033[34m'  # blue
      $'\033[31m'  # red
    )
  fi

  printf -v extra_pad '%*s' "$extra_padding" ''

  # Commits on the first-parent path from HEAD down to (excluding) merge-base.
  local c
  while IFS= read -r c; do
    [[ -n "$c" ]] && on_path[$c]=1
  done < <(/usr/bin/git rev-list --first-parent "${merge_base}..HEAD" 2>/dev/null)

  # Local branch tips that sit on that path (stacked parents), excluding HEAD tip.
  local hash name
  while IFS=' ' read -r hash name; do
    [[ -z "$hash" || -z "$name" ]] && continue
    [[ "$hash" == "$head_hash" ]] && continue
    [[ -z "${on_path[$hash]}" ]] && continue
    [[ -n "${seen_boundary[$hash]}" ]] && continue
    seen_boundary[$hash]=1
    boundary_hashes+=("$hash")
  done < <(/usr/bin/git for-each-ref --format='%(objectname) %(refname:short)' refs/heads 2>/dev/null)

  # Nearest stacked tip first (fewest commits from HEAD).
  if (( ${#boundary_hashes} )); then
    local -a sorted_boundaries=()
    local dist
    while IFS=' ' read -r dist hash; do
      [[ -n "$hash" ]] && sorted_boundaries+=("$hash")
    done < <(
      for hash in "${boundary_hashes[@]}"; do
        dist=$(/usr/bin/git rev-list --first-parent --count "${hash}..HEAD" 2>/dev/null) || continue
        printf '%s %s\n' "$dist" "$hash"
      done | sort -n
    )
    boundary_hashes=("${sorted_boundaries[@]}")
  fi

  # Emit feature/stack segments: HEAD → tip1 → tip2 → … → merge-base.
  local -a range_ends=("${boundary_hashes[@]}" "$merge_base")
  local range_start="$head_hash"
  local seg_i=0 color end_hash

  for end_hash in "${range_ends[@]}"; do
    color=""
    if (( ${#seg_colors} )); then
      color="${seg_colors[$((seg_i % ${#seg_colors[@]} + 1))]}"
    fi
    # Commits reachable from range_start but not end_hash (newest first).
    while IFS=$'\x1f' read -r full_hash short_hash subject; do
      [[ -z "$full_hash" ]] && continue
      _git_log_print_line "$full_hash" "$short_hash" "$subject" "$color" \
        "$head_hash" "$head_branch" "$max_msg_len" "$extra_pad" "$reset_color"
    done < <(/usr/bin/git --no-pager log --first-parent --format='%H%x1f%h%x1f%s' "${end_hash}..${range_start}")
    range_start="$end_hash"
    (( seg_i++ ))
  done

  # Trunk context: merge-base, then one older trunk commit.
  local trunk_ctx=0
  while IFS=$'\x1f' read -r full_hash short_hash subject; do
    [[ -z "$full_hash" ]] && continue
    _git_log_print_line "$full_hash" "$short_hash" "$subject" "$trunk_color" \
      "$head_hash" "$head_branch" "$max_msg_len" "$extra_pad" "$reset_color"
    (( trunk_ctx++ ))
    (( trunk_ctx >= 2 )) && break
  done < <(/usr/bin/git --no-pager log --first-parent --format='%H%x1f%h%x1f%s' -n 2 "$merge_base")
}
