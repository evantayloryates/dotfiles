# claude-driver

Lets any harness (Claude Code desktop or CLI, Codex, Cursor, OpenCode, a
script) drive the Claude desktop app: create sessions with an exact title,
model and folder; fork, open, rename, pin, group, archive, unarchive and
delete them; change model, effort and permission mode; send messages; read
what the main window shows. Zero npm dependencies: Node only, like
[`../codex-bridge`](../codex-bridge/README.md), whose conventions it copies.

```
harness ──MCP stdio──▶ bin/claude-driver-mcp (server.mjs) ─┐   bin/claude-driver (cli.mjs) ─┐
                                                           ▼                                ▼
                                                    lib/driver.mjs (op layer, ledger, focus policy)
          ┌──────────────────────────────┬──────────────────────────────┬──────────────────────────────┐
     Tier A: disk + CLI + deep links  Tier B: broker session            Tier C: codex-bridge
     session records, main.log,       (Haiku, bypassPermissions,        Computer Use in the
     bundled CLI bootstrap turn,      resident wait loop) runs the      Claude app: broker
     claude:// links                  app's own ccd_* tools             revival, windows
```

Usage contract for agents: [docs/guide.md](docs/guide.md) (also served by the
`driver_guide` tool and the `claude-driver://guide` resource). Dated evidence:
[docs/findings.md](docs/findings.md). Original research and decisions:
[docs/brief.md](docs/brief.md).

## Setup

```sh
~/dotfiles/src/claude-driver/bin/claude-driver install     # MCP in Claude Code, Codex, Cursor, OpenCode (idempotent)
~/dotfiles/src/claude-driver/bin/claude-driver broker init # once: creates the broker session; Taylor approves one bypass card
~/dotfiles/src/claude-driver/bin/claude-driver preflight   # checks; re-probes when the app or CLI version changed
```

`install` writes `claude mcp add claude-driver -s user`, a
`[mcp_servers.claude-driver]` table in `~/.codex/config.toml`
(`tool_timeout_sec = 300`), `mcpServers.claude-driver` in
`~/.cursor/mcp.json` and `mcp.claude-driver` in
`~/.config/opencode/opencode.json`, backing up each file it changes to
`<file>.bak-claude-driver`.

State lives in `~/.local/state/claude-driver/` (`CLAUDE_DRIVER_STATE_DIR`):
`ledger.jsonl` (one row per write op: harness from MCP `clientInfo`, tier,
versions, ms, outcome, verified), `registry.json` (sessions and folders the
driver created, the delete queue), `capabilities.json` (probe results per
app|CLI version), `pending-learnings.jsonl`, `broker/`, `probe/`, `locks/`.

## Tools

The CLI mirrors every MCP tool: `claude-driver <tool> --arg value …` (or
`--json '{…}'`); `claude-driver tools` lists them.

| Tool | Tier | What it does |
|------|------|--------------|
| `driver_guide`, `driver_status`, `driver_learnings`, `driver_record_learning` | — | guidance, health (versions, broker, capability matrix, recent failures), findings, candidate learnings |
| `list_sessions`, `get_session`, `live_sessions`, `window_state` | A | disk ground truth; `window_state {precise}` adds the broker's `get_window_layout` |
| `create_session` | A (+B) | exact title/model/folder or `no_project`; optional `lock_title`, `group`, `first_message` |
| `fork_session`, `open_session`, `unarchive_session` | A (B fallback) | deep links; unarchive falls back to the broker for native sessions |
| `rename_session`, `pin_session`, `archive_session`, `set_session_config`, `send_message`, `manage_groups` | B | the app's own tools, verified on disk |
| `delete_sessions` | B | gated, queueable, always Taylor's card; cleans CLI leftovers of driver-created sessions |
| `archive_project` | B | dry run by default, gated to scratch/driver folders |
| `window_manage` | C | free-form window work in the Claude app via Codex |
| `broker_status` | A/C | broker state; `revive` |

Maintenance: `preflight`, `probe [--keep]`, `broker init|status|revive|stop`,
`install [--dry-run]`, `cleanup-leftovers <uuid>`.

## Verified mechanisms

Proven on app 2.9939.4 / CLI 2.1.284 (details and n-counts in findings.md).

**Create (Tier A, ~4 s).** In the target folder, with a clean environment,
run the app's bundled CLI for one trivial turn, then import it:
`env -i HOME USER PATH=/usr/bin:/bin TERM=dumb <bundled claude> -p <bootstrap>
--session-id <uuid> -n <title> --model <id> --strict-mcp-config`, then
`open claude://resume?session=<uuid>`; poll for `local_<uuid>.json` with the
right title and cwd.
- Clean env: a desktop-spawned process inherits a stale
  `CLAUDE_CODE_OAUTH_TOKEN` and 401s.
- Bundled CLI only (`~/Library/Application Support/Claude/claude-code/<newest>/`):
  Homebrew's lags and rejects current model ids.
- "No folder" = a new `scratch-workspaces/<acct>/<org>/scratch-YYYY-MM-DD-<6hex>`
  dir (the app's own regex); the active acct/org is the store with the newest
  record.
- A failed bootstrap still writes CLI files; the driver removes them.

**Import side effects** (every create and fork):
- The main window jumps to the new session and Claude comes to the front; the
  focus policy undoes both.
- It starts in acceptEdits even when the default is bypass.
- `titleSource` is `auto` until `lock_title` / `rename_session` sets `tool`.
- The bootstrap exchange is the first turn; send the real task with
  `first_message` so it runs visibly.

**Fork**: `--resume <cli id> --fork-session --session-id <new> -n <title>` in
the source cwd, then the same import. **Unarchive**: re-opening the import
link restores imported sessions. **Open**:
`claude://claude.ai/epitaxy/<local id>`.

**Ground truth on disk** (read only; the app rewrites these from memory):
- records: `claude-code-sessions/<acct>/<org>/local_<id>.json` (`title`,
  `titleSource`, `cwd`, `originCwd`, `isArchived`, `model`, `effort`,
  `permissionMode`, `cliSessionId`, `prs`)
- pins: `claude_desktop_config.json` `.preferences.epitaxyPrefs["starred-local-code-sessions"]`
- groups: same file, `["dframe-group-scopes"][<acct>/<org>]`
- live processes: `~/.claude/sessions/<pid>.json` (`hostSessionId`,
  `messagingSocketPath`, `status`, `peerProtocol`)
- focus: `~/Library/Logs/Claude/main.log` `LocalSessions.setFocusedSession:
  sessionId=…` (exact, timestamped); fallback the pane store and
  `lastFocusedAt`.

**Tier B — the broker.** The app's `ccd_*` tools exist only inside
desktop-hosted sessions, served over the app's private control channel. So
the driver owns one: `claude-driver-broker`, Haiku 4.5, cwd
`<state>/broker/` whose `CLAUDE.md` (from
[broker-template/CLAUDE.md](broker-template/CLAUDE.md)) is the standing
protocol, in the `claude-driver` sidebar group, in bypassPermissions (otherwise
archive, unarchive, pin and group moves of other sessions ask Taylor).
- **Resident loop.** The broker stays mid-turn running
  [scripts/broker-wait.mjs](scripts/broker-wait.mjs) (bounded 540 s wait,
  re-armed) that returns when `requests/<id>.json` appears; it runs the
  allowlisted ops verbatim and writes `results/<id>.json`. A session mid-turn
  is never idle, so the app's CLI governor (cap 8 here; evicts the LRU session
  idle ≥ 60 s when a warm spawn lands at the cap) never evicts it, and a
  request needs no delivery at all: 4–8 s per op. And because the app
  auto-resumes sessions that were mid-turn when it quit ("Relaunch
  auto-resume"), the resident broker comes back by itself after an app
  restart.
- **Waking it.** If the process is alive but not resident, the driver sends
  `claude-driver request <id> vN` over **peerProtocol v1 directly**
  ([lib/peer-direct.mjs](lib/peer-direct.mjs), ~0.2 s: unix socket, the
  receiver's own peerToken, one frame, from-mode matching the receiver's
  class), falling back to a headless Haiku `SendMessage` turn on unverified
  CLI versions. If the process is gone (app restart, eviction before it went
  resident), revival: focus it by deep link so the app warm-spawns it, and if
  the governor is at cap, Codex Computer Use types the wake line into its
  composer (a real send always spawns). Nothing outside the app can start a
  turn in an existing session (checked in the app bundle), so this is the
  only UI-free-when-possible path.
- **Desktop callers skip it.** When the MCP server's parent Claude Code
  process is a desktop session (found via `~/.claude/sessions/<ppid>.json`),
  Tier B tools return the exact `ccd_*` calls for the caller to make itself.

**Tier C** runs codex-bridge's engine in-process, granted only the Claude
app, told never to click approval or delete cards; results are claims that
the driver re-verifies on disk.

## Focus policy

Taylor's hard rule after a stale restore sent him to the wrong chat: snapshot
the main window's session and the frontmost app **immediately before** each
navigating op, never reuse a snapshot, and restore after the op only if the
main window still shows what the op navigated to — if Taylor moved, leave it.
Restores wait until main.log confirms them, so the next op's snapshot is
fresh; multi-step navigation (revival) is one snapshot and one restore. Modes:
`restore` (default), `show`, `leave`. Proven: a Codex-hosted create put the
main window and Arc (frontmost) back; a revival during which Taylor clicked
elsewhere left his choice alone.

## Safety gates

- **Delete** always goes through the app's own card (a consent token only the
  card issues, in every mode). The driver never clicks it, refuses pinned,
  running, open-PR sessions, you, and the broker unless `override`, keeps a
  delete queue for one batched card, and afterwards removes the CLI files the
  app leaves behind for sessions the driver created
  (`~/.claude/projects/*/<uuid>.jsonl` and `<uuid>/`, `session-env/<uuid>`,
  `security/security_warnings_state_<uuid>.*`, and a project dir left holding
  only an empty `memory/`).
- **archive_project** is a dry run unless asked, allowed automatically only
  for scratch-workspaces, the driver's state dir and folders it created;
  otherwise refused for git repos with commits, more than 3 sessions or open
  PRs unless Taylor approved `override`. There is no native "archive project"
  action in the app to lean on (checked in the bundle).
- **Self-archive** needs `confirm_self: true` (it ends the caller's turn).
- The app's files are never written.

## Continuous improvement

- Ledger → `driver_status` shows recent failures and op counts per harness.
- `probe` runs the canary suite (create → broker delivery → rename → pin →
  unpin → group → send → fork → archive → unarchive → cleanup) on throwaway
  sessions in `<state>/probe/` and writes `capabilities.json` keyed by
  app|CLI version; `preflight` re-probes on drift (fake it with
  `CLAUDE_DRIVER_APP_VERSION`); ops consult the matrix (e.g. unarchive skips
  the deep link when marked broken). Probe sessions are archived and queued
  for deletion; clear the queue with `delete_sessions {from_queue: true}` (one
  card).
- `driver_record_learning` appends to `pending-learnings.jsonl`; promote into
  findings.md only after re-verifying.
- The Claude skill `taylor-claude-drive` (in `~/.claude/skills/`) holds the
  judgment layer and its own memories.

## When the app changes

`preflight` flags version drift; `probe` shows which mechanism broke. To dig:
`app.asar` is a JSON header then file bytes (`header_size` = u32le at 4,
`json_len` = u32le at 12, header = JSON at 16, file base = 8 + header_size);
main-process code is `.vite/build/index.chunk-*.js`; start with
`claudeURLHandler`, `importCliSession`, `CliGovernor`, `titleSource`. For
peer-direct, re-verify the envelope against the new CLI with
`scripts/peer-send.mjs --verify-transcript` on a self-started target, then add
the version to `CLAUDE_DRIVER_PEER_VERIFIED` / `VERIFIED_CLI`.

## Tests

- `scripts/smoke.mjs`: end to end through the MCP launcher, ground truth from
  disk, cleanup by archive.
- `scenarios/<tier>/*.json`: t0 read-only … t6 destructive (see
  [scenarios/README.md](scenarios/README.md)).
- `probe` is the canary.

Verified against Claude desktop 2.9939.4, bundled Claude Code CLI 2.1.284 and
Codex CLI 0.159.0 on 2026-09-30.
