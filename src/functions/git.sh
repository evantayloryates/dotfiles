# gbs - "git branches sorted" with interactive selector
# Displays branches in categories: Active (not selectable), Last, Recent, Reserved, Rest
# - Active branch is shown but not numbered (informational only)
# - Last branch (git checkout -) is item 0, and also appears in its relevant category
# - Reserved branches never appear in Recent, only in Reserved
GBS_RECENT_WINDOW_DAYS=7
GBS_RESERVED_BRANCHES=("main" "master" "production")

gbs() {
    local -a all_branches recent_branches reserved_branches rest_branches
    local -A branch_map
    local active_branch last_branch idx=1 cutoff_date branch commit_date

    # Get active branch
    active_branch=$(/usr/bin/git --no-pager branch --show-current 2>/dev/null)
    
    # Get last branch (the one we'd switch to with `git checkout -`)
    last_branch=$(/usr/bin/git --no-pager rev-parse --symbolic-full-name @{-1} 2>/dev/null | sed 's|^refs/heads/||')
    
    # Calculate cutoff date for "recent" (commits within last N days)
    cutoff_date=$(date -v-${GBS_RECENT_WINDOW_DAYS}d +%s 2>/dev/null)
    
    # Get all local branches
    all_branches=($(/usr/bin/git --no-pager branch --format='%(refname:short)' 2>/dev/null))
    
    # Categorize branches (excluding active branch from all categories)
    for branch in "${all_branches[@]}"; do
        # Skip active branch - it's shown separately and not selectable
        if [[ "$branch" == "$active_branch" ]]; then
            continue
        fi
        
        # Check if reserved - these go to reserved only, never to recent
        if [[ " ${GBS_RESERVED_BRANCHES[*]} " == *" $branch "* ]]; then
            reserved_branches+=("$branch")
            continue
        fi
        
        # Check if recent (commit within window)
        commit_date=$(/usr/bin/git --no-pager log -1 --format='%ct' "$branch" -- 2>/dev/null)
        if [[ -n "$commit_date" && "$commit_date" -ge "$cutoff_date" ]]; then
            recent_branches+=("$branch")
            continue
        fi
        
        # Otherwise it's "rest"
        rest_branches+=("$branch")
    done
    
    # Sort each category alphabetically
    recent_branches=($(printf '%s\n' "${recent_branches[@]}" | sort))
    reserved_branches=($(printf '%s\n' "${reserved_branches[@]}" | sort))
    rest_branches=($(printf '%s\n' "${rest_branches[@]}" | sort))
    
    # Check if we have a valid last branch (different from active)
    local has_last=0
    if [[ -n "$last_branch" && "$last_branch" != "$active_branch" ]]; then
        has_last=1
    fi
    
    # Calculate padding width based on max index
    local total_count max_idx max_idx_len pad_width
    total_count=$((${#recent_branches[@]} + ${#reserved_branches[@]} + ${#rest_branches[@]}))
    max_idx=$total_count
    max_idx_len=${#max_idx}
    pad_width=$((max_idx_len < 3 ? max_idx_len : 3))
    [[ $pad_width -lt 1 ]] && pad_width=1
    
    # Print and build index map
    echo ""
    
    # Show active branch (not selectable)
    if [[ -n "$active_branch" ]]; then
        echo "Active:"
        echo "  $active_branch"
        echo ""
    fi
    
    # Show last branch as item 0
    if [[ $has_last -eq 1 ]]; then
        echo "Last:"
        printf "  %${pad_width}d) %s\n" 0 "$last_branch"
        branch_map[0]="$last_branch"
        echo ""
    fi
    
    if [[ ${#recent_branches[@]} -gt 0 ]]; then
        echo "Recent:"
        for branch in "${recent_branches[@]}"; do
            printf "  %${pad_width}d) %s\n" "$idx" "$branch"
            branch_map[$idx]="$branch"
            ((idx++))
        done
        echo ""
    fi
    
    if [[ ${#reserved_branches[@]} -gt 0 ]]; then
        echo "Reserved:"
        for branch in "${reserved_branches[@]}"; do
            printf "  %${pad_width}d) %s\n" "$idx" "$branch"
            branch_map[$idx]="$branch"
            ((idx++))
        done
        echo ""
    fi
    
    if [[ ${#rest_branches[@]} -gt 0 ]]; then
        echo "Rest:"
        for branch in "${rest_branches[@]}"; do
            printf "  %${pad_width}d) %s\n" "$idx" "$branch"
            branch_map[$idx]="$branch"
            ((idx++))
        done
        echo ""
    fi
    
    # Prompt for selection
    printf "Select branch: "
    read -r selection
    
    # Empty input = no-op
    [[ -z "$selection" ]] && return 0
    
    # Validate input is a non-negative integer
    if ! [[ "$selection" =~ ^[0-9]+$ ]]; then
        echo "Invalid selection: not a number"
        return 0
    fi
    
    # Check if selection exists in map
    if [[ -z "${branch_map[$selection]}" ]]; then
        echo "Invalid selection: $selection not in list"
        return 0
    fi
    
    # Add spacing after confirmed selection
    echo ""
    echo ""

    # Switch to selected branch
    /usr/bin/git checkout "${branch_map[$selection]}"
    echo ""
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
