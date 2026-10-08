#!/usr/bin/env python3
"""Compile/run a synthetic UIKit fixture, never XCTest or a real app account."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import tempfile
import time

ROOT = Path(__file__).parents[1]
BUNDLE = "com.taylor.ios-agent.fixture"


def cmd(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.PIPE, timeout=90).strip()


def installed_apps(simulator):
    # simctl prints an OpenStep property list. Registry membership is authoritative;
    # get_app_container can return a cached container after an uninstall.
    raw = subprocess.check_output(["xcrun", "simctl", "listapps", simulator], stderr=subprocess.PIPE, timeout=60)
    return json.loads(subprocess.check_output(["plutil", "-convert", "json", "-o", "-", "--", "-"], input=raw, stderr=subprocess.PIPE, timeout=30))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--simulator", required=True)
    p.add_argument("--output", type=Path, required=True)
    a = p.parse_args()
    a.output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if a.output.exists():
        raise FileExistsError("fixture_output_already_exists")
    native_sources = [ROOT / "tests/Fixture.m", ROOT / "tests/run_fixture.py", *sorted((ROOT / "native").glob("*.inc"))]
    source_hashes = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in native_sources}
    inventory = json.loads(cmd("xcrun", "simctl", "list", "devices", "available", "-j"))
    device = next(d for group in inventory["devices"].values() for d in group if d["udid"] == a.simulator)
    owned_boot = device["state"] == "Shutdown"
    if owned_boot:
        cmd("xcrun", "simctl", "boot", a.simulator)
    installed = False
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
            if BUNDLE in installed_apps(a.simulator):
                raise RuntimeError("fixture_already_installed_refusing_collision")
            executable_hash = hashlib.sha256((app / "Fixture").read_bytes()).hexdigest()
            cmd("xcrun", "simctl", "install", a.simulator, str(app))
            installed = True
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
            changed = any(hashlib.sha256(path.read_bytes()).hexdigest() != source_hashes[str(path.relative_to(ROOT))] for path in native_sources)
            result.update(scope="synthetic UIKit simulator", simulator=device["name"], sourceHashes=source_hashes, sourceChangedDuringRun=changed, fixtureExecutableHash=executable_hash, observedAtUTC=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
            errors = {
                "occlusionRejection": "hit_target_changed_or_occluded",
                "staleSnapshotRejection": "fresh_snapshot_and_point_required",
                "geometryRejection": "target_geometry_changed",
                "supersededSnapshotRejection": "fresh_snapshot_and_point_required",
                "removedTargetRejection": "target_geometry_changed",
                "outsideAppRejection": "outside_app",
                "duplicateRejection": "duplicate_command",
                "epochRejection": "lease_or_command_expired",
                "unfocusedTextRejection": "focused_text_input_required",
                "modalRejection": "hit_target_changed_or_occluded",
                "secondaryWindowRejection": "hit_target_changed_or_occluded",
                "inFlightRejection": "input_in_flight",
                "cancelledOldGesture": "input_cancelled_or_expired",
            }
            booleans = ["textMatches", "cleanup", "oldCallbackPreservesNewOwner", "independentNativeExpiry", "wifiCallbackFencing", "glowPreservesLayoutAndKey", "nestedRecognizerPrecedence", "panDefeatsLongPress", "nativeTapFocus", "focusSwitchAndUnicode", "cancelledTouchObserved", "secondaryWindowNoUnderlyingTouch"]
            gates = {key: result.get(key, {}).get("error") == expected for key, expected in errors.items()}
            gates.update({key: result.get(key) in (True, 1) for key in booleans})
            gates.update(tapCount=result.get("tapCount") == 1, holdCount=result.get("holdCount") == 1, scrollOffsetY=result.get("scrollOffsetY", 0) > 50, nativeInputRuntime=result.get("capabilities", {}).get("nativeInputRuntime") is True, unchangedSources=not changed, noXCTest=result.get("xctestStarted") is False)
            result["gates"] = gates
            passed = all(gates.values())
            result["passed"] = passed
            with os.fdopen(os.open(a.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as stream:
                stream.write(json.dumps(result, indent=2) + "\n")
            print(json.dumps({"passed": passed, "output": str(a.output.resolve()), "gateCount": len(gates), "failedGates": [key for key, value in gates.items() if not value], "scope": result["scope"], "sourceChangedDuringRun": changed}))
            if not passed:
                raise SystemExit(1)
    finally:
        try:
            if installed:
                try:
                    subprocess.run(["xcrun", "simctl", "terminate", a.simulator, BUNDLE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
                finally:
                    cmd("xcrun", "simctl", "uninstall", a.simulator, BUNDLE)
                    cleanup_end = time.monotonic() + 10
                    while BUNDLE in installed_apps(a.simulator):
                        if time.monotonic() >= cleanup_end:
                            raise RuntimeError("fixture_uninstall_not_verified")
                        time.sleep(0.2)
        finally:
            if owned_boot:
                cmd("xcrun", "simctl", "shutdown", a.simulator)


if __name__ == "__main__":
    main()
