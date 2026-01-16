

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
