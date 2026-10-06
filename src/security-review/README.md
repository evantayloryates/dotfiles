# security-review

Tools for working around blind spots in the **security-guidance** Claude Code
plugin (`security-guidance@claude-plugins-official`), which reviews code
changes for vulnerabilities in the background of every Claude Code session.

Plain-language explainer of the problem:
[The Empty Security Note](https://claude.ai/artifact/CZ6uGy3kBa6WkmHvZdKVXK) (private artifact; ask Taylor for access).

## Why this exists

The plugin's **commit review** runs after every `git commit` an agent makes
and wakes the agent with a notice if it finds something. Investigating one of
those notices (October 2026, plugin 2.0.8) turned up three blind spots:

1. **Findings get swallowed.** For commit reviews the plugin puts its findings
   in its JSON stdout (`hookSpecificOutput.additionalContext`). Claude Code
   builds the notice body from the hook's stderr whenever stderr is non-empty
   (the plugin's own comments describe it as `stderr || stdout`). In real runs
   stderr carried "⚠ claude.ai connectors are disabled because ANTHROPIC_API_KEY
   or another auth source is set…", most likely printed by the helper `claude`
   process the thorough review starts. That warning became the notice and the
   findings were never shown; only the one-line summary (`rewakeSummary`) got
   through. Every commit review that found something on this Mac (3 of 3,
   across sessions) arrived like this; the per-edit reviews arrived intact.
   Replays don't reproduce the warning, so its exact source is unconfirmed.
2. **The debug log can't be read after the fact.** Every session writes to
   one log, `~/.claude/security/log.txt`, capped at 1 MB. With dozens of
   sessions running it holds a few seconds of history.
3. **Failed reviews look clean.** If the review can't authenticate (for
   example with a session token that has since been rotated), the plugin logs
   "no vulnerabilities found" and stays silent. The failure only shows up in
   its metrics (`api_error`, `http_err_count`), which nobody sees.

The fixes for 1 and 3 belong in the plugin itself and are reported upstream:
[anthropics/claude-code#99839](https://github.com/anthropics/claude-code/issues/99839)
(findings replaced by the warning) and
[anthropics/claude-code#99840](https://github.com/anthropics/claude-code/issues/99840)
(failed reviews reported as clean and marked reviewed). When those are fixed,
re-check whether the tap's stderr rewrite and failure notice are still needed.
Until then, `sg-replay` and the tap fill the gap.

## Status

Both tools are working and the tap is **installed** (October 5 2026):
`sg-health status` → `tap_installed: true`. Undo with `sg-health uninstall`.

End-to-end verification, with a fresh `claude -p` session and a running
desktop session each committing planted vulnerabilities in a scratch repo:
every commit was reviewed through the tap (thorough review, 30–51 s), every
vulnerability was flagged (template injection, unsafe pickle and YAML loading,
command injection), the fixes came back clean, and the notices arrived as
readable findings.

Problems found while building it, all handled in the code:

- **Settings hooks get no credentials.** Hooks declared in user settings don't
  receive the credential Claude Code gives the plugin's own hooks, so the
  plugin skipped every review (`skip_reason 22`). The tap supplies the
  long-lived subscription token when its process has none
  (`sglib.ensure_credentials`); the ledger's `credential` field says which
  was used.
- **`if` is ignored on settings hooks.** Mirroring the plugin's seven entries
  ran the tap seven times on every Bash call, so there's one entry and the tap
  filters commands itself (`sglib.REVIEW_TRIGGER`).
- **Switched-off plugin hooks still claim each Bash call**
  (`.git/sg-hook-once-<tool_use_id>`), so the tap runs the plugin under its own
  `tool_use_id`.
- **The notice is raw text.** Claude Code delivers a rewake hook's stderr if
  any, else its raw stdout, and doesn't read the structured findings field. The
  tap writes the readable findings to stderr (and strips the login-warning
  noise that used to take their place).
- **`git commit -q` hides the commit hash,** so the tap records HEAD when the
  plugin found the commit through the reflog.
- **Settings are hot-reloaded into running sessions** (hooks and env), so
  install and uninstall take effect everywhere at once.

The tap logs its own errors to `~/.claude/security/health/tap-errors.log`.
Test rows from the build were archived to
`~/.claude/security/health/reviews.test-20261005.jsonl`.

## `sg-replay`

Re-runs the plugin's own commit review for any commit and shows everything:
the full findings, whether the review really ran (or failed to sign in), which
path it took, and what it consumed.

```bash
sg-replay                 # review HEAD of the repo you're in
sg-replay 774f12f         # a specific commit
sg-replay HEAD~3 --repo ~/src/github/kickoff
sg-replay 774f12f --json  # for agents
sg-replay 774f12f --quick # one direct review call, no helper (faster, shallower)
sg-replay 774f12f --model claude-sonnet-4-6
```

Use it when a security notice arrives without details, or to confirm that a
commit really passed review.

**Verdicts and exit codes:** `clean` (0), `findings` (2), `failed` (1: the
review couldn't complete, e.g. HTTP 401; the plugin would have reported this
as clean), `skipped` (1, with the plugin's skip reason).

**What it does:**

- Finds the newest installed plugin under
  `~/.claude/plugins/cache/*/security-guidance/*/` and runs its
  `hooks/security_reminder_hook.py` through the plugin's own launcher
  (`sg-python.sh`), exactly as Claude Code does.
- Feeds it the input Claude Code gives the hook after a `git commit`
  (`[branch sha] subject` plus the diffstat line, which the plugin requires
  before it treats a commit as successful) and a fresh session id, so
  per-session rate limits and claims don't interfere.
- Gives the run its own debug log and helper transcript
  (`SECURITY_GUIDANCE_DEBUG_LOG`, `SG_AGENTIC_DEBUG_DIR`) and runs the thorough
  review first instead of racing it (`SG_AGENTIC_NO_RACE=1`). It doesn't
  override `SECURITY_WARNINGS_STATE_DIR`: the plugin finds its agent SDK venv
  (`~/.claude/security/agent-sdk-venv`) there.
- Reads stdout (metrics, summary, findings) and stderr separately, and filters
  the helper's login warning out as noise.
- Saves everything to `~/.claude/security/replays/<time>-<sha>/`:
  `input.json`, `stdout.txt`, `stderr.txt`, `debug.log`, `helper/`
  (investigation transcript), `result.json`.

**Auth, and why it never costs API money:** replays use
`KICKOFF_CLAUDE_CODE_LONG_LIVED_SUBSCRIPTION_OAUTH_TOKEN` from
`~/dotfiles/.env` (read by name only, through `src/lib/read-env.sh`, and never
printed). It is a long-lived Claude Code subscription token (make one with
`claude setup-token`). The tool passes it as `ANTHROPIC_AUTH_TOKEN` and
`CLAUDE_CODE_OAUTH_TOKEN` and removes `ANTHROPIC_API_KEY` from the replay's
environment, so usage counts against the subscription, never pay-per-use API
billing. The session's own `CLAUDE_CODE_OAUTH_TOKEN` isn't used, because it
is issued at session start and can be revoked hours later.

The plugin's `cost_usd` metric is its own estimate at API list prices. With a
subscription token, nothing is billed per use.

**Measured** (plugin 2.0.8, dotfiles repo, October 5 2026):

| Commit | Review path | Verdict | Time | Usage |
|--------|-------------|---------|------|-------|
| `774f12f` (had an export-name path traversal) | quick | **findings**: the HIGH path traversal, with full text | 39 s | 28k in / 3k out |
| `774f12f` | thorough (helper) | **clean**: it missed the bug | 280 s | 376k cached in / 20k out |
| `2302bed` (the fix) | quick | clean | 1 s | 17k in / 30 out |
| `2302bed` | thorough (helper) | **findings**: 2 MEDIUM (symlink-following, blocking read on a FIFO), valid and fixed in the next commit | 750 s | 912k cached in / 37k out |

What this means in practice:

- **Reviews aren't deterministic, and the two paths catch different things.**
  For a commit that matters, run both: `sg-replay <sha>` and
  `sg-replay <sha> --quick`.
- **The thorough review is heavy:** 5–12 minutes and close to a million cached
  input tokens on a 1-file commit. It runs against the subscription, but it
  isn't free of rate limits.
- Background commit reviews race the two paths (the quick one after 180 s), so
  which one answered a given notice isn't visible. Replays make it explicit.

## `sg-health`

```bash
sg-health              # outcomes, failures, findings, commits with no review record (last 7 days)
sg-health status       # tap installed? drift against the plugin's triggers? agent SDK present?
sg-health install      # route commit/push reviews through tap.py (edits ~/.claude/settings.json, with a backup)
sg-health uninstall    # restore the plugin's own reviews exactly
```

`install` adds one `PostToolUse` Bash hook running `tap.py` and sets the
plugin's kill switch `ENABLE_COMMIT_REVIEW=0` so reviews don't run twice. The
tap runs the plugin's review itself, records every outcome in
`~/.claude/security/health/reviews.jsonl`, puts readable findings on stderr so
the notice shows them, supplies a credential when the hook has none, and wakes
the agent when a review couldn't run (a crash, or an explicit sign-in/API
error), which the plugin would report as clean.

Each ledger row: time, session, command, repo, commit hashes, verdict
(`clean`, `findings`, `failed`, `skipped`, `no_report`), why, summary, review
path (`helper` or `quick`), seconds, usage, credential source, the credential
variable names the hook saw (never values), and the findings text.

The report also lists commits made in each recorded repo (from the reflog)
with no review record in the plugin's ledger (`.git/sg-reviewed-shas`), the
tap's ledger, or a saved `sg-replay` result (`~/.claude/security/replays/*/result.json`;
clean, findings, and skips such as reason 30, "no reviewable source files",
all count).

## Files

| Path | What |
|------|------|
| `replay.py` | `sg-replay` (stdlib only) |
| `tap.py` | the review tap hook |
| `health.py` | `sg-health`: report, install, uninstall, status |
| `sglib.py` | shared: plugin discovery, output parsing, verdicts, ledger |
| `../../bin/sg-replay`, `../../bin/sg-health` | launchers on PATH |
