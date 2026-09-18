# ZDR harness

A locked-down OpenCode 1.18.31 server on `http://127.0.0.1:4096` (LaunchAgent
`com.taylor.zdr-harness`). It runs only on Kickoff's zero-data-retention OpenAI
key (BAA-covered, so PHI may reach it) and exposes 41 named tools: read-only
Amplitude and BugSnag ones, PostHog's single `exec` router, four CloudWatch Logs
readers, four memory tools, and `todowrite`. Two agents split by destination:
`analyst` (default, full detail, read by Taylor in the app) and `zdr` (what the
bridge always asks, de-identified to HIPAA Safe Harbor because Claude Code and
Codex have no BAA). Claude Code and Codex reach it through the `zdr_ask` MCP tool
(`src/mcps/zdr-ask`).
`ZDR Harness.app` (`app/`) is the native viewer. **README.md is the source of
truth**: design, lockdown, app, verification. Read it before changing anything.

## Hard rules

- **`mcps/kickoff-logs` is harness-only.** Production Lambda logs carry request
  payloads and client free text. Never register that server in Claude Code,
  Codex or any other non-ZDR client, and never add a write API to it.
- **Harness tokens stay in `src/zdr-harness/.env`.** They are for this harness
  only; do not copy them into another MCP client, shell profile or repo `.env`.
  Update `.env.template` whenever that file's keys or comments change.
- **Secrets never appear.** Not the OpenAI key, the harness password, OAuth
  tokens, or the `auth_token` (base64) form of the password. Not in output, logs,
  commits, the app bundle, `Info.plist` or URLs. Pipe the password to
  `curl -K -` and show only lengths or SHA-256 prefixes. Grep staged diffs for
  the password's first 16 and the key's first 24 characters before every commit.
- **Never relay an `analyst` answer to another agent.** The bridge refuses a
  non-`zdr` session and re-checks which agent wrote the reply; keep both checks.
- **Memory holds patterns, not people.** `~/.zdr-harness/memory/` is never
  pruned, so notes must stay free of client detail (the server scrubs, the
  prompts instruct).
- **Do not weaken the lockdown.** No edits to `permission`, `enabled_providers`,
  `experimental.policies` or `mcp` in `opencode/opencode.json`, or to the answer
  rule in `opencode/prompts/zdr.md`. No new variables in the wrapper's
  `isolated_env`. Keep `~/.zdr-harness/xdg/config/opencode` read-only. Never set
  `OPENCODE_DISABLE_EMBEDDED_WEB_UI`.
- **The app's content rule list only ever allows `http://127.0.0.1:4096/`.** If
  the UI needs something else, fix the regex, never widen it. If the list does
  not compile, the app must refuse to load the UI.
- **No OpenCode upgrade** except through README "Upgrading OpenCode", then the
  full Verification list.
- **Test questions are aggregates or no-tool prompts.** Never ask for user-level
  data. Delete the test sessions you create.
- **Do not run the MCP OAuth flows** (`zdr-harness mcp auth …`). They need
  Taylor in a browser; give the exact command instead.
- Swift + AppKit + WebKit only in the app: no packages, no network in the build.
- Leave the service running and healthy after any test that stops it.

## Commands

```sh
Z=~/dotfiles/src/zdr-harness/bin/zdr-harness
$Z status                      # health + MCP state
$Z restart                     # launchctl kickstart -k
$Z reload-auth                 # apply an edited secrets file + probe each token
$Z set-token <KEY>             # roll a secret: hidden prompt, restart, re-check
$Z logs                        # service stdout/stderr
$Z attach                      # TUI on the running server
$Z prune --dry-run             # sessions not updated in 30 days; --days N
$Z app                         # build if stale, install, open the app
$Z app-build --force           # rebuild + install without opening
"$HOME/Applications/ZDR Harness.app/Contents/MacOS/ZDRHarness" --self-test [--canary-port N] [--session ID]
```

## Where state lives

| Path | What |
|---|---|
| `src/zdr-harness/.env` (600, gitignored) | All four secrets: ZDR key, harness password, `KICKOFF_BUGSNAG_TOKEN` (`token` scheme, not `Bearer`), `KICKOFF_POSTHOG_TOKEN`. Edits need `zdr-harness reload-auth`: `{env:...}` resolves at server start |
| `src/zdr-harness/.env.template` | Tracked copy of that file's keys and comments, values empty |
| `~/.zdr-harness/xdg/data/opencode/` | Sessions DB (raw tool output), MCP OAuth tokens, logs |
| `~/.zdr-harness/logs/` | Service logs and the app's `app.log` |
| `~/.zdr-harness/opt/` | Pinned OpenCode install |
| `~/Applications/ZDR Harness.app` | Installed app |
| `~/Library/WebKit/com.taylor.zdr-harness.app` | App localStorage (UI prefs, drafts, project list) |

The live service runs from this working tree. Keep the checkout on `master`,
and commit there in small commits (this repo's norm).

**After any change to the wrapper, config or app, run the README Verification
list.**
