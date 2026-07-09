#!/bin/zsh
# gbs / gbv — data-driven interactive branch selector (bottom-up layout).
#
# Constants (named, from branch_history_paths.sh):
#   GBH_RECENT_WINDOW_SECONDS  = 2 weeks
#   GBH_RECENT_MAX_ITEMS       = 7
#   GBH_REST_FILTER_SECONDS    = 3 months
#
# Numbering: Recent owns 0..N (0 = current at bottom); Rest continues from N+1.
# Selecting 0 is a clean no-op.

_gbs_grey()       { printf '\033[90m%s\033[0m' "$1"; }
_gbs_white()      { printf '\033[97m%s\033[0m' "$1"; }
_gbs_yellow()     { printf '\033[93m%s\033[0m' "$1"; }
_gbs_light_blue() { printf '\033[94m%s\033[0m' "$1"; }
_gbs_light_red()  { printf '\033[91m%s\033[0m' "$1"; }

_gbs_is_trunk() {
  [[ "$1" == "main" || "$1" == "master" ]]
}

# Core selector. verbose=1 → gbv (unfiltered Rest, include missing-history branches).
_gbs_select() {
  local verbose="${1:-0}"
  local root repo_dir touches_file last_used_file
  local active_branch now recent_cut rest_cut
  local -a all_branches recent_branches rest_branches recent_sorted
  local -A eff_epoch shown_recent branch_map
  local branch epoch missing_count=0 trunk_branch=""
  local pad_width max_num selection
  local recent_n rest_start i r num

  root=$(_gbh_repo_root) || {
    printf '%s\n' 'gbs: not in a git repo'
    return 1
  }
  repo_dir=$(_gbh_ensure_repo_store "$root") || return 1
  touches_file=$(_gbh_touches_file "$repo_dir")
  last_used_file=$(_gbh_last_used_file "$repo_dir")

  # Warm history for this invocation.
  _gbh_record_touch "$root" "$repo_dir" || true
  _gbh_kick_indexer "$root" "$repo_dir"

  active_branch=$(_gbh_current_branch "$root")
  [[ -n "$active_branch" ]] || {
    printf '%s\n' 'gbs: detached HEAD'
    return 1
  }

  all_branches=($(/usr/bin/git -C "$root" --no-pager branch --format='%(refname:short)' 2>/dev/null))
  now=$(_gbh_epoch_now)
  recent_cut=$(( now - GBH_RECENT_WINDOW_SECONDS ))
  rest_cut=$(( now - GBH_REST_FILTER_SECONDS ))

  eff_epoch=()
  while IFS=$'\t' read -r branch epoch; do
    [[ -n "$branch" ]] && eff_epoch[$branch]=$epoch
  done < <(_gbh_effective_last_used_map "$touches_file" "$last_used_file")

  for branch in "${all_branches[@]}"; do
    [[ -z "${eff_epoch[$branch]:-}" ]] && (( missing_count++ ))
  done

  # Prefer master over main when both exist.
  if /usr/bin/git -C "$root" show-ref --verify --quiet refs/heads/master 2>/dev/null; then
    trunk_branch="master"
  elif /usr/bin/git -C "$root" show-ref --verify --quiet refs/heads/main 2>/dev/null; then
    trunk_branch="main"
  fi

  # Recent: non-trunk (unless current), within 2 weeks, newest-first, cap 7.
  recent_sorted=()
  for branch in "${all_branches[@]}"; do
    [[ "$branch" == "$active_branch" ]] && continue
    _gbs_is_trunk "$branch" && continue
    epoch="${eff_epoch[$branch]:-}"
    [[ -n "$epoch" ]] || continue
    (( epoch >= recent_cut )) || continue
    recent_sorted+=("$epoch:$branch")
  done
  recent_branches=()
  if (( ${#recent_sorted[@]} > 0 )); then
    while IFS= read -r branch; do
      [[ -z "$branch" ]] && continue
      recent_branches+=("${branch#*:}")
      (( ${#recent_branches[@]} >= GBH_RECENT_MAX_ITEMS )) && break
    done < <(printf '%s\n' "${recent_sorted[@]}" | /usr/bin/sort -t: -k1,1nr -k2,2)
  fi

  shown_recent=()
  for branch in "${recent_branches[@]}"; do
    shown_recent[$branch]=1
  done
  shown_recent[$active_branch]=1

  # Rest: exclude Recent; A→Z; default filter = 3 months; trunk pinned last.
  rest_branches=()
  for branch in "${all_branches[@]}"; do
    [[ -n "${shown_recent[$branch]:-}" ]] && continue
    [[ -n "$trunk_branch" && "$branch" == "$trunk_branch" ]] && continue
    epoch="${eff_epoch[$branch]:-}"
    if [[ -z "$epoch" ]]; then
      (( verbose )) || continue
    else
      (( verbose || epoch >= rest_cut )) || continue
    fi
    rest_branches+=("$branch")
  done
  if (( ${#rest_branches[@]} > 0 )); then
    rest_branches=($(printf '%s\n' "${rest_branches[@]}" | /usr/bin/sort))
  fi

  if [[ -n "$trunk_branch" && -z "${shown_recent[$trunk_branch]:-}" ]]; then
    epoch="${eff_epoch[$trunk_branch]:-}"
    if (( verbose )); then
      rest_branches+=("$trunk_branch")
    elif [[ -n "$epoch" && epoch -ge rest_cut ]]; then
      rest_branches+=("$trunk_branch")
    fi
  fi

  # Numbering: Recent 0..recent_n ; Rest continues from recent_n+1.
  # Rest displays descending (max at top → rest_start at bottom, nearest Recent).
  recent_n=${#recent_branches[@]}
  rest_start=$(( recent_n + 1 ))
  local rest_n=${#rest_branches[@]}
  if (( rest_n > 0 )); then
    max_num=$(( rest_start + rest_n - 1 ))
  else
    max_num=$recent_n
  fi
  pad_width=${#max_num}
  (( pad_width < 1 )) && pad_width=1

  branch_map=()
  branch_map[0]="$active_branch"
  for (( r = 1; r <= recent_n; r++ )); do
    branch_map[$r]="${recent_branches[$r]}"
  done
  # A→Z list maps to descending numbers: first alpha → max_num, trunk/last → rest_start.
  i=0
  for branch in "${rest_branches[@]}"; do
    num=$(( max_num - i ))
    branch_map[$num]="$branch"
    (( i++ ))
  done

  # --- Render: Rest → Recent → warning → prompt ---
  echo ""
  printf '%s' "$(_gbs_grey 'use ')"
  printf '%s' "$(_gbs_white 'gbv')"
  printf '%s\n' "$(_gbs_grey ' for all branches')"
  echo ""

  if (( rest_n > 0 )); then
    echo "Rest:"
    i=0
    for branch in "${rest_branches[@]}"; do
      num=$(( max_num - i ))
      if [[ "$branch" == "$trunk_branch" ]]; then
        printf '  %s) %s %s\n' \
          "$(_gbs_light_red "$(printf "%${pad_width}d" "$num")")" \
          "$(_gbs_light_red "$branch")" \
          "$(_gbs_light_red '(trunk)')"
      else
        printf "  %${pad_width}d) %s\n" "$num" "$branch"
      fi
      (( i++ ))
    done
    echo ""
  fi

  echo "Recent:"
  # Highest number (oldest in capped recent set) at top → 1 → 0 current.
  for (( r = recent_n; r >= 1; r-- )); do
    printf "  %${pad_width}d) %s\n" "$r" "${recent_branches[$r]}"
  done
  printf '  %s) %s %s\n' \
    "$(_gbs_light_blue "$(printf "%${pad_width}d" 0)")" \
    "$(_gbs_light_blue "$active_branch")" \
    "$(_gbs_light_blue '(current)')"
  echo ""

  if (( missing_count > 0 && ! verbose )); then
    printf '%s' "$(_gbs_grey 'missing history for ')"
    printf '%s' "$(_gbs_yellow "$missing_count")"
    printf '%s\n' "$(_gbs_grey ' branches')"
    echo ""
  fi

  printf "Select branch: "
  read -r selection

  [[ -z "$selection" ]] && return 0

  if ! [[ "$selection" =~ ^[0-9]+$ ]]; then
    echo "Invalid selection: not a number"
    return 0
  fi

  # Selecting 0 (current) is a clean no-op.
  [[ "$selection" == "0" ]] && return 0

  if [[ -z "${branch_map[$selection]:-}" ]]; then
    echo "Invalid selection: $selection not in list"
    return 0
  fi

  echo ""
  echo ""
  /usr/bin/git -C "$root" checkout "${branch_map[$selection]}"
  echo ""
}

gbs() { _gbs_select 0; }
gbv() { _gbs_select 1; }
