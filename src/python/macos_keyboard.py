#!/usr/bin/env python3
"""Persist Caps Lock -> Control using macOS's per-keyboard Modifier Keys prefs."""

import plistlib
import subprocess
import sys

CAPS_LOCK = 0x700000039
# System Settings writes Right Control for its "Control" menu choice (26.5.1).
CONTROL = 0x7000000E4
SOURCE = "HIDKeyboardModifierMappingSrc"
DESTINATION = "HIDKeyboardModifierMappingDst"
ACTIVATE_SETTINGS = (
    "/System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/"
    "activateSettings"
)


def run(*args, input=None):
    return subprocess.run(args, input=input, capture_output=True, check=True).stdout


def keyboard_ids(nodes):
    """Read IDs from each keyboard service, never pair unrelated ioreg lines."""
    found = set()
    for node in nodes:
        if node.get("PrimaryUsagePage") == 1 and node.get("PrimaryUsage") == 6:
            vendor, product = node.get("VendorID"), node.get("ProductID")
            if isinstance(vendor, int) and isinstance(product, int):
                found.add(f"{vendor}-{product}-0")
        found.update(keyboard_ids(node.get("IORegistryEntryChildren", [])))
    return found


def read_mapping(key):
    result = subprocess.run(
        ["/usr/bin/defaults", "-currentHost", "read", "-g", key],
        capture_output=True,
    )
    if result.returncode:
        if b"does not exist" in result.stderr:
            return []
        raise RuntimeError(f"Could not read {key}: {result.stderr.decode().strip()}")
    # defaults emits OpenStep syntax; plutil converts it to a real plist.
    pairs = plistlib.loads(run(
        "/usr/bin/plutil", "-convert", "xml1", "-o", "-", "-", input=result.stdout
    ))
    if not isinstance(pairs, list):
        raise ValueError(f"Expected a mapping array for {key}")
    for pair in pairs:
        # OpenStep read-back renders the integer IDs as strings.
        pair[SOURCE] = int(pair[SOURCE])
        pair[DESTINATION] = int(pair[DESTINATION])
    return pairs


def with_caps_control(pairs):
    # 0 is the legacy Caps Lock source used by older macOS preferences.
    others = [pair for pair in pairs if pair[SOURCE] not in (CAPS_LOCK, 0)]
    return others + [{SOURCE: CAPS_LOCK, DESTINATION: CONTROL}]


def dictionary_xml(pair):
    xml = plistlib.dumps(pair).decode()
    return xml[xml.index("<dict>"):xml.index("</dict>") + len("</dict>")]


def main():
    if sys.platform != "darwin":
        return
    nodes = plistlib.loads(run("/usr/sbin/ioreg", "-a", "-r", "-c", "IOHIDEventService"))
    ids = sorted(keyboard_ids(nodes))
    if not ids:
        print("No connected keyboard services found; connect a keyboard and rerun setup.")
        return
    changed = False
    for keyboard in ids:
        key = f"com.apple.keyboard.modifiermapping.{keyboard}"
        current = read_mapping(key)
        wanted = with_caps_control(current)
        if current == wanted:
            continue
        run("/usr/bin/defaults", "-currentHost", "write", "-g", key, "-array",
            *(dictionary_xml(pair) for pair in wanted))
        if read_mapping(key) != wanted:
            raise RuntimeError(f"Modifier preference verification failed for {keyboard}")
        changed = True
        print(f"Caps Lock -> Control saved for keyboard {keyboard}")
    # Also activate on a rerun: a previous attempt may have saved preferences
    # but failed before pushing them into the session. No app restart required.
    run(ACTIVATE_SETTINGS, "-u")
    print("Keyboard modifier preferences activated" if changed else
          "Caps Lock -> Control already configured; preferences activated")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, RuntimeError,
            subprocess.CalledProcessError) as error:
        print(f"Keyboard setup failed: {error}", file=sys.stderr)
        sys.exit(1)
