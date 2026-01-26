# "Aliases" here really mean tiny oneliner functions that would 
# normally be aliases, but I prefer to avoid using the alias keyword.
# This file must follow the pattern always. no divergences
# A "Note" is anything that will provide context for the pattern.
# : is offical syntax. 
abs     () { realpath "$@"                                                                 ;} # 
c       () { clip "$@"                                                                     ;} # 
clip    () { { printf '$ %s\n' "$*"; "$@"; } | perl -pe 'chomp if eof' | /usr/bin/pbcopy   ;} # 
convert () { magick "$@"                                                                   ;} # 
dc      () { docker compose "$@"                                                           ;} # 
env     () { /usr/bin/env | sort                                                           ;} # 
ex      () { exiftool "$@"                                                                 ;} # Note: this will overwrite the /usr/bin/ex command
ls      () { /bin/ls -AGhlo "$@"                                                           ;} # 
o       () { open "$(pwd -P 2>/dev/null || pwd)"                                           ;} # 
path    () { python3 "$DOTFILES_DIR/src/python/path.py"                                    ;} # 
pip3    () { pip "$@"                                                                      ;} # 
py      () { python "$@"                                                                   ;} # 
py3     () { python "$@"                                                                   ;} # 
python  () { /Users/taylor/.venvs/dotfiles/bin/python -q "$@"                              ;} # 
python3 () { python "$@"                                                                   ;} # 
reload  () { echo "NO EFFECT\nPlease use "$'\033[35m'"\`src\`"$'\033[0m'" instead.\n"      ;} #
src     () { clear; exec "$SHELL" -l                                                       ;} # 
yab     () { source ~/.yabairc                                                             ;} # 
git     () { if [[ $# -eq 1 && "$1" == "branch" ]]; then gbs; else /usr/bin/git "$@"; fi   ;}


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
# Displays branches in categories: Active, Recent, Reserved, Rest
# Each branch appears only once (earlier sections take precedence)
GBS_RECENT_WINDOW_DAYS=7
GBS_RESERVED_BRANCHES=("main" "master" "develop" "dev" "staging" "production")

gbs() {
    local -a all_branches active_branches recent_branches reserved_branches rest_branches
    local -A branch_map
    local -a seen
    local active_branch idx=0 cutoff_date branch commit_date

    # Get active branch
    active_branch=$(/usr/bin/git --no-pager branch --show-current 2>/dev/null)
    
    # Calculate cutoff date for "recent" (commits within last N days)
    cutoff_date=$(date -v-${GBS_RECENT_WINDOW_DAYS}d +%s 2>/dev/null)
    
    # Get all local branches
    all_branches=($(/usr/bin/git --no-pager branch --format='%(refname:short)' 2>/dev/null))
    
    # Categorize branches
    for branch in "${all_branches[@]}"; do
        # Skip if already seen
        if [[ " ${seen[*]} " == *" $branch "* ]]; then
            continue
        fi
        
        # Check if active
        if [[ "$branch" == "$active_branch" ]]; then
            active_branches+=("$branch")
            seen+=("$branch")
            continue
        fi
        
        # Check if recent (commit within window)
        commit_date=$(/usr/bin/git --no-pager log -1 --format='%ct' "$branch" -- 2>/dev/null)
        if [[ -n "$commit_date" && "$commit_date" -ge "$cutoff_date" ]]; then
            recent_branches+=("$branch")
            seen+=("$branch")
            continue
        fi
        
        # Check if reserved
        if [[ " ${GBS_RESERVED_BRANCHES[*]} " == *" $branch "* ]]; then
            reserved_branches+=("$branch")
            seen+=("$branch")
            continue
        fi
        
        # Otherwise it's "rest"
        rest_branches+=("$branch")
        seen+=("$branch")
    done
    
    # Sort each category alphabetically
    active_branches=($(printf '%s\n' "${active_branches[@]}" | sort))
    recent_branches=($(printf '%s\n' "${recent_branches[@]}" | sort))
    reserved_branches=($(printf '%s\n' "${reserved_branches[@]}" | sort))
    rest_branches=($(printf '%s\n' "${rest_branches[@]}" | sort))
    
    # Calculate padding width based on total branch count
    local total_count max_idx max_idx_len pad_width
    total_count=$((${#active_branches[@]} + ${#recent_branches[@]} + ${#reserved_branches[@]} + ${#rest_branches[@]}))
    max_idx=$((total_count - 1))
    max_idx_len=${#max_idx}
    pad_width=$((max_idx_len < 3 ? max_idx_len : 3))
    
    # Print and build index map
    echo ""
    
    if [[ ${#active_branches[@]} -gt 0 ]]; then
        echo "Active:"
        for branch in "${active_branches[@]}"; do
            printf "  %${pad_width}d) %s\n" "$idx" "$branch"
            branch_map[$idx]="$branch"
            ((idx++))
        done
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
    
    # 0 = no-op (stay on current branch)
    [[ "$selection" -eq 0 ]] && return 0
    
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