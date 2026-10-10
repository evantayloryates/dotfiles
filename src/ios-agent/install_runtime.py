#!/usr/bin/env python3
"""Install the opt-in Metro service and scoped, private Tailscale Serve routes."""
import argparse
import json
import os
from pathlib import Path
import plistlib
import re
import socket
import subprocess
import time
import urllib.request

from dev_runtime import METRO_PORT, PUBLIC_PORTS, validate_config
from install import tailscale, write_private
from service import STATE

ROOT = Path(__file__).resolve().parent
LABEL = "com.taylor.ios-agent.metro"
TAILSCALE = "/Applications/Tailscale.app/Contents/MacOS/Tailscale"


def warm_bundle(config):
    # Compile the real device graph before reporting startup ready. Metro's
    # /status alone is true even while a cold bundle takes a minute to compile.
    query = "index.bundle?platform=ios&dev=true&lazy=true&minify=false&inlineSourceMap=false&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&app=com.dev.kudos.fit"
    needles = {key: config[key].encode() for key in ("metroURL", "graphqlURL", "webURL")}
    found = set(); previous = b""; size = 0; deadline = time.monotonic() + 120
    with urllib.request.urlopen(f"http://127.0.0.1:{METRO_PORT}/" + query, timeout=90) as response:
        if response.status != 200 or response.headers.get_content_type() != "application/javascript":
            raise ValueError("Metro_device_bundle_not_ready")
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > 128 * 1024 * 1024 or time.monotonic() > deadline:
                raise ValueError("Metro_device_bundle_limit")
            window = previous + chunk
            found.update(key for key, value in needles.items() if value in window)
            previous = window[-512:]
    if size < 1000 or found != set(needles):
        raise ValueError("Metro_runtime_adapter_missing")
    return size


def probe(url, graphql=False):
    body = json.dumps({"query": "query IOSAgentReadiness { __typename }"}).encode() if graphql else None
    request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"} if graphql else {})
    with urllib.request.urlopen(request, timeout=5) as response:
        value = response.read(32768)
        if graphql:
            data = json.loads(value)
            return response.status == 200 and not data.get("errors") and data.get("data", {}).get("__typename") == "Query"
        return response.status == 200


def serve_compatible(config, current):
    host = config["metroURL"].split("/")[2].split(":")[0]
    targets = {10444: METRO_PORT, 10445: 4000, 10446: 3000}
    if any(current.get("AllowFunnel", {}).values()):
        raise ValueError("existing_Funnel_configuration_requires_review")
    for port, target in targets.items():
        key = f"{host}:{port}"
        web = current.get("Web", {}).get(key)
        tcp = current.get("TCP", {}).get(str(port))
        if (web is not None or tcp is not None) and (web != {"Handlers": {"/": {"Proxy": f"http://127.0.0.1:{target}"}}} or tcp != {"HTTPS": True}):
            raise ValueError("Serve_port_already_owned_by_another_route")
    return targets


def route_names(mobile):
    names = set()
    # Static code enums only. Never infer route names from params or app records.
    pattern = re.compile(r'<\w+\.Screen\s[^>]*?\bname\s*=\s*[\'\"]([A-Za-z_][A-Za-z0-9_]{0,63})[\'\"]', re.S)
    identifier_pattern = re.compile(r'<\w+\.Screen\s[^>]*?\bname\s*=\s*\{([A-Za-z_][A-Za-z0-9_]*)\}', re.S)
    for file in (mobile / "src/navigators").rglob("*"):
        if file.suffix in {".js", ".jsx", ".ts", ".tsx"} and "__tests__" not in file.parts:
            source = file.read_text()
            names.update(pattern.findall(source))
            for identifier in identifier_pattern.findall(source):
                # Only a same-file literal declaration used by Screen.name.
                # Computed names and imported/dynamic values remain unknown.
                declaration = re.search(r'\bconst\s+' + re.escape(identifier) + r'\s*=\s*[\'\"]([A-Za-z_][A-Za-z0-9_]{0,63})[\'\"]', source)
                if declaration:
                    names.add(declaration.group(1))
    return sorted(names)


def verify_local_backend(container):
    # Read process provenance inside the existing container. Secrets never leave
    # this short consumer; no database connections or environment dumps occur.
    script = r'''
const fs = require('fs');
const matches = fs.readdirSync('/proc').filter(p => /^\d+$/.test(p)).flatMap(p => {
  try {
    const argv = fs.readFileSync(`/proc/${p}/cmdline`, 'utf8').split('\0');
    if (!argv.some(a => /(?:^|\/)\.webpack\/server\.development\.js$/.test(a))) return [];
    const env = Object.fromEntries(fs.readFileSync(`/proc/${p}/environ`, 'utf8').split('\0').filter(Boolean).map(s => {const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
    const u = new URL(env.DATABASE_URL);
    return [{local: env.APP_ENV === 'development' && env.KICKOFF_LOCAL_DATABASE_ONLY === '1' && env.KICKOFF_SKIP_REMOTE_SECRETS === '1' && env.DB_DISABLE_SSL === 'true' && u.protocol === 'mysql:' && u.hostname === 'db' && (!u.port || u.port === '3306') && u.pathname === '/kudos_development' && !u.search && (!env.MODIFIED_URL || env.MODIFIED_URL === env.DATABASE_URL) && fs.readlinkSync(`/proc/${p}/cwd`) === '/workspaces/kickoff/node'}];
  } catch { return []; }
});
// The guarded offline server can fork workers. Every matching worker must
// retain the exact local contract; multiple safe workers are not ambiguity.
process.stdout.write(JSON.stringify({verified: matches.length > 0 && matches.every(p => p.local)}));
'''
    run = subprocess.run(["docker", "exec", "-i", container, "node", "-"], input=script.encode(), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10)
    if run.returncode or json.loads(run.stdout).get("verified") is not True:
        raise ValueError("local_guarded_backend_process_required")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mobile", type=Path, required=True)
    p.add_argument("--node", type=Path, default=Path("/opt/homebrew/opt/node@22/bin/node"))
    p.add_argument("--restart", action="store_true", help="replace this scoped Metro job at an explicitly chosen idle point")
    p.add_argument("--backend-container", default="default-ki-e3ee9-dev-1")
    a = p.parse_args()
    status = tailscale("status", "--json")
    user = status.get("User", {}).get(str(status.get("Self", {}).get("UserID")), {})
    if status.get("BackendState") != "Running" or user.get("LoginName") != "evantayloryates@gmail.com":
        raise ValueError("existing_personal_tailnet_required")
    host = status["Self"]["DNSName"].rstrip(".")
    config = validate_config({"version": 1, "mobile": str(a.mobile), "node": str(a.node),
        "metroURL": f"https://{host}:10444/", "graphqlURL": f"https://{host}:10445/development/graphql",
        "webURL": f"https://{host}:10446/", "routeNames": route_names(a.mobile.resolve())})
    verify_local_backend(a.backend_container)
    if not probe("http://127.0.0.1:4000/development/graphql", graphql=True) or not probe("http://127.0.0.1:3000/sign-in"):
        raise ValueError("existing_local_GraphQL_and_web_must_be_ready")
    # HTTP readiness and local process provenance are independently checked.
    targets = serve_compatible(config, tailscale("serve", "status", "--json"))
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    config_path = STATE / "dev-runtime.json"
    if config_path.exists():
        if config_path.stat().st_mode & 0o077:
            raise ValueError("existing_runtime_config_not_private")
        if json.loads(config_path.read_text()) != config and not a.restart:
            raise ValueError("runtime_configuration_changed_restart_required")
    target = Path.home() / "Library/LaunchAgents" / (LABEL + ".plist")
    domain = f"gui/{os.getuid()}"
    active = subprocess.run(["launchctl", "print", f"{domain}/{LABEL}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
    if active and not target.exists():
        raise ValueError("active_Metro_job_has_no_known_plist")
    desired = {"Label": LABEL, "ProgramArguments": [config["node"], str(a.mobile.resolve() / "node_modules/react-native/cli.js"), "start", "--host", "127.0.0.1", "--port", str(METRO_PORT), "--config", str(ROOT / "native/metro.cjs"), "--max-workers", "2", "--no-interactive"],
        "WorkingDirectory": config["mobile"], "EnvironmentVariables": {"IOS_AGENT_MOBILE_ROOT": config["mobile"], "IOS_AGENT_RUNTIME_CONFIG": str(config_path), "ENVFILE": ".env.development"},
        "RunAtLoad": True, "KeepAlive": True, "ThrottleInterval": 5, "ExitTimeOut": 5,
        "StandardOutPath": "/dev/null", "StandardErrorPath": "/dev/null"}
    if active and plistlib.loads(target.read_bytes()) != desired and not a.restart:
        raise ValueError("active_Metro_configuration_differs_restart_required")
    if active and a.restart:
        subprocess.run(["launchctl", "bootout", f"{domain}/{LABEL}"], check=True)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            with socket.socket() as test:
                if test.connect_ex(("127.0.0.1", METRO_PORT)) != 0:
                    break
            time.sleep(.1)
        active = False
    if not active:
        with socket.socket() as test:
            if test.connect_ex(("127.0.0.1", METRO_PORT)) == 0:
                raise ValueError("Metro_port_in_use_not_overwritten")
    temporary = STATE / "dev-runtime.next.json"
    write_private(temporary, config); temporary.replace(config_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    source_plist = ROOT / (LABEL + ".plist")
    source_plist.write_bytes(plistlib.dumps(desired))
    if not target.is_symlink() or target.resolve() != source_plist.resolve():
        target.unlink(missing_ok=True)
        target.symlink_to(source_plist)
    if not active:
        subprocess.run(["launchctl", "bootstrap", domain, str(target)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.monotonic() + 30
    while True:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{METRO_PORT}/status", timeout=2) as response:
                ready = response.read(64) == b"packager-status:running"
            if ready:
                break
        except OSError:
            pass
        if time.monotonic() >= deadline:
            raise ValueError("Metro_readiness_failed_job_retained_for_diagnosis")
        time.sleep(.2)
    bundle_bytes = warm_bundle(config)
    for port, target_port in targets.items():
        subprocess.run([TAILSCALE, "serve", "--bg", f"--https={port}", f"http://127.0.0.1:{target_port}"],
            env={**os.environ, "TAILSCALE_BE_CLI": "1"}, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
    verified = tailscale("serve", "status", "--json")
    serve_compatible(config, verified)
    if not all(f"{host}:{port}" in verified.get("Web", {}) for port in targets):
        raise ValueError("Serve_configuration_not_persisted")
    print(json.dumps({"installed": True, "metroReady": True, "deviceBundleReady": True, "bundleBytes": bundle_bytes, "privateServeVerified": True, "Funnel": False, "config": str(config_path)}))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        raise SystemExit(str(error) if isinstance(error, ValueError) else "runtime_installation_failed")
