#!/bin/sh
# Installed root-owned copy only. No caller-controlled PID, flags, paths or duration.
set -eu
[ "$#" -eq 0 ] || { echo 'No arguments accepted' >&2; exit 64; }
[ "$(/usr/bin/id -u)" -eq 0 ] || { echo 'Root required' >&2; exit 77; }
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH
IFS=" 	
"
unset ENV BASH_ENV CDPATH PYTHONPATH PYTHONHOME DYLD_LIBRARY_PATH DYLD_INSERT_LIBRARIES
umask 077
state=/private/var/db/btle-stack-capture
[ -d "$state" ] && [ ! -L "$state" ] || exit 78
[ "$(/usr/bin/stat -f '%u:%Lp' "$state")" = '0:700' ] || exit 78
/bin/mkdir "$state/lock" 2>/dev/null || { echo 'Capture busy' >&2; exit 75; }
tmp=''
trap '[ -z "$tmp" ] || /bin/rm -rf "$tmp"; /bin/rmdir "$state/lock"' EXIT
now=$(/bin/date +%s)
if [ -f "$state/last" ]; then
 read -r previous < "$state/last"
 case "$previous" in ''|*[!0-9]*) exit 78;; esac
 [ "$((now-previous))" -ge 60 ] || { echo 'Capture cooldown' >&2; exit 75; }
fi
pid=''
for candidate in $(/usr/bin/pgrep -x BTLEServer || true); do
 case "$candidate" in ''|*[!0-9]*) continue;; esac
 identity=$(/bin/ps -p "$candidate" -o uid=,comm= || true)
 # Only Apple's root-owned fixed executable, never an arbitrary caller-supplied target.
 set -- $identity
 if [ "$#" -eq 2 ] && [ "$1" = 0 ] && [ "$2" = /usr/sbin/BTLEServer ]; then pid=$candidate; break; fi
done
[ -n "$pid" ] || { echo 'Verified BTLEServer not found' >&2; exit 69; }
printf '%s\n' "$now" > "$state/last"
tmp=$(/usr/bin/mktemp -d "$state/capture.XXXXXXXX")
/usr/bin/sample "$pid" 3 -file "$tmp/stack.txt" >/dev/null 2>&1
/usr/bin/head -c 500000 "$tmp/stack.txt"
