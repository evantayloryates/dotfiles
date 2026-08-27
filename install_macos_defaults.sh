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

# --- Window animations ------------------------------------------------------
# Suppress the animated window resize, including the zoom/fill that plays when
# you double-click a title bar.
#
#   NSWindowResizeTime ................. duration of AppKit's animated resize.
#     0.001 rather than 0 — Apple documents this key, and 0 has historically
#     failed to disable the animation rather than making it instant.
#   NSAutomaticWindowAnimationsEnabled . the automatic window animations toggle.
#
# Both are needed; setting only the first is why this looked "fixed" and then
# appeared to regress.
#
# No live-apply step exists: AppKit reads these ONCE at app launch, so running
# apps keep the old behavior until relaunched. Nothing to restart here, hence
# the log line instead of a killall.
#
# A FULL QUIT is required, not just closing the window: an app that is already
# running keeps the old behavior indefinitely. This is the usual reason the
# setting looks like it "did nothing" — verified 2026-08-26 with Arc, which was
# still animating until ⌘Q + relaunch, then stopped.
#
# Chromium/Electron apps that draw their own title bars are commonly said to
# ignore this key. Arc disproves that as a blanket claim — it honors it fine
# once relaunched. If some app genuinely does ignore it, that app is handling
# double-click zoom internally and no `defaults` key will reach it; the only
# remaining lever there is Accessibility → Reduce Motion, which is system-wide.

window_anim_changed=0
defaults_set -g NSWindowResizeTime                 -float 0.001 && window_anim_changed=1
defaults_set -g NSAutomaticWindowAnimationsEnabled -bool  false && window_anim_changed=1

if [[ "$window_anim_changed" -eq 1 ]]; then
  log "💤 Window animation settings changed — relaunch apps to pick them up"
else
  log "🟰 Window animation settings already correct"
fi

# --- Trackpad ---------------------------------------------------------------
# Three groups of settings, all sharing ONE activation at the end: tap-to-click,
# three-finger drag, and tracking speed. activateSettings -u is what pushes any
# of them into the running session, so no logout is needed — it fires at most
# once per run, and only if something actually moved.
#
# Every trackpad setting is written to as many as three stores, and which ones
# matter varies by key. Skipping one is the usual reason a correct-looking
# recipe silently does nothing:
#   com.apple.AppleMultitouchTrackpad ................ the built-in trackpad
#   com.apple.driver.AppleBluetoothMultitouch.trackpad an external Magic Trackpad
#   NSGlobalDomain, usually -currentHost .............. what AppKit/the session reads

TRACKPAD_BUILTIN=com.apple.AppleMultitouchTrackpad
TRACKPAD_BT=com.apple.driver.AppleBluetoothMultitouch.trackpad

trackpad_changed=0

# Tap to click — macOS otherwise wants a full press until the haptic pulse.
# tapBehavior goes to BOTH global stores: the -currentHost copy is what the
# running session reads, the plain one seeds sessions created later.
defaults_set "$TRACKPAD_BUILTIN" Clicking -bool true && trackpad_changed=1
defaults_set "$TRACKPAD_BT"      Clicking -bool true && trackpad_changed=1
defaults_set -currentHost NSGlobalDomain com.apple.mouse.tapBehavior -int 1 && trackpad_changed=1
defaults_set              NSGlobalDomain com.apple.mouse.tapBehavior -int 1 && trackpad_changed=1

# Three-finger drag — drag a window by moving three fingers, no click needed.
#
# The swipe reassignment below is NOT optional. Three-finger swipe is Spaces
# (horizontal) and Mission Control (vertical); leaving either on three fingers
# makes it fight the drag. macOS's own Accessibility toggle moves BOTH axes to
# four fingers, and this mirrors that. 0 = off, 2 = enabled.
defaults_set "$TRACKPAD_BUILTIN" TrackpadThreeFingerDrag -bool true && trackpad_changed=1
defaults_set "$TRACKPAD_BT"      TrackpadThreeFingerDrag -bool true && trackpad_changed=1
defaults_set -currentHost NSGlobalDomain com.apple.trackpad.threeFingerDragGesture -bool true && trackpad_changed=1

for _tp_domain in "$TRACKPAD_BUILTIN" "$TRACKPAD_BT"; do
  defaults_set "$_tp_domain" TrackpadThreeFingerHorizSwipeGesture -int 0 && trackpad_changed=1
  defaults_set "$_tp_domain" TrackpadThreeFingerVertSwipeGesture  -int 0 && trackpad_changed=1
  defaults_set "$_tp_domain" TrackpadFourFingerHorizSwipeGesture  -int 2 && trackpad_changed=1
  defaults_set "$_tp_domain" TrackpadFourFingerVertSwipeGesture   -int 2 && trackpad_changed=1
done
unset _tp_domain

defaults_set -currentHost NSGlobalDomain com.apple.trackpad.threeFingerHorizSwipeGesture -int 0 && trackpad_changed=1
defaults_set -currentHost NSGlobalDomain com.apple.trackpad.threeFingerVertSwipeGesture  -int 0 && trackpad_changed=1
defaults_set -currentHost NSGlobalDomain com.apple.trackpad.fourFingerHorizSwipeGesture  -int 2 && trackpad_changed=1
defaults_set -currentHost NSGlobalDomain com.apple.trackpad.fourFingerVertSwipeGesture   -int 2 && trackpad_changed=1

# Tracking speed. The System Settings slider is a discrete ladder, not a free
# scale — 0, 0.125, 0.3125, 0.5, 0.6875, 0.875, 1.0, 1.5, 2.0, 3.0 — and the
# live IOHIDSystem value is this number in 16.16 fixed point (x * 65536), which
# is how to verify it landed:
#   ioreg -c IOHIDSystem -r | grep -o '"HIDTrackpadAcceleration"=[0-9]*'
#
# NOTE: hidutil does NOT work here. Unlike key repeat below, it does not expose
# HIDTrackpadAcceleration at all — `--set` reports success and changes nothing.
# activateSettings is the only lever.
TRACKPAD_SCALING=0.875
defaults_set -g com.apple.trackpad.scaling -float "$TRACKPAD_SCALING" && trackpad_changed=1

ACTIVATE_SETTINGS=/System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/activateSettings

if [[ "$trackpad_changed" -eq 1 ]]; then
  if [[ -x "$ACTIVATE_SETTINGS" ]]; then
    "$ACTIVATE_SETTINGS" -u >/dev/null 2>&1 \
      && log "🔄 Pushed trackpad settings live — no logout needed" \
      || log "⚠️  activateSettings failed — trackpad settings apply after the next login"
  else
    log "⚠️  activateSettings not found — trackpad settings apply after the next login"
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
