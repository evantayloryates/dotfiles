#!/usr/bin/env python3
"""sg-replay: re-run the security-guidance plugin's commit review on demand,
with everything the background run hides. See README.md in this folder.

    sg-replay [<commit>] [--repo PATH] [--model M] [--quick] [--timeout S] [--json]

Exit codes: 0 clean, 2 findings, 1 the review failed or was skipped, 3 usage.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sglib  # noqa: E402

HERE = Path(__file__).resolve().parent
REPLAY_ROOT = Path.home() / ".claude" / "security" / "replays"


def fail(msg, code=1):
    print(f"sg-replay: {msg}", file=sys.stderr)
    sys.exit(code)


def git(repo, *args):
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    if r.returncode != 0:
        fail(f"git {' '.join(args)}: {r.stderr.strip()}", 3)
    return r.stdout.strip()


def find_plugin(explicit):
    hook = sglib.find_plugin_hook(explicit)
    return hook if hook else fail("security-guidance plugin not found under ~/.claude/plugins/cache", 3)


def read_token():
    tok = sglib.long_lived_token()
    if not tok:
        fail(f"{sglib.TOKEN_KEY} not found in the environment or {sglib.DOTFILES}/.env "
             f"(create one with `claude setup-token`)")
    return tok


def replay_env(token, run_dir, args):
    env = dict(os.environ)
    # Never fall back to pay-per-use billing, and never use the session's own
    # (possibly rotated) token: use the long-lived subscription token for both
    # the plugin's direct API calls and the inner `claude` it starts.
    for k in ("ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR", "CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR"):
        env.pop(k, None)
    env.update({
        "ANTHROPIC_AUTH_TOKEN": token,
        "CLAUDE_CODE_OAUTH_TOKEN": token,
        # Private log and helper transcript per run (the shared log at
        # ~/.claude/security/log.txt rotates within seconds under a fleet).
        # The state dir is NOT overridden: the plugin finds its agent SDK venv
        # there (~/.claude/security/agent-sdk-venv); the fresh session_id below
        # already keeps per-session state separate.
        "SECURITY_GUIDANCE_DEBUG_LOG": str(run_dir / "debug.log"),
        "SG_AGENTIC_DEBUG_DIR": str(run_dir / "helper"),
        # Run the thorough (helper) review first instead of racing it.
        "SG_AGENTIC_NO_RACE": "1",
        "ENABLE_COMMIT_REVIEW": "1",
        "SECURITY_GUIDANCE_COMMIT_REVIEW": "on",
    })
    if args.model:
        env["SECURITY_REVIEW_MODEL"] = args.model
        env["SG_AGENTIC_MODEL"] = args.model
    if args.quick:
        env["SG_AGENTIC_COMMIT_REVIEW"] = "0"  # single direct call, no helper
    return env


def main():
    ap = argparse.ArgumentParser(prog="sg-replay", description="Re-run a security-guidance commit review with full visibility.")
    ap.add_argument("commit", nargs="?", default="HEAD")
    ap.add_argument("--repo", default=".", help="repository (default: current directory)")
    ap.add_argument("--model", help="review model (default: the plugin's own default)")
    ap.add_argument("--quick", action="store_true", help="single direct review call, no helper (cheaper, shallower)")
    ap.add_argument("--timeout", type=int, default=900, help="seconds (default 900)")
    ap.add_argument("--plugin", help="path to security_reminder_hook.py (default: newest installed)")
    ap.add_argument("--json", action="store_true", help="print the result as JSON")
    args = ap.parse_args()

    repo = Path(git(Path(args.repo).resolve(), "rev-parse", "--show-toplevel"))
    sha = git(repo, "rev-parse", "--verify", f"{args.commit}^{{commit}}")
    short = sha[:7]
    branch = git(repo, "rev-parse", "--abbrev-ref", "HEAD")
    subject = git(repo, "log", "-1", "--format=%s", sha)
    files = [f for f in git(repo, "show", "--name-only", "--format=", sha).splitlines() if f]
    diffstat = git(repo, "show", "--shortstat", "--format=", sha)  # " 5 files changed, 30 insertions(+)"
    hook = find_plugin(args.plugin)
    token = read_token()

    run_dir = REPLAY_ROOT / f"{time.strftime('%Y%m%d-%H%M%S')}-{short}"
    run_dir.mkdir(parents=True, mode=0o700)
    # What Claude Code hands the hook after a `git commit`. The hook only
    # treats it as a successful commit with both git's "[branch sha] subject"
    # line and its diffstat line.
    hook_input = {
        "session_id": str(uuid.uuid4()),
        "hook_event_name": "PostToolUse",
        "cwd": str(repo),
        "tool_name": "Bash",
        "tool_input": {"command": f"git commit -m {json.dumps(subject)}"},
        "tool_response": {"stdout": f"[{branch} {short}] {subject}\n {diffstat.strip()}\n", "stderr": "", "interrupted": False},
    }
    (run_dir / "input.json").write_text(json.dumps(hook_input, indent=2))

    if not args.json:
        print(f"Replaying the commit review of {short} ({len(files)} files) in {repo}")
        print(f"  plugin {hook.parts[-3]}, run folder {run_dir}")
        print("  the thorough review usually takes 1–4 minutes…", flush=True)
    t0 = time.time()
    try:
        # Launch exactly as Claude Code does (the plugin's interpreter picker),
        # and leave the plugin's own review ledger as it was.
        with sglib.PreserveReviewedShas(repo):
            r = subprocess.run(sglib.plugin_command(hook), input=json.dumps(hook_input), capture_output=True, text=True,
                               cwd=repo, env=replay_env(token, run_dir, args), timeout=args.timeout)
        exit_code, stdout, stderr = r.returncode, r.stdout, r.stderr
    except subprocess.TimeoutExpired as e:
        exit_code, stdout, stderr = 124, e.stdout or "", (e.stderr or "") + f"\n[sg-replay] timed out after {args.timeout} s"
        stdout = stdout.decode() if isinstance(stdout, bytes) else stdout
        stderr = stderr.decode() if isinstance(stderr, bytes) else stderr
    seconds = round(time.time() - t0, 1)
    (run_dir / "stdout.txt").write_text(stdout)
    (run_dir / "stderr.txt").write_text(stderr)

    out = sglib.parse_stdout(stdout)
    metrics = out.get("metrics", {})
    noise, other_stderr = sglib.split_stderr(stderr)
    findings = sglib.findings_text(out, exit_code, other_stderr)
    kind, why = sglib.classify(exit_code, out, findings)
    debug_lines = (run_dir / "debug.log").read_text().splitlines() if (run_dir / "debug.log").exists() else []
    problems = [l for l in debug_lines if re.search(r"error|fail|fallback|401|403|429|timed out|revoked", l, re.I)]

    result = {
        "commit": sha, "repo": str(repo), "subject": subject, "files": files,
        "verdict": kind, "why": why, "seconds": seconds, "hook_exit": exit_code,
        "summary": out.get("rewakeSummary"), "findings": findings,
        "usage": sglib.usage(metrics), "path": sglib.review_path(metrics),
        "review": {"helper_used": metrics.get("agentic"), "helper_fallback": metrics.get("agentic_fallback"),
                   "files_reviewed": metrics.get("files_reviewed"), "vulns_found": metrics.get("vulns_found"),
                   "http_errors": metrics.get("http_err_count"), "api_error": metrics.get("api_error")},
        # Why background notices lose their details: Claude Code delivers the
        # hook's stderr when it is non-empty, and this noise lands there.
        "stderr_noise": noise, "stderr_other": other_stderr,
        "debug_problems": problems[-15:], "metrics": metrics, "run_dir": str(run_dir),
    }
    (run_dir / "result.json").write_text(json.dumps(result, indent=2))

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        icon = {"clean": "✓ CLEAN", "findings": "✗ FINDINGS", "failed": "! REVIEW FAILED", "skipped": "– SKIPPED"}[kind]
        print(f"\n{icon}: {why}  ({seconds} s)")
        u = result["usage"]
        print(f"  helper used: {metrics.get('agentic')}, fallback: {metrics.get('agentic_fallback')}, "
              f"tokens in/out: {u['tok_in']}/{u['tok_out']}, cached read: {u['tok_cache_r']}, est. cost: {u['cost_usd']}")
        if findings:
            print("\n--- findings ---\n" + findings)
        if noise:
            print(f"\n(stderr carried {len(noise)} line(s) of login-warning noise: this is what replaces the details in background notices)")
        if other_stderr:
            print("\n--- other stderr ---\n" + other_stderr[-2000:])
        if problems:
            print("\n--- problems in the debug log ---\n" + "\n".join(problems[-15:]))
        print(f"\nEverything is in {run_dir}")
    sys.exit({"clean": 0, "findings": 2}.get(kind, 1))


if __name__ == "__main__":
    main()
