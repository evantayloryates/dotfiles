function my_branch {
  local branch="$1"
  local base="origin/master"
  local email="taylor@spaceback.me"

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
