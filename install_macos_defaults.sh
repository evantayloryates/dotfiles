#!/usr/bin/env bash
#
# macOS system preferences. Called from install.sh; also safe to run on its own.
#
# Contract:
#   - Idempotent, and quiet when nothing changed.
#   - Side effects are gated on real change: `killall Dock` (a visible restart)
#     fires at most once per run, and only if a Dock key actually moved.
#   - No-op on non-Darwin.

[[ "$(uname)" == "Darwin" ]] || exit 0

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg"
  echo "$msg" >> "$HOME/log.txt"
}

# Write <value> and report (exit 0) whether the stored value actually changed.
# Comparing read-back against read-back sidesteps every type-coercion gotcha:
# `-bool true` reads back as 1, `-float 1.0` as 1, `-float 0` as 0. Re-writing
# an already-correct value is content-inert, so the redundant write is free and
# the before/after diff is an exact "did this move?" signal.
# An optional leading -currentHost targets the per-host (ByHost) store instead
# of the normal one; some keys are only read from there by the live session.
defaults_set() { # [-currentHost] <domain> <key> <type-flag> <value>
  local scope=""
  if [[ "$1" == "-currentHost" ]]; then
    scope="-currentHost"
    shift
  fi
  local domain="$1" key="$2" type="$3" value="$4" before after
  # $scope is deliberately unquoted: empty must expand to NO argument, and this
  # is bash, which word-splits. (Do not copy this idiom into a zsh file — zsh
  # does not split unquoted parameters and would pass an empty string instead.)
  before="$(defaults $scope read "$domain" "$key" 2>/dev/null)"
  defaults $scope write "$domain" "$key" "$type" "$value" 2>/dev/null || {
    log "⚠️  Failed to write ${scope:+(currentHost) }$domain $key"
    return 1
  }
  after="$(defaults $scope read "$domain" "$key" 2>/dev/null)"
  [[ "$before" == "$after" ]] && return 1
  log "⚙️  ${scope:+(currentHost) }$domain $key: ${before:-<unset>} → $after"
  return 0
}

# --- Dock -------------------------------------------------------------------
# Right-hand side, auto-hiding, with the show/hide animation and delay removed.

dock_changed=0
defaults_set com.apple.dock orientation            -string right && dock_changed=1
defaults_set com.apple.dock autohide               -bool   true  && dock_changed=1
defaults_set com.apple.dock autohide-delay         -float  0     && dock_changed=1
defaults_set com.apple.dock autohide-time-modifier -float  0     && dock_changed=1

if [[ "$dock_changed" -eq 1 ]]; then
  killall Dock 2>/dev/null && log "🔄 Restarted Dock to pick up the new settings"
else
  log "🟰 Dock settings already correct — not restarting Dock"
fi

# --- Finder -----------------------------------------------------------------
# Everything that needs a Finder restart to take effect, gated as a group. Same
# rule as the Dock: `killall Finder` closes every open Finder window, so it
# fires at most once per run and only if some key below actually moved.
#
# Note the two different domains. Hidden-file visibility is Finder's own
# preference, but file-extension visibility is a GLOBAL (NSGlobalDomain) key
# that Finder merely reads — it still needs the same restart, so it belongs in
# this block rather than with the other NSGlobalDomain writes further down.

finder_changed=0
defaults_set com.apple.finder AppleShowAllFiles      -bool true && finder_changed=1
defaults_set NSGlobalDomain   AppleShowAllExtensions -bool true && finder_changed=1

if [[ "$finder_changed" -eq 1 ]]; then
  killall Finder 2>/dev/null && log "🔄 Restarted Finder to pick up the new settings"
else
  log "🟰 Finder settings already correct — not restarting Finder"
fi

# --- Trackpad ---------------------------------------------------------------
# Tap-to-click. By default macOS wants a full press until the haptic pulse
# fires; this makes a light tap register as a click.
#
# Four writes, all load-bearing:
#   AppleMultitouchTrackpad ............ the built-in trackpad
#   AppleBluetoothMultitouch.trackpad .. an external Magic Trackpad
#   com.apple.mouse.tapBehavior ........ what AppKit/apps actually consult
#
# tapBehavior is written TWICE on purpose, to two different stores: the
# -currentHost (ByHost) copy is what the running login session reads, and the
# plain one seeds sessions created later. Writing only one of them is the usual
# reason a correct-looking recipe silently does nothing.
#
# activateSettings -u then pushes the change into the live session, so no logout
# is needed (verified 2026-08-26: tapping worked immediately after a run).

trackpad_changed=0
defaults_set com.apple.AppleMultitouchTrackpad                Clicking -bool true && trackpad_changed=1
defaults_set com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking -bool true && trackpad_changed=1
defaults_set -currentHost NSGlobalDomain com.apple.mouse.tapBehavior -int 1 && trackpad_changed=1
defaults_set              NSGlobalDomain com.apple.mouse.tapBehavior -int 1 && trackpad_changed=1

ACTIVATE_SETTINGS=/System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/activateSettings

if [[ "$trackpad_changed" -eq 1 ]]; then
  if [[ -x "$ACTIVATE_SETTINGS" ]]; then
    "$ACTIVATE_SETTINGS" -u >/dev/null 2>&1 \
      && log "🔄 Pushed trackpad settings live — no logout needed" \
      || log "⚠️  activateSettings failed — tap-to-click applies after the next login"
  else
    log "⚠️  activateSettings not found — tap-to-click applies after the next login"
  fi
else
  log "🟰 Trackpad settings already correct — nothing to activate"
fi

# --- Key repeat -------------------------------------------------------------
# Two surfaces, and they are INDEPENDENT stores (verified: deleting both
# NSGlobalDomain keys left hidutil reporting its previous values unchanged):
#
#   defaults write -g …   the persistent preference. Survives reboots; also what
#                         the System Settings slider reads. Does NOT take effect
#                         mid-session (verified: writing it left the live value
#                         untouched).
#   hidutil property      the live HID event system. Applies immediately and
#                         session-wide (verified: a fresh `env -i` process reads
#                         the new value back), but resets on every boot.
#
# So this script writes the preference and pushes it live, which covers the
# current session. Carrying it across reboots is the com.taylor.keyrepeat
# LaunchAgent's job — it re-reads this same preference at each login and applies
# it, so no manual `hidutil` re-run is ever needed. See src/launchd/README.md.
#
# Units: the NSGlobalDomain keys count 1/60 s ticks; hidutil wants nanoseconds.
# Derive the ns from the tick count with integer math so the value matches what
# hidutil reports back exactly (10 ticks → 166666666 ns, not 10×16666666).

INITIAL_KEY_REPEAT_TICKS=10   # ~167 ms before the first repeat
KEY_REPEAT_TICKS=1            # ~17 ms between repeats (as fast as macOS goes)

ticks_to_ns() { echo $(( $1 * 1000000000 / 60 )); }

defaults_set -g InitialKeyRepeat -float "$INITIAL_KEY_REPEAT_TICKS"
defaults_set -g KeyRepeat        -float "$KEY_REPEAT_TICKS"

# Apply live. Gated on the HID system's own current value rather than on
# whether the `defaults` write moved — after a reboot the defaults are already
# correct while the live value may not be, and that case still needs the push.
hid_set() { # <property> <desired-ns>
  local prop="$1" want="$2" have
  have="$(hidutil property --get "$prop" 2>/dev/null)"
  [[ "$have" == "$want" ]] && return 1
  hidutil property --set "{\"$prop\":$want}" >/dev/null 2>&1 || {
    log "⚠️  Failed to set $prop live — takes effect after the next login"
    return 1
  }
  log "⌨️  $prop: ${have:-<unknown>} → $want ns (live)"
  return 0
}

if command -v hidutil >/dev/null 2>&1; then
  hid_changed=0
  hid_set HIDInitialKeyRepeat "$(ticks_to_ns "$INITIAL_KEY_REPEAT_TICKS")" && hid_changed=1
  hid_set HIDKeyRepeat        "$(ticks_to_ns "$KEY_REPEAT_TICKS")"         && hid_changed=1
  [[ "$hid_changed" -eq 0 ]] && log "🟰 Key repeat already live at the target rate"
else
  log "⚠️  hidutil not found — key repeat applies after the next login"
fi

exit 0
