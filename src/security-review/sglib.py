"""Shared pieces for sg-replay, the review tap and sg-health: finding the
security-guidance plugin, reading its output, and classifying a review run.
See README.md in this folder for the why."""
import json
import os
import re
import subprocess
from pathlib import Path

HOME = Path.home()
DOTFILES = Path(__file__).resolve().parent.parent.parent
READ_ENV = DOTFILES / "src" / "lib" / "read-env.sh"
# A long-lived Claude Code subscription token (`claude setup-token`), kept in
# dotfiles/.env. Reviews run on it bill the subscription, never the API.
TOKEN_KEY = "KICKOFF_CLAUDE_CODE_LONG_LIVED_SUBSCRIPTION_OAUTH_TOKEN"
STATE = HOME / ".claude" / "security"
HEALTH_DIR = STATE / "health"
# Overridable for tests.
LEDGER = Path(os.environ.get("SG_HEALTH_LEDGER") or HEALTH_DIR / "reviews.jsonl")
PLUGIN_GLOB = ".claude/plugins/cache/*/security-guidance/*/hooks/security_reminder_hook.py"
# Printed (most likely) by the inner `claude` the plugin starts. Claude Code
# shows the hook's stderr instead of its stdout when stderr is non-empty, so
# this line used to replace the findings in background notices.
NOISE = re.compile(r"claude\.ai connectors are disabled|Unset it to load your organization")
COMMIT_SHA = re.compile(r"^\[[^\]]*?\b([0-9a-f]{7,40})\]", re.MULTILINE)
# Commands that trigger the plugin's commit/push review. Claude Code ignores
# the `if` filter on hooks declared in user settings, so the tap runs on every
# Bash call and filters here. Kept broad on purpose: a false positive only
# lets the plugin decide; a miss would skip a review.
REVIEW_TRIGGER = re.compile(r"\bgit\b[^;&|\n]*\b(commit|push)\b|\bgt\s+(create|modify|submit)\b")


def find_plugin_hook(explicit=None):
    """Newest installed security_reminder_hook.py, or None."""
    explicit = explicit or os.environ.get("SG_PLUGIN_HOOK")  # tests
    if explicit:
        p = Path(explicit).expanduser()
        return p if p.is_file() else None

    def version(p):
        return tuple(int(x) if x.isdigit() else 0 for x in p.parts[-3].split("."))

    found = sorted(HOME.glob(PLUGIN_GLOB), key=version)
    return found[-1] if found else None


def plugin_command(hook):
    """How Claude Code runs the hook: through the plugin's interpreter picker."""
    launcher = hook.parent / "sg-python.sh"
    return ["bash", str(launcher), str(hook)] if launcher.exists() else ["python3", str(hook)]


def parse_stdout(text):
    """The hook prints one JSON object: metrics, rewakeSummary and (for
    PostToolUse) findings in hookSpecificOutput.additionalContext."""
    for line in (text or "").splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
    return {}


def split_stderr(text):
    lines = (text or "").splitlines()
    noise = [l for l in lines if NOISE.search(l)]
    rest = "\n".join(l for l in lines if l.strip() and not NOISE.search(l))
    return noise, rest


def findings_text(out, exit_code, other_stderr):
    f = ((out.get("hookSpecificOutput") or {}).get("additionalContext") or out.get("reason") or "").strip()
    if not f and exit_code == 2:
        f = other_stderr  # older plugin versions put findings on stderr
    return f


def classify(exit_code, out, findings):
    """(verdict, why). verdict: clean | findings | failed | skipped | no_report.
    Only `failed` wakes an agent: a crash, or an explicit sign-in/API error."""
    m = out.get("metrics", {}) if out else {}
    if not out:
        if exit_code in (0, 2):
            return "no_report", f"the hook printed no status report (exit {exit_code})"
        return "failed", f"the hook crashed (exit {exit_code}) without a status report"
    if m.get("skipped"):
        return "skipped", f"skip_reason {m.get('skip_reason')}"
    if m.get("bash_hook_dedup"):
        return "skipped", "another hook already handled this command"
    if findings or exit_code == 2 or (m.get("vulns_found") or 0) > 0:
        return "findings", out.get("rewakeSummary") or "the review reported findings"
    if m.get("api_error") or (m.get("http_err_count") or 0) > 0:
        return "failed", (f"the review could not complete: HTTP {m.get('http_err_last') or m.get('api_error')} "
                          f"({m.get('http_err_count', 0)} errors); the plugin reports this as clean")
    if exit_code not in (0, 2):
        return "failed", f"the hook exited {exit_code}"
    return "clean", "the review ran and found nothing"


def usage(m):
    return {k: m.get(k) for k in ("tok_in", "tok_out", "tok_cache_r", "tok_cache_w", "cost_usd", "api_calls")}


def review_path(m):
    """Which path answered: helper (thorough), quick, or quick after the helper failed."""
    if m.get("agentic"):
        return "helper"
    if m.get("agentic_fallback"):
        return f"quick (helper fallback {m.get('agentic_fallback')})"
    return "quick" if m.get("api_calls") else "none"


def git(repo, *args, check=False):
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {r.stderr.strip()}")
    return r.stdout.strip() if r.returncode == 0 else ""


def append_ledger(row):
    LEDGER.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(LEDGER, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    with os.fdopen(fd, "a") as f:
        f.write(json.dumps(row, separators=(",", ":")) + "\n")


def read_ledger():
    if not LEDGER.exists():
        return []
    rows = []
    for line in LEDGER.read_text().splitlines():
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


class PreserveReviewedShas:
    """The plugin records every review in <repo>/.git/sg-reviewed-shas and
    skips commits already listed there. A replay must not rewrite that record
    (e.g. replace "1 finding" with a replay's "0"), so restore it afterwards."""

    def __init__(self, repo):
        gd = git(repo, "rev-parse", "--absolute-git-dir")
        self.path = Path(gd) / "sg-reviewed-shas" if gd else None
        self.before = None

    def __enter__(self):
        if self.path and self.path.exists():
            self.before = self.path.read_bytes()
        return self

    def __exit__(self, *exc):
        if not self.path:
            return False
        if self.before is None:
            self.path.unlink(missing_ok=True)
        else:
            self.path.write_bytes(self.before)
        return False


def long_lived_token():
    """From the environment (the launchd .env bridge puts it in GUI apps and
    their hooks), else dotfiles/.env via read-env.sh, reading only this key."""
    if os.environ.get(TOKEN_KEY):
        return os.environ[TOKEN_KEY]
    r = subprocess.run(["sh", "-c", f'. "{READ_ENV}" && env_get {TOKEN_KEY}'], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else ""


def ensure_credentials(env):
    """Give the plugin a credential when its process has none.

    Hooks declared in user settings don't receive the credential Claude Code
    hands the plugin's own hooks (measured: no ANTHROPIC_AUTH_TOKEN or
    CLAUDE_CODE_OAUTH_TOKEN), so the plugin skipped every review with
    skip_reason 22. Fill in the long-lived subscription token instead.
    Returns where the credential came from."""
    if env.get("ANTHROPIC_API_KEY") or env.get("ANTHROPIC_AUTH_TOKEN"):
        return "session"
    tok = long_lived_token()
    if not tok:
        return "none"
    env["ANTHROPIC_AUTH_TOKEN"] = tok
    env.setdefault("CLAUDE_CODE_OAUTH_TOKEN", tok)
    return "long-lived token"
