# ZDR harness

A locked-down OpenCode 1.18.31 server on `http://127.0.0.1:4096` (LaunchAgent
`com.taylor.zdr-harness`). It runs only on Kickoff's zero-data-retention OpenAI
key (BAA-covered, so PHI may reach it) and exposes 69 named tools: read-only
Amplitude and BugSnag ones, PostHog's single `exec` router, four CloudWatch Logs
readers, ten read-only Cloudinary asset tools, eight Cloudinary configuration
readers, six live-production-database and transcript readers, four Slack
channel readers, four memory tools, and `todowrite`. Two agents split by destination:
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
- **`mcps/kickoff-slack` is harness-only.** The Field Notes bot token
  reads per-client support channels whose names are client names. Never
  register it elsewhere, never add a write scope to the app, and never quote a
  message in a test question's answer.
- **The database tunnel belongs to launchd.** `com.taylor.zdr-harness-tunnel`
  keeps the SSM port-forward open; do not start a second one by hand, and
  never start one with a laptop profile. `zdr-harness tunnel status` says who
  owns the port.
- **`mcps/kickoff-db` is the live production database. Raw PHI, harness-only.**
  It reads the production read replica as `kudos_ro` (SELECT only) through an
  SSM tunnel via the Kickoff Bastion, and archived call transcripts from S3.
  Never register it anywhere else, never point it at the writer endpoint or
  the `kudos` user, never add a statement type beyond SELECT/WITH/SHOW/EXPLAIN/
  DESCRIBE, and never widen `ALLOWED_BUCKET`/`ALLOWED_KEY`. Test questions are
  aggregates only; never fetch a transcript into your own context.
- **`mcps/cloudinary-mcp` is harness-only, on a root key.** Asset public IDs,
  filenames, folder paths and delivery URLs routinely name a client, and the URL
  is fetchable, so they are identifiers under the answer rule. The credential is
  Cloudinary's **root** key (the scoped one returned no asset rows at all), so
  the nine-tool allowlist is the only thing preventing a write to the live
  library. Never allow an upload, rename, delete, tag/metadata edit, folder move
  or generative tool without Taylor asking for that specific tool, and never
  register this server in Claude Code or Codex (it was removed from both on
  purpose). The sibling `cldconfig` server (same launcher, `config` argument)
  reads account configuration — presets, transformations, mappings, triggers,
  streaming profiles. That is product wiring rather than client data, so the
  answer rule passes it through; its create/update/delete tools stay denied.
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
