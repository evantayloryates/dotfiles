#!/usr/bin/env python3
"""sg-health: is the security-guidance commit review actually working?

    sg-health [--days N] [--json]   report: outcomes, failures, findings, unreviewed commits
    sg-health install               route commit/push reviews through the tap (tap.py)
    sg-health uninstall             undo install
    sg-health status                is the tap installed, and does it match the plugin?

Exit code of the report: 0 healthy, 1 failures or unreviewed commits found.
See README.md in this folder.
"""
import argparse
import json
import shutil
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sglib  # noqa: E402

SETTINGS = sglib.HOME / ".claude" / "settings.json"
TAP = sglib.HOME / "dotfiles" / "src" / "security-review" / "tap.py"
TAP_COMMAND = f"python3 {TAP}"
MARKER = sglib.HEALTH_DIR / "installed.json"


# ------------------------------------------------------------------ install

def plugin_entries(hook):
    """The plugin's asyncRewake PostToolUse[Bash] entries: commit and push reviews."""
    data = json.loads((hook.parent / "hooks.json").read_text())["hooks"]
    out = []
    for group in data.get("PostToolUse", []):
        if group.get("matcher") != "Bash":
            continue
        for h in group["hooks"]:
            if h.get("asyncRewake") and "security_reminder_hook.py" in h.get("command", ""):
                out.append(h)
    return out


def tap_entries(settings):
    return [h for g in settings.get("hooks", {}).get("PostToolUse", []) for h in g.get("hooks", []) if str(TAP) in h.get("command", "")]


def load_settings():
    return json.loads(SETTINGS.read_text()) if SETTINGS.exists() else {}


def save_settings(s):
    backup = SETTINGS.with_name(f"settings.json.bak-sg-health-{time.strftime('%Y%m%d-%H%M%S')}-{time.time_ns() % 1_000_000:06d}")
    if SETTINGS.exists():
        shutil.copy2(SETTINGS, backup)
    tmp = SETTINGS.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(s, indent=2) + "\n")
    tmp.replace(SETTINGS)
    return backup


REWAKE_MESSAGE = ("Background security review — address or acknowledge the findings below, then continue with "
                  "the user's original request or continue waiting for their reply:")


def install():
    hook = sglib.find_plugin_hook()
    if hook is None:
        sys.exit("sg-health: security-guidance plugin not installed; nothing to tap")
    s = load_settings()
    # One entry, no `if`: Claude Code ignores `if` on user-settings hooks, so
    # mirroring the plugin's seven entries ran the tap seven times on every
    # Bash call. The tap filters commands itself (sglib.REVIEW_TRIGGER).
    entry = {"type": "command", "command": TAP_COMMAND, "asyncRewake": True,
             "rewakeMessage": REWAKE_MESSAGE, "rewakeSummary": "Security review found issues"}
    groups = [g for g in s.get("hooks", {}).get("PostToolUse", []) if not any(str(TAP) in h.get("command", "") for h in g.get("hooks", []))]
    groups.append({"matcher": "Bash", "hooks": [entry]})
    s.setdefault("hooks", {})["PostToolUse"] = groups
    env = s.setdefault("env", {})
    previous = env.get("ENABLE_COMMIT_REVIEW")
    # The plugin's own commit/push review would run alongside the tap; its
    # documented kill switch turns that copy off (the tap turns it back on
    # for its own run).
    env["ENABLE_COMMIT_REVIEW"] = "0"
    backup = save_settings(s)
    sglib.HEALTH_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    MARKER.write_text(json.dumps({"installed_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "plugin": hook.parts[-3],
                                  "previous_ENABLE_COMMIT_REVIEW": previous}, indent=2))
    print(f"Installed: commit/push reviews now run through the tap (plugin {hook.parts[-3]}). Settings backup: {backup}")
    print("Claude Code applies this to running sessions too (it reloads settings).")


def uninstall():
    s = load_settings()
    groups = s.get("hooks", {}).get("PostToolUse", [])
    kept = [g for g in groups if not any(str(TAP) in h.get("command", "") for h in g.get("hooks", []))]
    if "hooks" in s:
        s["hooks"]["PostToolUse"] = kept
        if not kept:
            del s["hooks"]["PostToolUse"]
        if not s["hooks"]:
            del s["hooks"]
    prev = json.loads(MARKER.read_text()).get("previous_ENABLE_COMMIT_REVIEW") if MARKER.exists() else None
    env = s.get("env", {})
    if prev is None:
        env.pop("ENABLE_COMMIT_REVIEW", None)
    else:
        env["ENABLE_COMMIT_REVIEW"] = prev
    backup = save_settings(s)
    MARKER.unlink(missing_ok=True)
    print(f"Uninstalled: the plugin runs its own commit/push reviews again. Settings backup: {backup}")


def status():
    s = load_settings()
    hook = sglib.find_plugin_hook()
    ours = tap_entries(s)
    theirs = plugin_entries(hook) if hook else []
    # A plugin update can add review triggers; check each against the tap's filter.
    missing = sorted(h.get("if") for h in theirs if not sglib.REVIEW_TRIGGER.search(_sample(h.get("if") or "")))
    return {
        "plugin": hook.parts[-3] if hook else None,
        "tap_installed": bool(ours),
        "tap_hooks": len(ours),
        "plugin_commit_review_disabled": s.get("env", {}).get("ENABLE_COMMIT_REVIEW") == "0",
        # A plugin update can add review triggers the tap doesn't mirror yet.
        "drift": missing,
        "sdk_venv": (sglib.STATE / "agent-sdk-venv").exists(),
        "ledger": str(sglib.LEDGER),
    }


def _sample(pattern):
    """'Bash(git -C * commit *)' -> 'git -C x commit x'."""
    inner = pattern[pattern.find("(") + 1: pattern.rfind(")")] if "(" in pattern else pattern
    import re
    inner = re.sub(r"(?<=\w)\*", "", inner.replace(":*", " x"))  # 'push*' -> 'push'
    return inner.replace("*", "x")


# ------------------------------------------------------------------- report

def unreviewed_commits(repo, since, reviewed):
    """Commits made in this clone since `since` (from the reflog) with no review record."""
    out = []
    log = sglib.git(repo, "log", "-g", "--format=%H|%gs|%ct", f"--since={int(since)}", "HEAD")
    seen = set()
    for line in log.splitlines():
        sha, action, ts = (line.split("|", 2) + ["", ""])[:3]
        if not action.startswith("commit") or sha in seen:
            continue
        seen.add(sha)
        if not any(sha.startswith(r) or r.startswith(sha) for r in reviewed):
            out.append({"sha": sha[:12], "when": time.strftime("%m-%d %H:%M", time.localtime(int(ts or 0))),
                        "subject": sglib.git(repo, "log", "-1", "--format=%s", sha)[:80]})
    return out


def report(days):
    since = time.time() - days * 86400
    rows = [r for r in sglib.read_ledger() if _ts(r.get("at")) >= since]
    verdicts = Counter(r["verdict"] for r in rows)
    paths = Counter(r.get("path") for r in rows if r["verdict"] in ("clean", "findings", "failed"))
    skipped = Counter(r.get("why") for r in rows if r["verdict"] == "skipped")
    tokens = sum((r.get("usage") or {}).get("tok_out") or 0 for r in rows)
    repos = sorted({r["repo"] for r in rows if r.get("repo")})
    gaps = {}
    for repo in repos:
        plugin_ledger = Path(sglib.git(repo, "rev-parse", "--absolute-git-dir")) / "sg-reviewed-shas"
        reviewed = {l.split("\t")[0] for l in plugin_ledger.read_text().splitlines()} if plugin_ledger.exists() else set()
        reviewed |= {s for r in rows if r.get("repo") == repo for s in r.get("shas", [])}
        g = unreviewed_commits(repo, since, reviewed)
        if g:
            gaps[repo] = g
    return {
        "days": days, "status": status(), "runs": len(rows), "verdicts": dict(verdicts),
        "paths": dict(paths), "skipped_reasons": dict(skipped),
        "failures": [_brief(r) for r in rows if r["verdict"] == "failed"][-20:],
        "findings": [_brief(r) for r in rows if r["verdict"] == "findings"][-20:],
        "noise_stripped": sum(1 for r in rows if r.get("noise_lines")),
        "output_tokens": tokens,
        "unreviewed_commits": gaps,
    }


def _ts(s):
    try:
        return time.mktime(time.strptime(s[:19], "%Y-%m-%dT%H:%M:%S"))
    except Exception:
        return 0


def _brief(r):
    return {"at": r.get("at"), "repo": r.get("repo"), "shas": r.get("shas"), "why": r.get("why"),
            "summary": r.get("summary"), "path": r.get("path"), "seconds": r.get("seconds")}


def print_report(rep):
    st = rep["status"]
    print(f"Security review health, last {rep['days']} days")
    print(f"  plugin {st['plugin']}; tap {'installed' if st['tap_installed'] else 'NOT installed'}"
          f"{'' if not st['drift'] else '; DRIFT, triggers not mirrored: ' + ', '.join(st['drift'])}"
          f"; agent SDK {'present' if st['sdk_venv'] else 'MISSING'}")
    if not st["tap_installed"]:
        print("  Without the tap there are no per-review records. Run `sg-health install`.")
    v = rep["verdicts"]
    print(f"\n  {rep['runs']} review runs: {v.get('clean', 0)} clean, {v.get('findings', 0)} with findings, "
          f"{v.get('failed', 0)} failed, {v.get('skipped', 0)} skipped, {v.get('no_report', 0)} without a report")
    if rep["paths"]:
        print("  answered by: " + ", ".join(f"{k} {n}" for k, n in rep["paths"].items()))
    if rep["noise_stripped"]:
        print(f"  login-warning noise removed from {rep['noise_stripped']} notice(s), which would otherwise have hidden their text")
    for title, key in (("FAILED (the plugin reported these as clean)", "failures"), ("Findings", "findings")):
        if rep[key]:
            print(f"\n  {title}:")
            for r in rep[key]:
                print(f"    {r['at'][:16]}  {Path(r['repo'] or '?').name} {','.join(r['shas'] or ['?'])}  {r['summary'] or r['why']}")
    if rep["unreviewed_commits"]:
        print("\n  Commits with no review record (re-run with `sg-replay <sha> --repo <repo>`):")
        for repo, gs in rep["unreviewed_commits"].items():
            for g in gs[:15]:
                print(f"    {Path(repo).name} {g['sha']}  {g['when']}  {g['subject']}")
    if not rep["failures"] and not rep["unreviewed_commits"]:
        print("\n  Healthy: every recorded review ran, and every commit made here has a review record.")


def main():
    ap = argparse.ArgumentParser(prog="sg-health")
    ap.add_argument("action", nargs="?", default="report", choices=["report", "install", "uninstall", "status"])
    ap.add_argument("--days", type=float, default=7)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    if a.action == "install":
        return install()
    if a.action == "uninstall":
        return uninstall()
    if a.action == "status":
        print(json.dumps(status(), indent=2))
        return
    rep = report(a.days)
    print(json.dumps(rep, indent=2)) if a.json else print_report(rep)
    sys.exit(1 if rep["failures"] or rep["unreviewed_commits"] else 0)


if __name__ == "__main__":
    main()
