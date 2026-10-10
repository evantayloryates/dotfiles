# Shared dotfiles publication

`bin/dotfiles-publish` is the autonomous master publishing entrypoint. Commit first;
it fetches, rebases, and pushes with an explicit expected-commit lease. Concurrent
remote writes are incorporated automatically, up to three attempts. It never
accepts force flags, arbitrary remotes, branches or shell commands. `--check` is
local/read-only. A substantive rebase conflict remains available for the agent to
resolve; no automatic stash, reset, abort, secret-check bypass or history deletion.

A push after rebasing unpublished commits normally fast-forwards. The explicit
lease is still used for every publisher push to reject an intervening update.
Unlike bare `--force-with-lease`, its expected SHA cannot be silently advanced by
an editor’s background fetch. A parent check ensures the fetched master remains
in the published history. The lock serializes this helper on this Mac, not arbitrary
Git commands or clients on other machines; agents should coordinate edits normally.

Install: `python3 src/git-publishing/install.py`. This adds repo-local Git defaults
and links the versioned rules to `~/.codex/rules/dotfiles.rules`. Existing Codex
no-prompt/full-access preferences remain unchanged. Project-local settings are in
`.codex/config.toml`; trust entries cover both local path spellings. Rules load on
Codex startup; existing sessions can retain previous policy, and higher-priority
requirements still win. Do not route around an active execution-policy refusal.

Codex rules permit the fixed publisher and routine direct pushes explicitly
addressed to either dotfiles checkout. Common unleased-force forms are forbidden
without adding approval prompts. Prefer the publisher for its automatic race
recovery. Prefix rules cannot implement a semantic ban on every Git alias/flag spelling. AGENTS.md covers ordinary cwd-based Git and other clients;
these are collaboration guardrails, not an adversarial Git security sandbox.

Sources: https://git-scm.com/docs/git-push and
https://developers.openai.com/codex/rules .

## Claude parity

`CLAUDE.md` links to the same `AGENTS.md`. `.claude/settings.json` pins the repo's
existing no-prompt preference and allows the fixed publisher. The shared Git
defaults apply to both harnesses. The installer preserves all existing global
Claude settings/hooks and adds a Bash PreToolUse guard, so chats in other repos
also get the dotfiles-only check. It denies common direct force/mirror/+ref pushes,
including cwd, `cd` and Git `-C` forms; normal pushes and explicit leases continue
through the existing permission flow. It never returns `ask` or overrides another
guard. No global permission mode is changed. Secret/security hooks stay enabled.

This is a collaboration guardrail, not a shell sandbox: generated scripts, aliases
and nested interpreters are outside its scope. Use the publisher for complete
fetch/rebase/lease guarantees. Load a fresh Claude session to ensure new hooks and
guide text are active; existing sessions can retain earlier configuration.

Hook protocol: https://code.claude.com/docs/en/hooks
