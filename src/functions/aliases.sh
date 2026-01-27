# "Aliases" here really mean tiny oneliner functions that would 
# normally be aliases, but I prefer to avoid using the alias keyword.
# This file must follow the pattern always. no divergences
# A "Note" is anything that will provide context for the pattern.
# : is offical syntax. 
abs     () { realpath "$@"                                                                                ;} # 
c       () { clip "$@"                                                                                    ;} # 
clip    () { { printf '$ %s\n' "$*"; "$@"; } | perl -pe 'chomp if eof' | /usr/bin/pbcopy                  ;} # 
convert () { magick "$@"                                                                                  ;} # 
dc      () { docker compose "$@"                                                                          ;} # 
env     () { /usr/bin/env | sort                                                                          ;} # 
ex      () { exiftool "$@"                                                                                ;} # Note: this will overwrite the /usr/bin/ex command
ls      () { /bin/ls -AGhlo "$@"                                                                          ;} # 
o       () { open "$(pwd -P 2>/dev/null || pwd)"                                                          ;} # 
path    () { python3 "$DOTFILES_DIR/src/python/path.py"                                                   ;} # 
pip3    () { pip "$@"                                                                                     ;} # 
py      () { python "$@"                                                                                  ;} # 
py3     () { python "$@"                                                                                  ;} # 
python  () { /Users/taylor/.venvs/dotfiles/bin/python -q "$@"                                             ;} # 
python3 () { python "$@"                                                                                  ;} # 
reload  () { echo "NO EFFECT\nPlease use "$'\033[35m'"\`src\`"$'\033[0m'" instead.\n"                     ;} #
_kitsrc () { /Applications/kitty.app/Contents/MacOS/kitty @ load-config "$HOME/.config/kitty/kitty.conf"  ;} #
src     () { _kitsrc; clear; exec "$SHELL" -l                                                             ;} # 
git     () { if [[ $# -eq 1 && "$1" == "branch" ]]; then gbs; else /usr/bin/git "$@"; fi                  ;} #


# Dotfiles sync
# source "$HOME/dotfiles/sync_dotfiles.sh"
# alias sync='sync_dotfiles'
# Git shortcuts
# alias gs='git status'
# alias ga='git add'
# alias gc='git commit'
# alias gp='git push'
# alias gl='git log --oneline'
# alias dc="docker compose"
# Utilities
# alias mkdir='/bin/mkdir -pv'
alias password="python3 $DOTFILES_DIR/src/python/password.py"
alias words="open $DOTFILES_DIR/src/__data/words.txt"


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