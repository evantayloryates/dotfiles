#!/usr/bin/env python3
"""Compile/run a synthetic UIKit fixture, never XCTest or a real app account."""
import argparse
import json
from pathlib import Path
import plistlib
import subprocess
import tempfile
import time

ROOT = Path(__file__).parents[1]
BUNDLE = "com.taylor.ios-agent.fixture"


def cmd(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.PIPE).strip()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--simulator", required=True)
    p.add_argument("--output", type=Path, required=True)
    a = p.parse_args()
    inventory = json.loads(cmd("xcrun", "simctl", "list", "devices", "available", "-j"))
    device = next(d for group in inventory["devices"].values() for d in group if d["udid"] == a.simulator)
    owned_boot = device["state"] == "Shutdown"
    if owned_boot:
        cmd("xcrun", "simctl", "boot", a.simulator)
    try:
        with tempfile.TemporaryDirectory() as temp:
            app = Path(temp) / "Fixture.app"
            app.mkdir()
            info = {"CFBundleIdentifier": BUNDLE, "CFBundleExecutable": "Fixture", "CFBundleName": "Agent Fixture", "CFBundlePackageType": "APPL", "CFBundleVersion": "1", "CFBundleShortVersionString": "1.0", "MinimumOSVersion": "26.5", "UILaunchScreen": {}}
            (app / "Info.plist").write_bytes(plistlib.dumps(info))
            sdk = cmd("xcrun", "--sdk", "iphonesimulator", "--show-sdk-path")
            cmd("xcrun", "--sdk", "iphonesimulator", "clang", "-fobjc-arc", "-fblocks", "-target", "arm64-apple-ios26.5-simulator", "-isysroot", sdk,
                "-framework", "UIKit", "-framework", "Foundation", "-framework", "QuartzCore", "-framework", "CoreGraphics", "-framework", "IOKit", str(ROOT / "tests/Fixture.m"), "-o", str(app / "Fixture"))
            cmd("codesign", "--force", "--sign", "-", str(app))
            cmd("xcrun", "simctl", "install", a.simulator, str(app))
            container = Path(cmd("xcrun", "simctl", "get_app_container", a.simulator, BUNDLE, "data"))
            evidence = container / "Documents/evidence.json"
            evidence.unlink(missing_ok=True)
            cmd("xcrun", "simctl", "launch", a.simulator, BUNDLE)
            end = time.monotonic() + 30
            while not evidence.exists() and time.monotonic() < end:
                time.sleep(0.1)
            if not evidence.exists():
                raise RuntimeError("fixture_did_not_finish")
            result = json.loads(evidence.read_text())
            result.update(scope="synthetic UIKit simulator", simulator=device["name"])
            a.output.write_text(json.dumps(result, indent=2) + "\n")
            passed = result.get("tapCount") == 1 and result.get("holdCount") == 1 and result.get("scrollOffsetY", 0) > 50 and result.get("textMatches") and result.get("cleanup") and result.get("occlusionRejection", {}).get("error") == "hit_target_changed_or_occluded"
            print(json.dumps({"passed": bool(passed), "output": str(a.output.resolve()), "evidence": result}))
            if not passed:
                raise SystemExit(1)
    finally:
        subprocess.run(["xcrun", "simctl", "terminate", a.simulator, BUNDLE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["xcrun", "simctl", "uninstall", a.simulator, BUNDLE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if owned_boot:
            cmd("xcrun", "simctl", "shutdown", a.simulator)


if __name__ == "__main__":
    main()
