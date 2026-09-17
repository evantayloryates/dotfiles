# ZDR harness

A locked-down OpenCode 1.18.31 server on `http://127.0.0.1:4096` (LaunchAgent
`com.taylor.zdr-harness`). It runs only on Kickoff's zero-data-retention OpenAI
key and exposes only 30 named tools: read-only Amplitude and BugSnag ones,
PostHog's single `exec` router (constrained by a read-scoped key, not by the
allowlist), and `todowrite` for in-session planning. Claude Code and Codex reach it through the `zdr_ask` MCP tool
(`src/mcps/zdr-ask`).
`ZDR Harness.app` (`app/`) is the native viewer. **README.md is the source of
truth**: design, lockdown, app, verification. Read it before changing anything.

## Hard rules

- **Harness tokens stay in `~/.zdr-harness/.env`.** They are for this harness
  only; do not copy them into another MCP client, shell profile or repo `.env`.
  Update `.env.template` whenever that file's keys or comments change.
- **Secrets never appear.** Not the OpenAI key, the harness password, OAuth
  tokens, or the `auth_token` (base64) form of the password. Not in output, logs,
  commits, the app bundle, `Info.plist` or URLs. Pipe the password to
  `curl -K -` and show only lengths or SHA-256 prefixes. Grep staged diffs for
  the password's first 16 and the key's first 24 characters before every commit.
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
| `~/.zdr-harness/.env` (600) | All four secrets: ZDR key, harness password, `KICKOFF_BUGSNAG_TOKEN` (`token` scheme, not `Bearer`), `KICKOFF_POSTHOG_TOKEN` |
| `src/zdr-harness/.env.template` | Tracked copy of that file's keys and comments, values empty |
| `~/.zdr-harness/xdg/data/opencode/` | Sessions DB (raw tool output), MCP OAuth tokens, logs |
| `~/.zdr-harness/logs/` | Service logs and the app's `app.log` |
| `~/.zdr-harness/opt/` | Pinned OpenCode install |
| `data/zdr-harness/` (gitignored) | App build output |
| `~/Applications/ZDR Harness.app` | Installed app |
| `~/Library/WebKit/com.taylor.zdr-harness.app` | App localStorage (UI prefs, drafts, project list) |

The live service runs from this working tree. Keep the checkout on `master`,
and commit there in small commits (this repo's norm).

**After any change to the wrapper, config or app, run the README Verification
list.**
