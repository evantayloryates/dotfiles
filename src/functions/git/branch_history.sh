#!/bin/zsh
# Git branch history data layer.
#
# Records real branch-usage history per repo under the machine-local data store:
#
#   $DOTFILES_DATA_DIR/git_branch_history/<encoded_repo_abs_path>/touches.jsonl
#   $DOTFILES_DATA_DIR/git_branch_history/<encoded_repo_abs_path>/last_used.jsonl
#
# A central precmd hook runs on every command: near-free outside git repos;
# lazily/idempotently seeds the repo's data files; runs the (blocking, in-shell,
# very fast) touch logic; then kicks the last-used indexer into the background.
#
# The hot per-prompt path is pure shell + a single awk pass (no python). The
# background indexer and the interactive selector delegate JSON parsing to the
# co-located git_branch_history.py helper (not sourced — the loader globs *.sh).
#
# Everything here is idempotent and safe when the data dir / files do not exist.

# --- Named constants -------------------------------------------------------
# ~2 months: per-branch last_used refresh threshold (indexer re-index staleness).
GBH_REINDEX_STALENESS_SECONDS=$(( 60 * 24 * 60 * 60 ))
# ~3 hours: skip redundant background index runs. Derived from the newest
# successful index_run entry already on disk — no separate last-run file.
GBH_INDEXER_COOLDOWN_SECONDS=$(( 3 * 60 * 60 ))
# Cap the human-readable slug portion of the encoded repo dir name. The SHA-256
# suffix guarantees uniqueness even when the slug is truncated; the cap keeps us
# comfortably under the APFS 255-byte filename limit for deep paths.
GBH_SLUG_MAX_LEN=180

# --- Path / location helpers ----------------------------------------------

# Base directory for this data class.
_gbh_base_dir() {
    printf '%s/git_branch_history\n' "${DOTFILES_DATA_DIR:-$DOTFILES_DIR/data}"
}

# Encode a canonical absolute repo root into one safe, collision-resistant,
# snake_case directory name: readable slug + "__" + 12 hex of SHA-256(path).
#   /Users/taylor/src/github/r1 -> users_taylor_src_github_r1__<12-char-sha>
# The slug is for humans; the hash guarantees no collisions between similar
# paths and respects filename-length limits. (See Desktop research transcripts:
# mature tools canonicalize + hash + prefix a slug rather than trying to make
# the name reversible — base64url is unsafe on case-insensitive APFS.)
_gbh_encode_repo_path() {
    local abs="$1" slug hash
    hash=$(printf '%s' "$abs" | /usr/bin/shasum -a 256 | cut -c1-12)
    slug=$(printf '%s' "$abs" | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[^a-z0-9]+/_/g; s/^_+//; s/_+$//')
    slug=${slug[1,$GBH_SLUG_MAX_LEN]}
    printf '%s__%s\n' "$slug" "$hash"
}

# Absolute path to a repo's data directory (does not create it).
_gbh_repo_data_dir() {
    printf '%s/%s\n' "$(_gbh_base_dir)" "$(_gbh_encode_repo_path "$1")"
}

# Lazy, idempotent init of a repo's data dir + JSONL files. Safe to call every
# fire. This is the accessor layer: every consumer self-seeds through it.
_gbh_ensure_init() {
    local dir="$1"
    [[ -d "$dir" ]] || mkdir -p "$dir" 2>/dev/null || return 1
    [[ -f "$dir/touches.jsonl" ]]   || : > "$dir/touches.jsonl"   2>/dev/null
    [[ -f "$dir/last_used.jsonl" ]] || : > "$dir/last_used.jsonl" 2>/dev/null
    return 0
}

# --- Touch logic (touches.jsonl) ------------------------------------------
# Single awk pass rewrites the (tiny) file atomically. Sequential entries per
# branch stretch are capped at two: `start` (first touch) and `latest` (live
# head, updated in place). On branch change the open `latest` is demoted to
# `final`. Never one line per fire.
_gbh_touch() {
    emulate -L zsh
    local root="$1" branch="$2" head="$3" dir="$4" now_ep="$5" now_iso="$6"
    local file="$dir/touches.jsonl" tmp="$dir/touches.jsonl.tmp.$$"

    /usr/bin/awk \
        -v cur="$branch" -v head="$head" -v ts="$now_iso" -v ep="$now_ep" \
        -v pid="$$" -v root="$root" -v sv=1 '
    function jesc(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); return s }
    function mkentry(type,   e) {
        e = "{\"schema_version\":" sv
        e = e ",\"type\":\"" type "\""
        e = e ",\"branch\":\"" cur_esc "\""
        e = e ",\"ts\":\"" ts "\""
        e = e ",\"ts_epoch\":" ep
        e = e ",\"source\":\"hook\""
        e = e ",\"git_head\":\"" head "\""
        e = e ",\"repo_root\":\"" root_esc "\""
        e = e ",\"shell_pid\":" pid
        e = e "}"
        return e
    }
    BEGIN { cur_esc = jesc(cur); root_esc = jesc(root); n = 0 }
    { line[++n] = $0 }
    END {
        if (n == 0) { print mkentry("start"); exit }
        last = line[n]
        lt = ""
        s = index(last, "\"type\":\"")
        if (s > 0) { a = substr(last, s + 8);  t = index(a, "\",\"branch\":"); if (t > 0) lt = substr(a, 1, t - 1) }
        lb = ""
        s = index(last, "\"branch\":\"")
        if (s > 0) { a = substr(last, s + 10); t = index(a, "\",\"ts\":");     if (t > 0) lb = substr(a, 1, t - 1) }
        if (lb == cur_esc) {
            if (lt == "latest") {                         # update live head in place
                for (i = 1; i < n; i++) print line[i]
                print mkentry("latest")
            } else if (lt == "start") {                   # add the single latest for this stretch
                for (i = 1; i <= n; i++) print line[i]
                print mkentry("latest")
            } else {                                      # final/unknown on same branch: fresh stretch
                for (i = 1; i <= n; i++) print line[i]
                print mkentry("start")
            }
        } else {                                          # branch changed
            if (lt == "latest") {                         # demote open latest -> final
                for (i = 1; i < n; i++) print line[i]
                demoted = last
                sub(/"type":"latest"/, "\"type\":\"final\"", demoted)
                print demoted
            } else {
                for (i = 1; i <= n; i++) print line[i]
            }
            print mkentry("start")
        }
    }
    ' "$file" > "$tmp" 2>/dev/null && mv -f "$tmp" "$file" 2>/dev/null || rm -f "$tmp" 2>/dev/null
}

# --- Last-used indexer (last_used.jsonl) ----------------------------------

# Cheap cooldown gate (shell only, no python): is a background index run due?
# Reads the newest index_run's finished_epoch straight from the file.
_gbh_indexer_due() {
    local file="$1" now="$2" last ep
    last=$(grep '"type":"index_run"' "$file" 2>/dev/null | tail -1)
    [[ -z "$last" ]] && return 0                          # never run -> due
    ep=${last##*\"finished_epoch\":}
    ep=${ep%%,*}
    ep=${ep//[^0-9]/}
    [[ -z "$ep" ]] && return 0
    (( now - ep >= GBH_INDEXER_COOLDOWN_SECONDS )) && return 0
    return 1
}

# Background indexer: backfills last_used for branches the hook has never (or not
# recently) touched. Additive-only, usage-driven, logs to a real .log file.
_gbh_index_last_used() {
    emulate -L zsh
    local root="$1" dir="$2" now_ep="$3" now_iso="$4"
    local base="${DOTFILES_DATA_DIR:-$DOTFILES_DIR/data}"
    local logf="$base/logs/git_branch_history.log"
    local py="$DOTFILES_DIR/src/functions/git/git_branch_history.py"
    local lock="$dir/index_lock"

    # Clear a stale lock (crashed prior run) before trying to acquire.
    if [[ -d "$lock" ]] && [[ -n "$(find "$lock" -maxdepth 0 -mmin +60 2>/dev/null)" ]]; then
        rmdir "$lock" 2>/dev/null
    fi
    mkdir "$lock" 2>/dev/null || return 0                 # another indexer active
    mkdir -p "$base/logs" 2>/dev/null

    {
        local tmperr summary rc
        tmperr=$(mktemp 2>/dev/null)
        summary=$(/usr/bin/git -C "$root" for-each-ref \
            --format='%(refname:short)%09%(committerdate:unix)' refs/heads 2>/dev/null \
            | python3 "$py" index "$dir/last_used.jsonl" \
                "$GBH_REINDEX_STALENESS_SECONDS" "$GBH_INDEXER_COOLDOWN_SECONDS" \
                "$now_ep" "$now_iso" 2>"${tmperr:-/dev/null}")
        rc=$?
        if [[ $rc -eq 0 ]]; then
            print -r -- "$now_iso ok repo=$root $summary" >> "$logf"
        else
            {
                print -r -- "$now_iso ERROR repo=$root $summary"
                [[ -n "$tmperr" && -s "$tmperr" ]] && cat "$tmperr"
            } >> "$logf"
        fi
        [[ -n "$tmperr" ]] && rm -f "$tmperr"
    } always {
        rmdir "$lock" 2>/dev/null
    }
}

# --- Central hook ----------------------------------------------------------
# Runs on every prompt. Must be near-free outside git repos.
_gbh_precmd_hook() {
    emulate -L zsh
    local out root head branch now_ep now_iso dir

    # Single git call: toplevel (line 1) + HEAD sha (line 2). Fails fast (and
    # near-free) outside a repo or in a repo with no commits yet.
    out=$(/usr/bin/git rev-parse --show-toplevel HEAD 2>/dev/null) || return 0
    root=${out%%$'\n'*}
    head=${out##*$'\n'}
    [[ -z "$root" ]] && return 0

    dir=$(_gbh_repo_data_dir "$root")
    _gbh_ensure_init "$dir" || return 0

    now_ep=$(date +%s)
    now_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    # Touch logic: blocking, in-shell, fast. Skipped when detached (no branch),
    # but indexing still runs so its data is captured on the next checkout.
    branch=$(/usr/bin/git symbolic-ref --quiet --short HEAD 2>/dev/null)
    [[ -n "$branch" ]] && _gbh_touch "$root" "$branch" "$head" "$dir" "$now_ep" "$now_iso"

    # Background indexer, gated by the cheap cooldown check so the common path
    # never even spawns the background job.
    if _gbh_indexer_due "$dir/last_used.jsonl" "$now_ep"; then
        _gbh_index_last_used "$root" "$dir" "$now_ep" "$now_iso" &!
    fi
}

# Register idempotently (add-zsh-hook de-dupes, so re-`src` is safe).
autoload -Uz add-zsh-hook 2>/dev/null
add-zsh-hook precmd _gbh_precmd_hook 2>/dev/null
