#!/bin/zsh
# Push the NSGlobalDomain key-repeat preferences into the live HID event system.
# Fired at login by the com.taylor.keyrepeat LaunchAgent.
#
# Why this exists
# ---------------
# The two surfaces that control key repeat are INDEPENDENT stores:
#
#   NSGlobalDomain InitialKeyRepeat / KeyRepeat   persists across reboots
#   HID event system (hidutil) HIDInitialKeyRepeat / HIDKeyRepeat   live, but
#                                                 resets every boot
#
# Verified independent on this machine: deleting both NSGlobalDomain keys left
# hidutil reporting its previous values unchanged. So writing the defaults does
# not, on its own, guarantee the live rate follows on the next login. This agent
# closes that gap — at every login it reads the persisted preference and applies
# it to the live system, so no manual `hidutil` re-run is ever needed.
#
# The preference is the single source of truth: this script hardcodes no rate.
# Change it with `defaults write -g KeyRepeat …` (or install_macos_defaults.sh,
# or the System Settings slider) and the next login picks it up. Unset means
# "leave the system default alone" — the script no-ops rather than forcing one.
#
# Units: the NSGlobalDomain keys count 1/60 s ticks; hidutil wants nanoseconds.
# awk does the conversion so a fractional tick count can't break the arithmetic,
# and truncation matches what hidutil reports back (10 ticks → 166666666 ns).
#
# Always exits 0 — a missing preference is a normal state, not a launchd failure.

LOG="$HOME/Library/Logs/com.taylor.keyrepeat.log"
mkdir -p "$(dirname "$LOG")"

note() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

apply() { # <defaults-key> <hidutil-property>
  local pref="$1" prop="$2" ticks ns have
  ticks="$(/usr/bin/defaults read -g "$pref" 2>/dev/null)" || {
    note "$pref unset — leaving $prop at the system default"
    return 0
  }
  ns="$(/usr/bin/awk -v t="$ticks" 'BEGIN{printf "%d", t*1000000000/60}' 2>/dev/null)"
  [[ -z "$ns" || "$ns" -le 0 ]] && { note "$pref='$ticks' is not a usable tick count — skipped"; return 0; }

  have="$(/usr/bin/hidutil property --get "$prop" 2>/dev/null)"
  if [[ "$have" == "$ns" ]]; then
    note "$prop already $ns ns (from $pref=$ticks)"
    return 0
  fi
  if /usr/bin/hidutil property --set "{\"$prop\":$ns}" >/dev/null 2>&1; then
    note "$prop: ${have:-<unknown>} → $ns ns (from $pref=$ticks)"
  else
    note "$prop: failed to set $ns ns"
  fi
}

apply InitialKeyRepeat HIDInitialKeyRepeat
apply KeyRepeat        HIDKeyRepeat

# Bound the log; this fires once per login so growth is slow, but never zero.
if [[ -f "$LOG" ]] && [[ "$(wc -l < "$LOG")" -gt 200 ]]; then
  tail -n 100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

exit 0
