#!/usr/bin/env python3
"""Review tap: Claude Code runs this in place of the security-guidance
plugin's own commit/push review hooks (installed by `sg-health install`).

It runs the plugin's exact review, then:
  1. records the outcome (clean / findings / failed / skipped, usage, path)
     in ~/.claude/security/health/reviews.jsonl for `sg-health`;
  2. drops the login-warning noise from stderr, so Claude Code shows the
     findings instead of the warning;
  3. turns a review that couldn't run (e.g. HTTP 401), which the plugin
     reports as clean, into a notice that wakes the agent.

Fails open: if anything here breaks, the plugin's own output goes through
unchanged, or the plugin runs directly.
"""
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sglib  # noqa: E402


def note_tap_error(where):
    """Fail open, but never silently: sg-health reports these."""
    try:
        import traceback
        sglib.LEDGER.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with open(sglib.LEDGER.parent / "tap-errors.log", "a") as f:
            f.write(f"--- {time.strftime('%Y-%m-%dT%H:%M:%S%z')} {where}\n{traceback.format_exc()}\n")
    except Exception:
        pass


def run_plugin_directly(hook, payload):
    """Fallback: behave exactly like the plugin's own hook would."""
    import subprocess
    env = dict(os.environ, ENABLE_COMMIT_REVIEW="1")
    r = subprocess.run(sglib.plugin_command(hook), input=payload, capture_output=True, text=True, env=env)
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    sys.exit(r.returncode)


def main():
    payload = sys.stdin.read()
    try:
        data = json.loads(payload or "{}")
    except Exception:
        data = {}
    command = (data.get("tool_input") or {}).get("command") or ""
    if not sglib.REVIEW_TRIGGER.search(command):
        sys.exit(0)  # not a commit or push: nothing to review, nothing to record
    hook = sglib.find_plugin_hook()
    if hook is None:
        sys.exit(0)  # plugin not installed: nothing to review, nothing to report
    try:
        import subprocess
        # The plugin's own (switched-off) hooks still claim this Bash call in a
        # `.git/sg-hook-once-<tool_use_id>` sentinel before checking
        # ENABLE_COMMIT_REVIEW. Use a distinct id so that claim can't block us.
        mine = dict(data)
        if mine.get("tool_use_id"):
            mine["tool_use_id"] = f"{mine['tool_use_id']}-sgtap"
        # sg-health install turns the plugin's own commit/push review off with
        # ENABLE_COMMIT_REVIEW=0 so it doesn't run twice; turn it back on here.
        env = dict(os.environ, ENABLE_COMMIT_REVIEW="1")
        t0 = time.time()
        r = subprocess.run(sglib.plugin_command(hook), input=json.dumps(mine), capture_output=True, text=True, env=env)
        seconds = round(time.time() - t0, 1)
    except Exception:
        note_tap_error("before running the plugin")
        run_plugin_directly(hook, payload)
        return

    try:
        out = sglib.parse_stdout(r.stdout)
        metrics = out.get("metrics", {})
        noise, other_stderr = sglib.split_stderr(r.stderr)
        findings = sglib.findings_text(out, r.returncode, other_stderr)
        verdict, why = sglib.classify(r.returncode, out, findings)
        tool_input = data.get("tool_input") or {}
        tool_response = data.get("tool_response") or {}
        cwd = data.get("cwd") or ""
        repo = sglib.git(cwd, "rev-parse", "--show-toplevel") if cwd else ""
        shas = sglib.COMMIT_SHA.findall(f"{tool_response.get('stdout') or ''}\n{tool_response.get('stderr') or ''}")
        sglib.append_ledger({
            "at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "session_id": data.get("session_id"),
            "command": (tool_input.get("command") or "")[:300], "cwd": cwd, "repo": repo, "shas": shas,
            "kind": "push" if re.search(r"\bpush\b|gt submit", tool_input.get("command") or "") else "commit",
            "verdict": verdict, "why": why, "summary": out.get("rewakeSummary"), "seconds": seconds,
            "path": sglib.review_path(metrics), "usage": sglib.usage(metrics), "hook_exit": r.returncode,
            "noise_lines": len(noise), "findings": findings[:20000] if findings else "",
            "plugin": hook.parts[-3], "metrics": metrics,
            # Which credential variables this hook process received (names only,
            # never values): explains skip_reason 22 ("no API credentials").
            "auth_env": sorted(k for k in os.environ if re.search(r"ANTHROPIC|OAUTH|AUTH_TOKEN|API_KEY|CLAUDE_CODE_.*(TOKEN|AUTH|DESCRIPTOR)", k)),
            "entrypoint": os.environ.get("CLAUDE_CODE_ENTRYPOINT"),
        })

        stdout, stderr, code = r.stdout, other_stderr, r.returncode
        if verdict == "failed" and repo:
            # The plugin would stay silent here. Wake the agent instead.
            target = shas[0] if shas else "HEAD"
            stderr = (f"Security review did NOT run for {target} in {repo}: {why}.\n"
                      f"This change is unreviewed. Re-run it with `sg-replay {target} --repo {repo}` "
                      f"(see ~/dotfiles/src/security-review/README.md).")
            out["rewakeSummary"] = "Security review failed to run"
            stdout = json.dumps(out) + "\n"
            code = 2
        sys.stdout.write(stdout)
        if stderr:
            sys.stderr.write(stderr + ("" if stderr.endswith("\n") else "\n"))
        sys.exit(code)
    except SystemExit:
        raise
    except Exception:
        note_tap_error("after running the plugin")
        # Never let the tap hide a review: pass the plugin's output through.
        sys.stdout.write(r.stdout)
        sys.stderr.write(r.stderr)
        sys.exit(r.returncode)


if __name__ == "__main__":
    main()
