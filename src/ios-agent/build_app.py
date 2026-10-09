#!/usr/bin/env python3
"""Explicit local dev build. Does not edit project source or touch XCTest."""
import argparse
import hashlib
import json
import os
import plistlib
from pathlib import Path
import subprocess
import tempfile
import time
from dev_runtime import load_config

ROOT = Path(__file__).resolve().parent


def source_hashes(mobile):
    paths = list((ROOT / "native").glob("*")) + [mobile / "ios/kudos/AppDelegate.mm", mobile / "ios/kudos/Info.plist"]
    return {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.is_file()}


def register_dev_callback(app, log_path):
    # Mutate only the generated opt-in DEV product, never project or Pod
    # configuration. Re-sign with its original local development identity
    # while preserving entitlements; fail closed if identity is unavailable.
    info_path = app / "Info.plist"
    built_info = plistlib.loads(info_path.read_bytes())
    if built_info.get('CFBundleIdentifier') != 'com.dev.kudos.fit':
        raise RuntimeError('dev_callback_product_required')
    with tempfile.TemporaryDirectory(prefix='ios-agent-sign-') as signing:
        with log_path.open('a') as log:
            subprocess.run(['codesign', '-d', '--extract-certificates=' + str(Path(signing) / 'signer-'), str(app)], check=True, stdout=log, stderr=log, timeout=30)
            identity = hashlib.sha1((Path(signing) / 'signer-0').read_bytes()).hexdigest()
            types = built_info.setdefault('CFBundleURLTypes', [])
            if not any('runner-kickoff-dev' in entry.get('CFBundleURLSchemes', []) for entry in types):
                types.append({'CFBundleURLName': 'runner-kickoff-dev', 'CFBundleURLSchemes': ['runner-kickoff-dev']})
            info_path.write_bytes(plistlib.dumps(built_info))
            subprocess.run(['codesign', '--force', '--sign', identity, '--preserve-metadata=identifier,entitlements,requirements,flags,runtime', str(app)], check=True, stdout=log, stderr=log, timeout=30)
            subprocess.run(['codesign', '--verify', '--strict', '--deep', str(app)], check=True, stdout=log, stderr=log, timeout=30)
            signature_verified = True
    persisted_info = plistlib.loads(info_path.read_bytes())
    callback_registered = any("runner-kickoff-dev" in entry.get("CFBundleURLSchemes", []) for entry in persisted_info.get("CFBundleURLTypes", []))
    return callback_registered, signature_verified


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mobile", type=Path, required=True)
    p.add_argument("--udid", required=True, help="Xcode destination device UDID")
    p.add_argument("--derived-data", type=Path, required=True)
    p.add_argument("--log", type=Path, required=True, help="private build log, not transcript output")
    p.add_argument("--metro", action="store_true", help="use normal app Metro URL instead of the embedded bundle")
    p.add_argument("--runtime-config", type=Path, help="private validated tailnet endpoints; embeds an offline fallback")
    a = p.parse_args()
    mobile = a.mobile.resolve()
    if not (mobile / "ios/kudos.xcworkspace").exists():
        raise SystemExit("Kickoff_mobile_workspace_required")
    if a.metro and a.runtime_config:
        raise SystemExit("choose_normal_Metro_or_tailnet_runtime")
    runtime = load_config(a.runtime_config) if a.runtime_config else None
    if runtime and runtime["mobile"] != str(mobile):
        raise SystemExit("runtime_mobile_mismatch")
    headers = '$(inherited) "' + str(ROOT / "native") + '"'
    runtime_snapshot = None
    if runtime:
        generated = a.derived_data.resolve().parent / (a.derived_data.name + '-runtime')
        generated.mkdir(mode=0o700, parents=True, exist_ok=True)
        if generated.stat().st_mode & 0o077:
            raise SystemExit("generated_runtime_directory_not_private")
        runtime_snapshot = generated / 'dev-runtime.json'
        header = generated / 'IOSAgentRuntimeConfig.h'
        for path, content in [(runtime_snapshot, json.dumps(runtime)), (header, '#define IOS_AGENT_METRO_ENDPOINT @' + json.dumps(runtime['metroURL']) + '\n')]:
            if path.exists():
                if path.stat().st_mode & 0o077 or path.read_text() != content:
                    raise SystemExit("generated_runtime_changed_use_fresh_build_directory")
            else:
                with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as file:
                    file.write(content)
        headers += ' "' + str(generated) + '"'
    a.log.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(a.log, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    flags = "$(inherited) -DIOS_AGENT_ENABLED=1"
    if not a.metro:
        flags += " -DIOS_AGENT_EMBEDDED_BUNDLE=1"
    env = {**os.environ, "IOS_AGENT_MOBILE_ROOT": str(mobile), "ENVFILE": ".env.development", "RCT_NO_LAUNCH_PACKAGER": "1", "BUGSNAG_DISABLE_UPLOAD": "1", "BUNDLE_CONFIG": str(ROOT / "native/metro.cjs")}
    env.pop("SKIP_BUNDLING", None)
    env.pop("IOS_AGENT_RUNTIME_CONFIG", None)
    if runtime_snapshot:
        env["IOS_AGENT_RUNTIME_CONFIG"] = str(runtime_snapshot)
    start = time.monotonic()
    before = source_hashes(mobile)
    with os.fdopen(fd, "w") as log:
        run = subprocess.run(["xcodebuild", "-workspace", str(mobile / "ios/kudos.xcworkspace"), "-scheme", "kudos development", "-configuration", "Debug", "-destination", "id=" + a.udid, "-derivedDataPath", str(a.derived_data.resolve()),
                              "OTHER_CFLAGS=" + flags, "OTHER_CPLUSPLUSFLAGS=" + flags, "HEADER_SEARCH_PATHS=" + headers, "OTHER_LDFLAGS=$(inherited) -framework IOKit", "build"], env=env, stdout=log, stderr=subprocess.STDOUT)
    after = source_hashes(mobile)
    changed = before != after
    products = a.derived_data.resolve() / "Build/Products/Debug-iphoneos"
    matches = [app for app in products.glob("*.app") if (app / "Info.plist").exists() and plistlib.loads((app / "Info.plist").read_bytes()).get("CFBundleIdentifier") == "com.dev.kudos.fit"]
    product = str(matches[0]) if len(matches) == 1 else None
    sdk_present = False
    if product and run.returncode == 0:
        app = matches[0]
        executable = plistlib.loads((app / "Info.plist").read_bytes())["CFBundleExecutable"]
        binaries = [app / executable, *app.glob("*.debug.dylib")]
        for binary in binaries:
            symbols = subprocess.run(["nm", str(binary)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True).stdout
            sdk_present |= "OBJC_CLASS_$_IOSAgent" in symbols and "OBJC_CLASS_$_IOSAgentBridge" in symbols
    callback_registered = False
    signature_verified = False
    if product and run.returncode == 0 and not changed and sdk_present:
        callback_registered, signature_verified = register_dev_callback(Path(product), a.log)
    evidence = {"exit": run.returncode, "seconds": round(time.monotonic() - start, 1), "product": product, "agentBinaryVerified": sdk_present, "devCallbackRegistered": callback_registered, "signatureVerified": signature_verified, "sourceEdited": False, "xctestStarted": False, "sourceChangedDuringBuild": changed, "runtimeConfigHash": hashlib.sha256(runtime_snapshot.read_bytes()).hexdigest() if runtime_snapshot else None, "embeddedFallback": not a.metro, "sources": after}
    (a.derived_data / "ios-agent-build.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps({k: v for k, v in evidence.items() if k != "sources"}))
    raise SystemExit(run.returncode or int(changed or not product or not sdk_present or not callback_registered or not signature_verified))


if __name__ == "__main__":
    main()
