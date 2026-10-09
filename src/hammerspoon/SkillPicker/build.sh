#!/bin/sh
set -eu
skill_picker_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
skill_picker_build=$(mktemp -d "$skill_picker_root/.build.XXXXXX")
trap 'rm -rf "$skill_picker_build"' EXIT
xcrun swiftc -O "$skill_picker_root/Popup.swift" "$skill_picker_root/SkillRecord.swift" "$skill_picker_root/Availability.swift" "$skill_picker_root/SearchInput.swift" -o "$skill_picker_build/SkillPicker" -framework AppKit
"$skill_picker_build/SkillPicker" --self-test
python3 - "$skill_picker_build/SkillPicker" <<'PYTEST'
import subprocess, sys
# AppKit can swallow a test-time Objective-C exception and leave its event
# loop running. Bound the test; never install an unverified helper.
subprocess.run([sys.argv[1], "--ui-self-test"], check=True, timeout=30)
PYTEST

mv "$skill_picker_build/SkillPicker" "$skill_picker_root/SkillPicker.app/Contents/MacOS/SkillPicker"
