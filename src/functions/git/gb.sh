#!/bin/zsh
# gbs — "git branches sorted": interactive, data-driven branch selector.
#
# Aliased as `gb` (default) and `gbv` (verbose) in src/functions/aliases.sh.
# Driven by real branch-usage history (shell-hook touches + background last-used
# indexing) from the data layer in branch_history.sh — not commit recency alone.
#
# Layout is bottom-up: the most salient options sit closest to the prompt. Top to
# bottom: hint, Rest (A->Z, trunk pinned at its bottom), Recent (down to 0 =
# current), optional missing-history warning, then `Select branch:`. Selector
# numbers are globally unique and render as one continuous countdown toward the
# prompt — highest at the top of Rest, 0 (current) at the very bottom of Recent.

# --- Named constants -------------------------------------------------------
GB_RECENT_WINDOW_SECONDS=$(( 14 * 24 * 60 * 60 ))   # 2 weeks: Recent eligibility (touch-confirmed only)
GB_RECENT_MAX_ITEMS=7                               # cap Recent (excludes current)
GB_REST_FILTER_SECONDS=$(( 90 * 24 * 60 * 60 ))     # 3 months: default Rest cutoff

gbs() {
    emulate -L zsh
    setopt local_options

    local verbose=0
    case "$1" in
        -v|--verbose|--all) verbose=1 ;;
    esac

    local root current
    root=$(/usr/bin/git rev-parse --show-toplevel 2>/dev/null) || {
        print -r -- "gbs: not inside a git repository"
        return 1
    }
    current=$(/usr/bin/git symbolic-ref --quiet --short HEAD 2>/dev/null)

    # Effective last-used per branch (touch entry, else last_used entry) plus its
    # source (touch|index), via the co-located python helper for robust JSONL
    # parsing. Self-seed the data dir. The source matters: only confirmed touch
    # data (the shell hook actually saw you on the branch) qualifies for Recent;
    # index data merely window-filters the Rest list.
    local dir
    dir=$(_gbh_repo_data_dir "$root")
    _gbh_ensure_init "$dir"

    typeset -A eff src
    local b e s
    while IFS=$'\t' read -r b e s; do
        [[ -n "$b" ]] && eff[$b]=$e && src[$b]=$s
    done < <(python3 "$DOTFILES_DIR/src/functions/git/git_branch_history.py" \
        resolve_usage "$dir/touches.jsonl" "$dir/last_used.jsonl" 2>/dev/null)

    local now recent_cutoff rest_cutoff
    now=$(date +%s)
    recent_cutoff=$(( now - GB_RECENT_WINDOW_SECONDS ))
    rest_cutoff=$(( now - GB_REST_FILTER_SECONDS ))

    local -a locals
    locals=( ${(f)"$(/usr/bin/git for-each-ref --format='%(refname:short)' refs/heads 2>/dev/null)"} )

    # Classify every branch. Trunk is pinned FIRST, before the current-branch
    # skip: trunk always sits at the bottom of Rest — even when it is also the
    # current branch (the one sanctioned duplication: it then appears both as
    # the pinned trunk line and as item 0 at the bottom of Recent).
    local -a recent rest missing trunk_pinned
    local ev is_trunk
    for b in $locals; do
        is_trunk=0
        [[ "$b" == "main" || "$b" == "master" ]] && is_trunk=1
        if (( is_trunk )); then
            trunk_pinned+=("$b")                       # always shown, exempt from filters
            continue
        fi
        [[ "$b" == "$current" ]] && continue          # current is item 0
        ev="${eff[$b]}"

        if [[ -z "$ev" ]]; then
            if (( verbose )); then rest+=("$b"); else missing+=("$b"); fi
            continue
        fi
        if [[ "${src[$b]}" == "touch" ]] && (( ev >= recent_cutoff )); then
            recent+=("$b")                             # Recent = confirmed touches only
        elif (( verbose )) || (( ev >= rest_cutoff )); then
            rest+=("$b")                               # index-only recency lands here
        fi
        # else: has history but older than 3 months and not verbose -> hidden
    done

    # Recent: newest first, capped; overflow spills into Rest.
    local -a recent_sorted recent_final
    if (( ${#recent} )); then
        recent_sorted=( ${(f)"$(for b in $recent; do printf '%s\t%s\n' "${eff[$b]}" "$b"; done | sort -rn -k1,1 | cut -f2-)"} )
    fi
    recent_final=( ${recent_sorted[1,GB_RECENT_MAX_ITEMS]} )
    if (( ${#recent_sorted} > GB_RECENT_MAX_ITEMS )); then
        rest+=( ${recent_sorted[$((GB_RECENT_MAX_ITEMS + 1)),-1]} )
    fi

    # Rest: A->Z, then trunk pinned at the bottom.
    local -a rest_sorted trunk_sorted rest_display
    if (( ${#rest} )); then
        rest_sorted=( ${(f)"$(printf '%s\n' $rest | sort)"} )
    fi
    if (( ${#trunk_pinned} )); then
        trunk_sorted=( ${(f)"$(printf '%s\n' $trunk_pinned | sort)"} )
    fi
    rest_display=( $rest_sorted $trunk_sorted )
    local rest_plain_count=${#rest_sorted}

    local k=${#recent_final} m=${#rest_display}
    local total_count=$(( 1 + k + m )) pad
    pad=${#total_count}

    # Build the selection map. Recent owns 0..k (0 = current). Rest continues
    # upward from k+1; rendered descending so the whole screen counts down.
    typeset -A branch_map
    [[ -n "$current" ]] && branch_map[0]="$current"
    local j i num
    for (( j = 1; j <= k; j++ )); do branch_map[$j]="${recent_final[$j]}"; done
    for (( i = 1; i <= m; i++ )); do
        num=$(( k + m - i + 1 ))
        branch_map[$num]="${rest_display[$i]}"
    done

    # Colors (only on a tty), consistent with the dotfiles terminal style.
    local grey='' white='' lred='' lblue='' yellow='' reset=''
    if [[ -t 1 ]]; then
        grey=$'\033[90m'; white=$'\033[97m'; lred=$'\033[91m'
        lblue=$'\033[94m'; yellow=$'\033[93m'; reset=$'\033[0m'
    fi

    # --- Render (bottom-up) ---
    print -r -- "${grey}use ${white}gbv${reset}${grey} for all branches${reset}"
    print ""

    if (( m > 0 )); then
        print "Rest:"
        for (( i = 1; i <= m; i++ )); do
            b="${rest_display[$i]}"
            num=$(( k + m - i + 1 ))
            if (( i > rest_plain_count )); then       # pinned trunk line
                printf "  %s%*d)%s %s %s(trunk)%s\n" "$lred" "$pad" "$num" "$reset" "$b" "$lred" "$reset"
            else
                printf "  %*d) %s\n" "$pad" "$num" "$b"
            fi
        done
        print ""
    fi

    print "Recent:"
    for (( num = k; num >= 1; num-- )); do
        printf "  %*d) %s\n" "$pad" "$num" "${recent_final[$num]}"
    done
    if [[ -n "$current" ]]; then
        printf "  %s%*d)%s %s %s(current)%s\n" "$lblue" "$pad" 0 "$reset" "$current" "$lblue" "$reset"
    fi
    print ""

    if (( ! verbose )) && (( ${#missing} > 0 )); then
        print -r -- "${grey}missing history for ${yellow}${#missing}${reset}${grey} branches${reset}"
        print ""
    fi

    printf "Select branch: "
    local selection
    read -r selection

    [[ -z "$selection" ]] && return 0
    if [[ "$selection" != <-> ]]; then
        print -r -- "Invalid selection: not a number"
        return 0
    fi
    [[ "$selection" == "0" ]] && return 0             # current branch: clean no-op
    if [[ -z "${branch_map[$selection]}" ]]; then
        print -r -- "Invalid selection: $selection not in list"
        return 0
    fi
    # Picking the pinned trunk line while already on trunk: same clean no-op as 0.
    [[ "${branch_map[$selection]}" == "$current" ]] && return 0

    print ""
    print ""
    /usr/bin/git checkout "${branch_map[$selection]}"
    print ""
}
