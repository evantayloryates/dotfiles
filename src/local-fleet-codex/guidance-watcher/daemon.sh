#!/bin/bash
# kanban-watcher daemon (launchd com.taylor.kanban-watcher). Every 10 s: if the board log has events past
# max(acked cursor, last_prompted), prompt the kanban-watcher session once with the range. If the session has
# not acked a prompted range within 120 s, prompt once more with the same range. Also fires a one-shot
# wake from $D/wake_at ("<epoch> <reason>") for digest / reminder deadlines. Never logs env or event bodies.
D="$HOME/.local/state/guidance-fleet/kanban-watcher"
ROLES="$HOME/.local/state/guidance-fleet/roles.tsv"
role() { awk -F'\t' -v r="$1" '$1==r{print $2}' "$ROLES" 2>/dev/null | tail -1; }  # roles.tsv: taylor-local-fleet
SESSION=$(role watcher); [ -z "$SESSION" ] && SESSION=$(role manager)
SESSION=${SESSION:-local_9bb95133-d4a3-46d6-a976-fb29e7dbe8b2}
DRIVER="$HOME/dotfiles/src/claude-driver/bin/claude-driver"
CODEX_DELIVERY="$D/codex-delivery.mjs"
API=http://127.0.0.1:4870
ST="$D/daemon.state"; LOG="$D/daemon.log"
MANAGER=$(role manager); MANAGER=${MANAGER:-local_59417d19-3485-45f4-8ca2-6e06bd6ae313}; STALLS="$D/stall.sent"; stall_at=0
umask 077; touch "$LOG"; chmod 600 "$LOG"
log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >> "$LOG"; }
last_prompted=0; prompted_at=0; reprompted=1; lasterr=""; codex_at=0
[ -f "$ST" ] && . "$ST"
save() { printf 'last_prompted=%d\nprompted_from=%d\nprompted_at=%d\nreprompted=%d\nsweep_sig=%s\nsweep_at=%d\nterminal_through=%d\nterminal_turn=%s\n' "$last_prompted" "${prompted_from:-0}" "$prompted_at" "$reprompted" "${sweep_sig:-}" "${sweep_at:-0}" "${terminal_through:-0}" "${terminal_turn:-}" > "$ST"; }
delivery_failed() {
  # One quiet notice after a sustained outage, shared by Codex and Claude
  # delivery. A failed or interrupted Codex turn must not disappear in logs.
  local t; t=$(date +%s); [ "${fail_since:-0}" -eq 0 ] && fail_since=$t
  if [ $((t-fail_since)) -ge 600 ] && [ $((t-${outage_note_at:-0})) -ge 3600 ]; then
    osascript -e 'display notification "Kanban watcher cannot deliver board events. See daemon.log." with title "Kanban watcher outage"' >/dev/null 2>&1
    outage_note_at=$t; log "OUTAGE NOTICE shown (failing since $(date -u -r "$fail_since" +%FT%TZ))"
  fi
}
# Delivery: claude-driver peer-direct (no controller; works from launchd; needs the target's process live).
# $2 is a stable operation id. A failed/uncertain send is retried with the SAME id and message, which
# reconciles the earlier publication instead of resending (claude-driver docs/guide.md "launchd delivery").
send() { # $1 message, $2 operation id, $3 target session (default: this watcher session)
  local target="${3:-$SESSION}" out msgfile
  if [[ "$target" =~ ^[0-9a-f-]{36}$ ]]; then
    msgfile=$(mktemp "$D/codex-message.XXXXXX") || return 1
    printf '%s' "$1" > "$msgfile"
    out=$(/opt/homebrew/opt/node@22/bin/node "$CODEX_DELIVERY" "$target" "$2" "$msgfile" 2>&1)
    local rc=$?
    rm -f "$msgfile"
    if [ "$rc" -eq 0 ]; then
      log "queued for Codex [$2]: $1 | $(printf '%s' "$out" | jq -r '.phase // "unknown"' 2>/dev/null)"; fail_since=0; return 0
    fi
    if [ "$rc" -eq 3 ]; then
      terminal_turn=$(printf '%s' "$out" | jq -er 'select(.phase=="terminal" and (.turnStatus=="failed" or .turnStatus=="interrupted")) | .turnId | select(test("^[0-9a-f-]{36}$"))' 2>/dev/null)
      if [ -n "$terminal_turn" ]; then
        log "CODEX TERMINAL [$2]: $1 | turn=$terminal_turn; inspect exact turn and board before ack; no replay"
        return 3
      fi
    fi
    log "CODEX SEND FAILED [$2]: $1 | $(printf '%s' "$out" | tr '\n' ' ' | head -c 300)"
    delivery_failed
    return 1
  fi
  if out=$("$DRIVER" send_message --session "$target" --transport peer-direct --operation_id "$2" \
      --receipt_timeout_sec 20 --message "$1" 2>&1); then
    log "sent [$2]: $1 | $(printf '%s' "$out" | jq -r '"\(.delivery) \(.receivedAt)"' 2>/dev/null)"; fail_since=0; return 0
  elif printf '%s' "$out" | grep -q 'outcome_unknown'; then
    # Observed 2026-10-19: peer-direct delivers but reports outcome_unknown. Count it as prompted so a growing
    # range doesn't re-send under a new id; the 120 s unacked re-prompt covers a real loss.
    log "UNCERTAIN [$2] (treated as sent): $1"; return 0
  else
    log "SEND FAILED [$2]: $1 | $(printf '%s' "$out" | tr '\n' ' ' | head -c 300)"
    # Delivery outage must not be silent (2026-10-22: 5.5 h of peer_unqualified went unseen). After 10 min of
    # failures, a silent macOS banner for Taylor once an hour (voice is reserved for approval blocks).
    delivery_failed
    return 1
  fi
}
err() { [ "$1" != "$lasterr" ] && log "WATCHER BROKEN: $1"; lasterr=$1; }
log "start pid $$ last_prompted=$last_prompted"
while :; do
  c=$(curl -sS -m 8 "$API/api/consumers" 2>&1)
  acked=$(printf '%s' "$c" | jq -r '(if type=="array" then . else (.consumers // []) end)[] | select(.name=="kanban-watcher") | .cursor' 2>/dev/null)
  f=$(curl -sS -m 8 "$API/api/feed?limit=1&after=999999999" 2>&1)
  latest=$(printf '%s' "$f" | jq -r '.latest' 2>/dev/null)
  case "$acked$latest" in ''|*[!0-9]*) err "parse acked='${acked:0:40}' latest='${latest:0:40}'"; sleep 10; continue;; esac
  [ -n "$lasterr" ] && { log "recovered"; lasterr=""; }
  now=$(date +%s); base=$(( acked > last_prompted ? acked : last_prompted ))
  if [ "${terminal_through:-0}" -gt 0 ] && [ "$acked" -ge "$terminal_through" ]; then
    log "CODEX TERMINAL CLEARED: board cursor $acked passed inspected range through $terminal_through"
    terminal_through=0; terminal_turn=""; prompted_from=0; save
  fi
  if [ "${terminal_through:-0}" -gt 0 ]; then
    : # Exact failed turn requires inspection and manual board action before new event ranges.
  elif [ "$acked" -lt "$last_prompted" ]; then
    if [ "${prompted_from:-0}" -eq 0 ]; then
      # Older state has no exact original range key. Never invent a new key.
      terminal_through=$last_prompted; terminal_turn="unknown"; save
      log "CODEX DELIVERY HOLD: original range key absent; inspect receipts and board through $terminal_through"
      osascript -e 'display notification "Kanban watcher range needs inspection. See daemon.log." with title "Kanban watcher needs review"' >/dev/null 2>&1
    elif [ $((now-prompted_at)) -gt 120 ]; then
      if [[ "$SESSION" == local_* ]]; then
        [ "$reprompted" -eq 0 ] && send "KANBAN EVENTS $((acked+1))..$last_prompted (re-prompt: not acked after 120 s)" "kw-re-$((acked+1))-$last_prompted" && { reprompted=1; save; }
      else
        if send "KANBAN EVENTS $prompted_from..$last_prompted" "kw-ev-$prompted_from-$last_prompted"; then prompted_at=$now; save
        else
          rc=$?
          if [ "$rc" -eq 3 ]; then
            terminal_through=$last_prompted; prompted_at=$now; reprompted=1; save
            osascript -e 'display notification "Kanban watcher turn stopped. Inspect daemon.log and board cursor." with title "Kanban watcher needs review"' >/dev/null 2>&1
            send "WATCHER DELIVERY HOLD: exact event range through $terminal_through reached terminal turn $terminal_turn. Inspect that turn and the board before manually advancing the consumer cursor; do not replay the intent. New event delivery is held until cursor reaches $terminal_through." "kw-terminal-$terminal_through" "$MANAGER" || :
          fi
        fi
      fi
    fi
  elif [ "$latest" -gt "$base" ]; then
    if send "KANBAN EVENTS $((base+1))..$latest" "kw-ev-$((base+1))-$latest"; then prompted_from=$((base+1)); last_prompted=$latest; prompted_at=$now; reprompted=0; save
    else
      rc=$?
      if [ "$rc" -eq 3 ]; then
        terminal_through=$latest; prompted_from=$((base+1)); last_prompted=$latest; prompted_at=$now; reprompted=1; save
        osascript -e 'display notification "Kanban watcher turn stopped. Inspect daemon.log and board cursor." with title "Kanban watcher needs review"' >/dev/null 2>&1
        send "WATCHER DELIVERY HOLD: exact event range through $terminal_through reached terminal turn $terminal_turn. Inspect that turn and the board before manually advancing the consumer cursor; do not replay the intent. New event delivery is held until cursor reaches $terminal_through." "kw-terminal-$terminal_through" "$MANAGER" || :
      fi
    fi
  fi
  # State sweep (brief "watch state"): unacted Taylor events (24 h) and Blocked cards with no ask.
  # Prompt when the set changes, and every 20 min while it is non-empty. First pass after start = backfill.
  sw=$("$D/sweep.sh" 2>&1); swrc=$?
  if [ $swrc -ne 0 ]; then err "sweep: ${sw:0:80}"
  elif [ -n "$sw" ]; then
    sig=$(printf '%s' "$sw" | shasum | cut -c1-12)
    if [ "$sig" != "${sweep_sig:-}" ] || [ $((now-${sweep_at:-0})) -gt 1200 ]; then
      send "KANBAN SWEEP $(printf '%s' "$sw" | tr '\n' ';')" "kw-sw-$sig-$((now/1200))" && { sweep_sig=$sig; sweep_at=$now; save; }
    fi
  else sweep_sig=""; fi
  # Stall check: every 10 min, Active cards whose assignee is idle, waiting or gone with
  # no card comment/move for 20 min, plus Active cards with no assignee. Route routine triage to
  # the watcher; it escalates only a concrete manager decision. A broken check still alerts the manager.
  if [ $((now-stall_at)) -ge 600 ]; then
    stall_at=$now; so=$("$D/stall.sh" 2>&1); src=$?
    if [ $src -ne 0 ]; then err "stall: ${so:0:80}"
      [ $((now-${stall_broken_at:-0})) -ge 1800 ] && send "WATCHER BROKEN kanban-watcher stall check: ${so:0:120}" "kw-stb-$((now/1800))" "$MANAGER" && stall_broken_at=$now
    else
      touch "$STALLS"
      unrouted_ids=""; unrouted_count=0
      while IFS= read -r ln; do
        [ -z "$ln" ] && continue
        read -r kind card w st idle rest <<< "$ln"
        prev=$(awk -v k="$kind $card" '$2" "$3==k{t=$1} END{print t+0}' "$STALLS")
        [ $((now-prev)) -lt 1800 ] && continue
        if [ "$kind" = READY_UNROUTED ]; then
          unrouted_ids="${unrouted_ids:+$unrouted_ids }$card"
          unrouted_count=$((unrouted_count+1))
          continue
        fi
        if [ "$kind" = STALL ]; then msg="STALL #$card $w $st $idle min; last comment: $rest"
        elif [ "$kind" = HIDDENASK ]; then msg="HIDDEN-ASK #$card Active but waiting on Taylor; move it to Blocked with a self-contained ask (FLEET.md TAYLOR GATES). Last comment: ${ln#HIDDENASK $card }"
        elif [ "$kind" = READY_UNCLAIMED ]; then msg="READY-UNCLAIMED #$card routed to $w for $idle min without worker self-claim; verify delivery, then reassign if needed. $rest"
        else msg="NO-ASSIGNEE #$card Active with no current Assigned: line or worker owner: $w $st $idle $rest"; fi
        send "$msg" "kw-st-$kind-$card-$((now/1800))" && printf '%s %s %s\n' "$now" "$kind" "$card" >> "$STALLS"
      done <<< "$so"
      if [ "$unrouted_count" -gt 0 ]; then
        unrouted_key=$(printf '%s' "$unrouted_ids" | shasum | cut -c1-12)
        if send "READY-UNROUTED $unrouted_count Ready card(s) have no current route after the grace period: $(printf '#%s ' $unrouted_ids). Triage for parallel code work, mono integration, or owned verification; route workable cards and verify pickup." "kw-st-ready-unrouted-$((now/1800))-$unrouted_key"; then
          for card in $unrouted_ids; do printf '%s %s %s\n' "$now" READY_UNROUTED "$card" >> "$STALLS"; done
        fi
      fi
    fi
  fi
  # Codex workers are absent from Claude live_sessions. Check every minute for
  # quiet Active Codex cards; the watcher verifies native turn state and acts.
  # A card comment alone never suppresses this beyond the short grace period.
  if [ $((now-codex_at)) -ge 60 ]; then
    codex_at=$now
    co=$(python3 "$D/codex-active.py" 2>&1); corc=$?
    if [ "$corc" -ne 0 ]; then err "codex active: ${co:0:120}"
    else
      touch "$STALLS"
      while read -r kind card worker thread idle; do
        [ "$kind" = CODEX_CHECK ] || continue
        prev=$(awk -v k="CODEX_CHECK $card" '$2" "$3==k{t=$1} END{print t+0}' "$STALLS")
        [ $((now-prev)) -lt 300 ] && continue
        if send "CODEX-LIVENESS #$card Active; $worker thread $thread has had no board activity for $idle min. Read native turn status and card. If idle/interrupted with agent-executable work, resume a bounded next step and verify a fresh worker turn plus worker-authored continuation. If capacity is full, move to Ready with owner and changed-condition wake. Do not count an old Assigned comment as current work." "kw-codex-active-$card-$((now/300))"; then
          printf '%s %s %s\n' "$now" CODEX_CHECK "$card" >> "$STALLS"
        fi
      done <<< "$co"
    fi
  fi
  if [ -f "$D/wake_at" ]; then
    read -r at reason < "$D/wake_at"
    case "$at" in ''|*[!0-9]*) log "bad wake_at"; rm -f "$D/wake_at";; *)
      [ "$now" -ge "$at" ] && send "KANBAN WAKE ${reason:-due}" "kw-wake-$at" && rm -f "$D/wake_at";; esac
  fi
  sleep 10
done
