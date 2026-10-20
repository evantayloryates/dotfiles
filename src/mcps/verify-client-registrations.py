#!/usr/bin/env python3
"""Check the app-owned MCP registrations against the dotfiles inventory."""

import json
from pathlib import Path
import subprocess
import sys
import tomllib


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = Path(__file__).with_name("client-registrations.json")
HOME = Path.home()


def main() -> int:
    expected = json.loads(MANIFEST.read_text())
    codex = tomllib.loads((HOME / ".codex/config.toml").read_text())
    claude = json.loads((HOME / ".claude.json").read_text())
    actual = {"codex": codex.get("mcp_servers", {}), "claude": claude.get("mcpServers", {})}
    errors = []
    desktop = json.loads((HOME / "Library/Application Support/Claude/claude_desktop_config.json").read_text()).get("mcpServers", {})
    for name, config in expected.get("claude-desktop", {}).items():
        if any(desktop.get(name, {}).get(k) != v for k, v in config.items()):
            errors.append(f"claude-desktop/{name}: registration differs")
    for name in expected.get("removed_servers", {}).get("claude", []):
        if name in desktop:
            errors.append(f"claude-desktop/{name}: removed account still registered")
    for host in ("codex", "claude"):
        for name, config in expected[host].items():
            installed = actual[host].get(name)
            if installed is None:
                errors.append(f"{host}/{name}: missing")
                continue
            for key, value in config.items():
                if installed.get(key) != value:
                    errors.append(f"{host}/{name}: {key} differs")
            launcher = Path(config["command"])
            if not launcher.exists() or not launcher.resolve().is_relative_to(ROOT.resolve()):
                errors.append(f"{host}/{name}: launcher not in dotfiles")
    for host, names in expected.get("removed_servers", {}).items():
        for name in names:
            if name in actual[host]:
                errors.append(f"{host}/{name}: removed account still registered")
    if "playwright" in actual["codex"] or "playwright" in actual["claude"]:
        errors.append("Playwright MCP registration remains in global config")
    for project, settings in claude.get("projects", {}).items():
        if "playwright" in settings.get("mcpServers", {}):
            errors.append(f"Playwright MCP registration remains in project {project}")
    settings_path = HOME / ".claude/settings.json"
    if settings_path.exists():
        settings = json.loads(settings_path.read_text())
        if any("playwright" in name.lower() and enabled for name, enabled in settings.get("enabledPlugins", {}).items()):
            errors.append("Claude Playwright plugin remains enabled")
    # Claude desktop's config is app-owned: the app rewrites it (preferences,
    # paths), replacing any symlink, so it is checked by content above.
    for relative, target in [(".codex/config.toml", "src/mcps/host-config/codex.toml"), (".claude.json", "src/mcps/host-config/claude.json"), ("Library/LaunchAgents/com.taylor.ios-agent.plist", "mcps/ios-agent/src/com.taylor.ios-agent.plist"), ("Library/LaunchAgents/com.taylor.ios-agent.metro.plist", "mcps/ios-agent/src/com.taylor.ios-agent.metro.plist")]:
        trigger = HOME / relative
        if not trigger.is_symlink() or trigger.resolve() != (ROOT / target).resolve():
            errors.append(f"{relative}: canonical dotfiles symlink missing")
    if not (ROOT / "mcps/gmail/src/gmail-fork/index.js").exists():
        errors.append("Gmail fork source missing")
    packages = json.loads((MANIFEST.parent / "runtime/package.json").read_text())["dependencies"]
    for name, version in packages.items():
        package_path = MANIFEST.parent / "runtime/node_modules" / name / "package.json"
        if not package_path.exists() or json.loads(package_path.read_text()).get("version") != version:
            errors.append(f"{name}: local runtime missing or version differs")
    generated = subprocess.run([sys.executable, str(MANIFEST.with_name("generate-client-registrations.py")), "--check"], capture_output=True, text=True)
    if generated.returncode != 0:
        errors.append("client-registrations.json is out of date with mcps/*/mcp.json (run generate-client-registrations.py)")
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print("MCP client registrations match dotfiles; Playwright MCP config is absent")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
