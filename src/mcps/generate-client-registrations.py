#!/usr/bin/env python3
"""Generate client-registrations.json from the fleet manifests (mcps/*/mcp.json).

The manifests are the one source of truth for where a fleet service is
registered: each key under "harnesses" (claude, claude-desktop, codex) is a
registration, and its object holds that client's settings. A service with
"profiles" registers once per profile as <id>-<profile> ("default" as <id>).
A harness may set "names" ({profile: name}) to keep an established name;
Codex's Gmail entries use underscores. removed_servers is kept from the
existing file: it lists names that must stay unregistered.

  python3 generate-client-registrations.py           # write the file
  python3 generate-client-registrations.py --check   # exit 1 if it would change
"""
import argparse
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
MCPS = REPO / "mcps"
OUT = HERE / "client-registrations.json"
RUN = str(MCPS / "_shared/bin/run")
HOSTS = ("codex", "claude", "claude-desktop")
RESERVED = {"names"}


def registrations():
    out = {host: {} for host in HOSTS}
    for path in sorted(MCPS.glob("*/mcp.json")):
        if path.parent.name.startswith(("_", ".")):
            continue
        manifest = json.loads(path.read_text())
        sid = manifest["id"]
        profiles = list((manifest.get("profiles") or {"default": {}}).keys())
        for host, settings in (manifest.get("harnesses") or {}).items():
            if host not in out:
                continue  # registered by another tool (opencode)
            names = settings.get("names", {})
            for profile in profiles:
                name = names.get(profile) or (sid if profile == "default" else f"{sid}-{profile}")
                entry = {"command": RUN, "args": [sid] if profile == "default" else [sid, profile]}
                if host == "claude":  # the shape `claude mcp add` writes
                    entry = {"type": "stdio", **entry, "env": {}}
                entry.update({k: v for k, v in settings.items() if k not in RESERVED})
                override = ((manifest.get("profiles") or {}).get(profile) or {}).get("harnesses", {}).get(host, {})
                entry.update({k: v for k, v in override.items() if k not in RESERVED})
                if name in out[host]:
                    raise SystemExit(f"{host}/{name}: registered by two services")
                out[host][name] = entry
    return out


def build():
    current = json.loads(OUT.read_text()) if OUT.exists() else {}
    data = {
        "version": 2,
        "scope": "Generated from mcps/*/mcp.json by generate-client-registrations.py; edit the manifests, not this file. External host entries are necessary triggers. Package lock and installed upstream runtimes live in dotfiles/src/mcps/runtime.",
        **registrations(),
        "removed_servers": current.get("removed_servers", {}),
    }
    return json.dumps(data, indent=1) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = build()
    if args.check:
        if not OUT.exists() or OUT.read_text() != text:
            print("client-registrations.json is out of date with the manifests; run generate-client-registrations.py", file=sys.stderr)
            return 1
        print("client-registrations.json matches the manifests")
        return 0
    OUT.write_text(text)
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
