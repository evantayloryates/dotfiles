#!/bin/bash
# One-time explicit administrator installation; this installer is NOT in sudoers.
set -euo pipefail
[[ "$(/usr/bin/id -u)" == 0 ]] || { echo 'Run this installer once using sudo.' >&2; exit 77; }
caller="${SUDO_USER:-}"
[[ "$caller" == taylor && "$(/usr/bin/id -u "$caller")" == 503 ]] || { echo 'Expected Taylor via sudo.' >&2; exit 77; }
source_dir="$(cd "$(dirname "$0")" && pwd)"
helper=/Library/PrivilegedHelperTools/com.taylor.btle-stack-capture
rule=/private/etc/sudoers.d/taylor-btle-stack
state=/private/var/db/btle-stack-capture
for directory in /Library /Library/PrivilegedHelperTools /private /private/etc /private/etc/sudoers.d /private/var /private/var/db; do
 if [[ ! -e "$directory" && "$directory" == /private/etc/sudoers.d ]]; then /usr/bin/install -d -o root -g wheel -m 755 "$directory"; fi
 [[ -d "$directory" && ! -L "$directory" ]] || { echo "Unsafe directory: $directory" >&2; exit 78; }
 [[ "$(/usr/bin/stat -f %u "$directory")" == 0 ]] || exit 78
 mode=$(/usr/bin/stat -f %Lp "$directory")
 (( (8#$mode & 8#022) == 0 )) || { echo "Writable directory: $directory" >&2; exit 78; }
done
[[ ! -L "$helper" && ! -L "$rule" && ! -L "$state" ]] || exit 78
/usr/sbin/visudo -c >/dev/null
/bin/sh -n "$source_dir/btle-stack-capture.sh"
/usr/bin/install -d -o root -g wheel -m 700 "$state"
/usr/bin/install -o root -g wheel -m 755 "$source_dir/btle-stack-capture.sh" "$helper"
tmp=$(/usr/bin/mktemp /private/etc/sudoers.d/.btle-rule.XXXXXXXX)
trap '/bin/rm -f "$tmp"' EXIT
# Empty quoted argument specification means EXACTLY no arguments, not arbitrary arguments.
printf 'taylor ALL=(root) NOPASSWD: %s ""\n' "$helper" > "$tmp"
/bin/chmod 440 "$tmp"
/usr/sbin/visudo -cf "$tmp" >/dev/null
/usr/bin/install -o root -g wheel -m 440 "$tmp" "$rule"
/usr/sbin/visudo -c >/dev/null || { /bin/rm -f "$rule"; exit 78; }
echo 'Installed narrowly scoped BTLEServer stack permission. Root-owned helper; no arguments; fixed target; three-second capture; 60-second cooldown.'
