#!/bin/zsh
# always-on.sh — make this Mac never sleep, lid open or closed, on battery or AC (mirrors theo-air). Needs sudo once.
#   always-on.sh          apply
#   always-on.sh --undo   restore macOS defaults (sleep allowed, lid-close sleeps, no daily wake)
#   always-on.sh --show   print the current state, no sudo
# The other layers need no sudo and live elsewhere: com.taylor.caffeinate (launchd agent) and Amphetamine (login item,
# session at launch, closed-display mode). To sleep the Mac on purpose: shut it down.
set -eu
show() {
  pmset -g | grep -E "^ (SleepDisabled|sleep|displaysleep|disksleep|powernap|womp|tcpkeepalive|lowpowermode) " | sed 's/^ */  /'
  pmset -g sched | grep -iE "wake|power" | head -2 | sed 's/^ */  sched: /'
}
case ${1:-} in
  --show) show; exit 0 ;;
  --undo)
    sudo -v
    sudo pmset -a disablesleep 0
    sudo pmset -b sleep 1 displaysleep 2 disksleep 10
    sudo pmset -c sleep 1 displaysleep 10 disksleep 10
    sudo pmset -a powernap 1
    sudo pmset repeat cancel
    echo "restored defaults"; show; exit 0 ;;
esac
sudo -v
sudo pmset -a disablesleep 1                 # lid closed, battery, no external display: still no sleep
sudo pmset -a sleep 0 displaysleep 0 disksleep 0
sudo pmset -a powernap 0 womp 1 tcpkeepalive 1
sudo pmset -b lowpowermode 0 2>/dev/null || true
sudo pmset repeat wakeorpoweron MTWRFSU 06:00:00   # belt and braces: if it ever does sleep, it wakes daily
echo "always-on applied"; show
