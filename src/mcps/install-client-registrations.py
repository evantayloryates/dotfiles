#!/usr/bin/env python3
"""Apply only fleet-owned MCP fields; preserve private host state and other servers."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import tomllib

ROOT = Path(__file__).resolve().parent

def write_private(path, text):
    path = path.resolve()  # Preserve the installed invocation symlink.
    fd, name = tempfile.mkstemp(prefix=".mcp-config-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w") as stream:
            stream.write(text)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    manifest = json.loads((ROOT / "client-registrations.json").read_text())
    codex_path = Path.home() / ".codex/config.toml"
    claude_path = Path.home() / ".claude.json"
    original = codex_path.read_text()
    sections = re.split(r"(?m)(?=^\[)", original)
    found = set()
    for i, section in enumerate(sections):
        match = re.match(r'\[mcp_servers\.(?:"([^"\n]+)"|([^]\n]+))\]\n', section)
        if not match:
            continue
        name = match.group(1) or match.group(2)
        if name in manifest.get("removed_servers", {}).get("codex", []):
            sections[i] = ""
            continue
        desired = manifest["codex"].get(name)
        if desired is None:
            continue
        found.add(name)
        header, body = section.split("\n", 1)
        for key, value in desired.items():
            line = key + " = " + json.dumps(value)
            pattern = r"(?m)^" + re.escape(key) + r"\s*=.*$"
            if re.search(pattern, body):
                body = re.sub(pattern, lambda _: line, body)
            else:
                body = line + "\n" + body
        sections[i] = header + "\n" + body
    for name, desired in manifest["codex"].items():
        if name not in found:
            sections.append("\n[mcp_servers." + json.dumps(name) + "]\n" + "\n".join(k + " = " + json.dumps(v) for k, v in desired.items()) + "\n")
    updated = "".join(sections)
    parsed = tomllib.loads(updated)
    before = tomllib.loads(original)
    for name, config in before.get("mcp_servers", {}).items():
        if name not in manifest["codex"] and name not in manifest.get("removed_servers", {}).get("codex", []):
            assert parsed["mcp_servers"][name] == config, "Unmanaged server changed"
    for key, value in before.items():
        if key != "mcp_servers":
            assert parsed[key] == value, "Unrelated Codex setting changed"
    claude = json.loads(claude_path.read_text())
    servers = claude.setdefault("mcpServers", {})
    for name in manifest.get("removed_servers", {}).get("claude", []):
        servers.pop(name, None)
        for project in claude.get("projects", {}).values():
            project.get("mcpServers", {}).pop(name, None)
    for name, desired in manifest["claude"].items():
        servers.setdefault(name, {}).update(desired)
    desktop_path = Path.home() / "Library/Application Support/Claude/claude_desktop_config.json"
    desktop = json.loads(desktop_path.read_text()) if desktop_path.exists() else {}
    original_desktop = json.dumps(desktop, sort_keys=True)
    desktop_servers = desktop.setdefault("mcpServers", {})
    for name in manifest.get("removed_servers", {}).get("claude", []):
        desktop_servers.pop(name, None)
    # Desktop has an independent shared MCP pool. Manage only Gmail here.
    for name, desired in manifest["claude"].items():
        if name.startswith("gmail-"):
            desktop_servers.setdefault(name, {}).update(desired)
    if args.apply and json.dumps(desktop, sort_keys=True) != original_desktop:
        running = subprocess.run(["/usr/bin/pgrep", "-x", "Claude"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if running.returncode == 0:
            raise SystemExit("Claude desktop is running and caches MCP configuration. Quit it at a safe point before --apply; disk-only changes can be overwritten. No files changed.")
        if running.returncode not in (0, 1):
            raise SystemExit("Cannot verify Claude desktop is stopped; no files changed.")
    if args.apply:
        desktop_path.parent.mkdir(parents=True, exist_ok=True)
        write_private(codex_path, updated)
        write_private(claude_path, json.dumps(claude, indent=2) + "\n")
        write_private(desktop_path, json.dumps(desktop, indent=2) + "\n")
        print("Applied fleet registrations from dotfiles; private host state preserved")
    else:
        print("Validated installation plan; pass --apply to install")

if __name__ == "__main__":
    main()
