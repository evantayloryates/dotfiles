#!/usr/bin/env python3
"""Install this personal service, preserving existing enrollment and Serve config."""
import argparse
import json
import os
from pathlib import Path
import plistlib
import secrets
import shutil
import subprocess
import sys
import time
from urllib.parse import urlparse
from service import STATE
from source_hash import worker_source_hash
from cli import request

ROOT = Path(__file__).resolve().parent
LABEL = "com.taylor.ios-agent"
TAILSCALE = "/Applications/Tailscale.app/Contents/MacOS/Tailscale"


def tailscale(*args):
    env = {**os.environ, "TAILSCALE_BE_CLI": "1"}
    run = subprocess.run([TAILSCALE, *args], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    if run.returncode:
        raise RuntimeError("tailscale_cli_failed")
    return json.loads(run.stdout)


def write_private(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(value, f)


def wait_ready(state, expected_hash, timeout=8):
    """Registration alone is not readiness; verify the actual responding worker."""
    deadline = time.monotonic() + timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError("registered_worker_not_ready")
        try:
            status = request({"op": "status"}, state, timeout=min(2, remaining))
        except (OSError, ValueError, RuntimeError):
            if time.monotonic() >= deadline:
                raise RuntimeError("registered_worker_not_ready")
            time.sleep(0.1)
            continue
        if status.get("sourceHash") != expected_hash:
            raise RuntimeError("running_worker_source_differs; use_--restart_at_idle")
        return


def wait_retired(state, domain, timeout=5):
    """Both the socket and launchd registration must retire before bootstrap."""
    deadline = time.monotonic() + timeout
    while True:
        registered = subprocess.run(
            ["launchctl", "print", f"{domain}/{LABEL}"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=2,
        ).returncode == 0
        if not registered and not (state / "control.sock").exists():
            return
        if time.monotonic() >= deadline:
            raise RuntimeError("old_worker_did_not_finish_shutdown")
        time.sleep(0.05)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--endpoint", required=True)
    p.add_argument("--provision-device", help="CoreDevice identifier; one-time provisioning need not be USB")
    p.add_argument("--restart", action="store_true", help="explicitly replace this service; drops any active lease")
    a = p.parse_args()
    status = tailscale("status", "--json")
    user = status.get("User", {}).get(str(status.get("Self", {}).get("UserID")), {})
    if status.get("BackendState") != "Running" or user.get("LoginName") != "evantayloryates@gmail.com":
        raise SystemExit("existing_personal_tailnet_required")
    dns = status["Self"]["DNSName"].rstrip(".")
    url = urlparse(a.endpoint)
    if url.scheme != "https" or url.hostname != dns or url.path != "/v1/device" or url.query or url.username:
        raise SystemExit("endpoint_must_be_this_Macs_tailnet_HTTPS_device_route")
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(STATE, 0o700)
    config_path = STATE / "config.json"
    if config_path.exists():
        if config_path.stat().st_mode & 0o077:
            raise SystemExit("config_permissions_not_private")
        config = json.loads(config_path.read_text())
        if config.get("endpoint") != a.endpoint:
            raise SystemExit("existing_endpoint_differs; explicit_migration_required")
    else:
        config = {"bundle": "com.dev.kudos.fit", "device": secrets.token_hex(16), "token": secrets.token_urlsafe(48), "endpoint": a.endpoint, "port": 19403}
        write_private(config_path, config)
    node = shutil.which("node")
    if not node or not (ROOT / "react/node_modules/agent-react-devtools").exists():
        raise SystemExit("Node_and_pinned_React_provider_required; run_npm_ci_in_src/ios-agent/react")
    if config.get("node") != node:
        config["node"] = node
        temporary = STATE / "config.next.json"
        write_private(temporary, config)
        temporary.replace(config_path)
    device_path = STATE / "ios-agent.json"
    if not device_path.exists():
        write_private(device_path, {k: config[k] for k in ("device", "token", "endpoint")})
    if a.provision_device:
        subprocess.run(["xcrun", "devicectl", "device", "copy", "to", "--device", a.provision_device,
                        "--source", str(device_path), "--destination", "Documents/ios-agent.json",
                        "--domain-type", "appDataContainer", "--domain-identifier", config["bundle"], "--quiet"], check=True, timeout=60)
    # Service configuration only; it does not change Tailscale sharing or enroll a new account.
    plist = ROOT / "com.taylor.ios-agent.plist"
    target = Path.home() / "Library/LaunchAgents" / plist.name
    target.parent.mkdir(parents=True, exist_ok=True)
    desired = plist.read_bytes()
    unchanged = target.exists() and target.read_bytes() == desired
    if target.exists() and not unchanged and not a.restart:
        raise SystemExit("existing_launch_configuration_differs; use_--restart_at_idle")
    if not unchanged:
        plist.write_bytes(desired)
    if not target.is_symlink():
        target.unlink(missing_ok=True)
        target.symlink_to(plist)
    domain = f"gui/{os.getuid()}"
    active = subprocess.run(["launchctl", "print", f"{domain}/{LABEL}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
    if active and a.restart:
        subprocess.run(["launchctl", "bootout", f"{domain}/{LABEL}"], check=True)
        # Socket removal precedes launchd's registration retirement. Do not
        # confuse the still-retiring old job with a newly bootstrapped worker.
        wait_retired(STATE, domain)
        active = False
    if not active:
        # launchd may still be retiring a booted-out job after its socket is gone.
        # Retry only this scoped registration; never restart unrelated jobs or use root.
        deadline = time.monotonic() + 5
        while True:
            registered = subprocess.run(["launchctl", "bootstrap", domain, str(target)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            if registered.returncode == 0:
                break
            if registered.returncode != 5 or time.monotonic() >= deadline:
                raise RuntimeError("launch_registration_failed")
            time.sleep(0.2)
    wait_ready(STATE, worker_source_hash())
    print(json.dumps({"installed": True, "workerReady": True, "sourceVerified": True, "restarted": a.restart, "provisioned": bool(a.provision_device), "tailnetAccount": user["LoginName"], "source": str(ROOT)}))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError):
        raise SystemExit("installation_failed; inspect sanitized service status")
