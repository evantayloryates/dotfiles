#!/usr/bin/env python3
"""Explicit local dev build. Does not edit project source or touch XCTest."""
import argparse
import hashlib
import json
import os
import plistlib
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parent


def source_hashes(mobile):
    paths = list((ROOT / "native").glob("*")) + [mobile / "ios/kudos/AppDelegate.mm"]
    return {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.is_file()}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mobile", type=Path, required=True)
    p.add_argument("--udid", required=True, help="Xcode destination device UDID")
    p.add_argument("--derived-data", type=Path, required=True)
    p.add_argument("--log", type=Path, required=True, help="private build log, not transcript output")
    p.add_argument("--metro", action="store_true", help="use normal app Metro URL instead of the embedded bundle")
    a = p.parse_args()
    mobile = a.mobile.resolve()
    if not (mobile / "ios/kudos.xcworkspace").exists():
        raise SystemExit("Kickoff_mobile_workspace_required")
    a.log.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(a.log, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    flags = "$(inherited) -DIOS_AGENT_ENABLED=1"
    if not a.metro:
        flags += " -DIOS_AGENT_EMBEDDED_BUNDLE=1"
    env = {**os.environ, "IOS_AGENT_MOBILE_ROOT": str(mobile), "ENVFILE": ".env.development", "RCT_NO_LAUNCH_PACKAGER": "1", "BUGSNAG_DISABLE_UPLOAD": "1", "BUNDLE_CONFIG": str(ROOT / "native/metro.cjs")}
    env.pop("SKIP_BUNDLING", None)
    start = time.monotonic()
    before = source_hashes(mobile)
    with os.fdopen(fd, "w") as log:
        run = subprocess.run(["xcodebuild", "-workspace", str(mobile / "ios/kudos.xcworkspace"), "-scheme", "kudos development", "-configuration", "Debug", "-destination", "id=" + a.udid, "-derivedDataPath", str(a.derived_data.resolve()),
                              "OTHER_CPLUSPLUSFLAGS=" + flags, "HEADER_SEARCH_PATHS=$(inherited) " + str(ROOT / "native"), "OTHER_LDFLAGS=$(inherited) -framework IOKit", "build"], env=env, stdout=log, stderr=subprocess.STDOUT)
    after = source_hashes(mobile)
    changed = before != after
    products = a.derived_data.resolve() / "Build/Products/Debug-iphoneos"
    matches = [app for app in products.glob("*.app") if (app / "Info.plist").exists() and plistlib.loads((app / "Info.plist").read_bytes()).get("CFBundleIdentifier") == "com.dev.kudos.fit"]
    product = str(matches[0]) if len(matches) == 1 else None
    evidence = {"exit": run.returncode, "seconds": round(time.monotonic() - start, 1), "product": product, "sourceEdited": False, "xctestStarted": False, "sourceChangedDuringBuild": changed, "sources": after}
    (a.derived_data / "ios-agent-build.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps({k: v for k, v in evidence.items() if k != "sources"}))
    raise SystemExit(run.returncode or int(changed or not product))


if __name__ == "__main__":
    main()
