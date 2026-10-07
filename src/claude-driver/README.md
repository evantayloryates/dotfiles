# claude-driver

Lets any harness (Claude Code desktop or CLI, Codex, Cursor, OpenCode, a
script) drive the Claude desktop app: create sessions with an exact title,
model and folder; fork, open, rename, pin, group, archive, unarchive and
delete them; change model, effort and permission mode; send messages; read
what the main window shows. Zero npm dependencies, like
[`../codex-bridge`](../codex-bridge/README.md), whose conventions it copies.
Native UI leases additionally use macOS Swift/CoreGraphics for a read-only
input-filter audit; an unavailable audit prevents UI automation. Current lock
serialization also requires `/usr/bin/python3` with stdlib `fcntl`, invoked in
isolated mode. Node retains the kernel-owned descriptor after that short helper
exits, so paused or killed clients cannot lose ownership based on lock age.
Persistent `locks/*.mutex` files must never be unlinked while clients may hold
them. The directory guard remains for compatibility; full qualification requires
fresh runtimes. Helper failure refuses the operation without a directory-only
fallback. This reuses the kernel-lock pattern already used by the 1Password
service, without changing that service.

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

The v2 control interface adds durable jobs, explicit stop/queue/interrupt,
incremental transcript observation and shared service memory. Isolated
lifecycle and native broker controls have dedicated qualification evidence.
Fresh MCP processes and the CLI use v2; this chat's older MCP binding still
needs refresh. Physical typing initially recovered, then duplicated characters
and pastes recurred on 2026-10-06. The UI quarantine is active again. Two active
Computer Use keyboard filters targeting Claude survived JS reset; retiring
that helper removed both filters. Taylor subsequently confirmed input and a single manual broker wake working
again, with matching paste/send screenshots. Complete native-helper teardown
qualification remains pending; the quarantine stays active. Each UI lease now audits
helper-owned Claude keyboard filters before and after execution, including
failed/cancelled leases. Surviving filters or an unavailable audit quarantine
further UI work; this never kills another caller's helper. Native broker controls
and isolated tests remain usable without UI automation. See
[qualification](docs/v2-qualification.md).

The [continuity checkpoint](docs/resume.md) records current qualification.
The active broker dependencies are sealed and pinned independently of host edits.
A native receipt proved cached workspace commands delegate through the validated
sealed bootstrap; the workspace entry shim remains the startup boundary. The
latest full native run failed after its initial reply/cancel checks: Haiku ended
turns with “Broker running” without serving queued work. Earlier eleven-check
passes are historical, not current readiness. See the checkpoint for exact builds.

Current CLI 2.1.289 direct peer delivery is verified against installed receiver
functions and correlated native msg_ids (155–159 ms), removing the sender's
inference turn. Delivery does not prove service execution. An exact correlated
native wake that ends without tools while the same process is idle now cancels
unclaimed work with `broker_not_serving`, without repeated wakes. The native
failure guard passed in 3.35 s; the existing owned test fixture remains unarchived.

A sealed local LaunchAgent senses the exact broker every 30 seconds without
inference, input, recovery or private transcript/key reads. Changed metadata
publishes sanitized atomic reports into `/Users/taylor/Desktop/temp_reports`;
unchanged ticks are silent. It detected the actual unserved cleanup request.
The Codex inbox watcher checks every 30 seconds; its scheduled runs still use
Codex inference. The Claude observer's verified hourly job is fallback recovery,
not the fast detection path. Event-triggered Claude recovery is not connected.
Natural governor pressure, unattended cold recovery, different-build rollback
and native-helper teardown remain unqualified; keyboard automation stays
quarantined. Codex-driver fixes and 1Password work remain separate.

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
V2 also stores private `jobs/`, `memory.jsonl` and qualification reports in
`pressure/`. Automatic memory records contain operation metadata rather
than prompts or transcript content.

Isolated qualification (no Claude UI actions or desktop turns):

```sh
node src/claude-driver/scripts/pressure-v2.mjs --repeat 5
```

Full live qualification uses `node src/claude-driver/scripts/live-v2.mjs
--live`, after physical typing recovery is confirmed. A separate scoped run
uses `--live --broker-only --session local_<owned-fixture>` while quarantined;
`--restore-fixture` permits native unarchive of that same scratch fixture.
It checks delivery, cancellation, concurrent and batched controls, queue/interrupt
and cleanup, without creating/importing sessions or automating input.
`--live --input-free` instead qualifies one new synthetic CLI bootstrap/import
and independently reads back focus restoration, with input-filter audits before
and after. It requires a current live broker and active quarantine; its operation
allowlist binds one private scratch recipient and owned jobs. Navigation into
user chats, permission changes, broker recovery and Computer Use are excluded. Interrupting that script cancels its owned jobs,
records unfinished cleanup and stops further app controls. Qualification
requires every named check; partial runs cannot pass.

Headless harness qualification uses `scripts/harness-v2.mjs --harness claude`
or `--harness codex --codex-model gpt-6.1-sol`. The filtered MCP relay only
allows the script's private synthetic session and read-only durable jobs;
it cannot send or drive the desktop. Actual Claude and Codex model runs
passed the guide/read/idempotency/wait/events/memory workflow. Cursor's
attempt stopped at CLI authentication. These results qualify fixture API
use, not native app controls. Reports live in private `pressure/` state.

## Tools

The CLI mirrors every MCP tool: `claude-driver <tool> --arg value …` (or
`--json '{…}'`); `claude-driver tools` lists them.

| Tool | Tier | What it does |
|------|------|--------------|
| `driver_guide`, `driver_status`, `driver_learnings`, `driver_record_learning` | — | guidance, health (versions, broker, capability matrix, recent failures), findings, candidate learnings |
| `list_sessions`, `get_session`, `live_sessions`, `window_state` | A | disk ground truth; `window_state {precise}` adds the broker's `get_window_layout` |
| `create_session` | A (+B) | exact title/model/folder or `no_project`; optional `lock_title`, `group`, `first_message`, `require_pool`; returns a pre-message observation cursor |
| `fork_session`, `open_session`, `unarchive_session` | A (B fallback) | deep links; unarchive falls back to the broker for native sessions |
| `rename_session`, `pin_session`, `archive_session`, `set_session_config`, `send_message`, `manage_groups` | B | the app's own tools, verified on disk |
| `delete_sessions` | B | gated, queueable, always Taylor's card; cleans CLI leftovers of driver-created sessions |
| `archive_project` | B | dry run by default, gated to scratch/driver folders |
| `window_manage` | C | free-form window work in the Claude app via Codex |
| `broker_status` | A/C | broker state; `revive`; explicit `warm_only` uses audited native navigation without Computer Use |
| `driver_submit`, `driver_job`, `driver_wait`, `driver_cancel`, `driver_request` | — | durable jobs, idempotency, bounded waits and read-only late receipt reconciliation |
| `session_events`, `session_wait` | A | bounded transcript cursors; assistant text requires opt-in |
| `stop_session`, `steer_session` | B | verified stop, queued follow-up or stop followed by replacement |
| `driver_memory_record`, `driver_memory_query` | — | shared technical observations with evidence and confidence status |

`set_session_config` accepts `title`, `pinned`, `model`, `effort` and
`permission_mode` together. It sends one native request and verifies each
requested field. This reduces broker round trips; it is not transactional.
A partial failure returns the request ID, completed native results and
`retrySafe:false`. Inspect `driver_request` and recipient state before
applying only the remaining changes; do not replay the entire batch.

For a cold broker, `broker_status {revive:true, warm_only:true}` attempts
only a native deep link, with focus restoration and before/after input
filter audits. It works under UI quarantine without loading Computer Use.
At Claude's process governor cap it returns `broker_wake_required` promptly;
a human wake is still needed. This explicit option does not enable automatic
UI fallback or promise unattended cold recovery.

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
- Clean env plus the dotfiles .env `setup-token` token (never the Keychain):
  a desktop-spawned process inherits a stale `CLAUDE_CODE_OAUTH_TOKEN` and 401s.
- Bundled CLI only (`~/Library/Application Support/Claude/claude-code/<newest>/`):
  Homebrew's lags and rejects current model ids.
- "No folder" = a new `scratch-workspaces/<acct>/<org>/scratch-YYYY-MM-DD-<6hex>`
  dir (the app's own regex); the active acct/org is the store with the newest
  record.
- A failed bootstrap still writes CLI files; the driver removes them.

**Import side effects** (every create and fork):
- The main window jumps to the new session and Claude comes to the front; the
  focus policy undoes both.
- It starts in acceptEdits even when the default is bypass. That is why a
  bypass create does not import at all: see **The bypass pool** below.
- `titleSource` is `auto` until `lock_title` / `rename_session` sets `tool`.
- The bootstrap exchange is the first turn; send the real task with
  `first_message` so it runs visibly.

**The bypass pool** ([lib/pool.mjs](lib/pool.mjs), registry key `pool`). The
app clamps every import to acceptEdits and mints the consent for a raise only
from Taylor's click on its card, so there is no programmatic way to *make* a
bypass session. There is a supported way to *reuse* one: a session Taylor
already put in bypass keeps that mode across `/clear`, archive and unarchive.
- `pool_release`: gate (bypass already, not pinned / working / unattended /
  self / broker, no open PR) → the session runs the recycle message
  (`unbind_pr`, then `clear_session self`; the app drops `cliSessionId`
  from the record, which is the on-disk proof of a clean context) → retitle
  `pool · <folder> · idle`, archive. The old transcript stays in
  `~/.claude/projects` and under "Resume previous session".
- `create_session` with bypass intended: `claim()` picks a ready member
  parked in that folder under a lock, then Tier B: unarchive, title, model,
  effort, group, `first_message`. The pool is per folder: a move
  (`change_directory`) only applies after the session's turn ends and an
  untrusted folder raises a trust prompt for Taylor, so claims never move.
  Every one of those is a call the app runs without asking for a bypass
  caller. ~15 s end to end, no window navigation.
- `pool_status` reconciles the registry against disk: an entry whose record
  is gone, not bypass, or in use again is dropped; a claim never acted on
  returns to the pool after 10 min.
- When the app ships `start_session` to this account (behind a server gate
  on 2026-10-02; its child "runs in this session's permission mode"), prefer
  it and retire the pool.

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
- **Resident loop.** The intended relay waits in the foreground, obtains each
  operation from a durable request/checkpoint and calls the app's own tools.
  Native cron maintenance is reconciled after IDLE, with current-process
  freshness requirements. Prompted residency has failed in real tests; a busy
  Bash wait alone did not prevent governor eviction. Neither model assurances
  nor a matching instruction file establish residency, protection or readiness.
- **Waking it.** Ordinary clients send the exact compatible
  `claude-driver wake v6` over qualified **peerProtocol v1 directly**
  ([lib/peer-direct.mjs](lib/peer-direct.mjs)), without an inference sender.
  Unqualified versions use the explicit legacy inference-sender path in auto
  mode; requested direct mode fails closed. Owned authentication keys, unique
  live PID/start epoch and matching CLI session are required. Partial writes,
  invalid keys and refused identities do not fall through to another send.
  A correlated end-turn without tools while the exact process is idle returns
  `broker_not_serving` for still-unclaimed work. Reconcile dispatched/unknown
  outcomes before replay. Offline recovery belongs to the independent observer;
  input fallback remains quarantined. App restart and natural-pressure recovery
  are not currently qualified.
- **Desktop callers skip it.** When the MCP server's parent Claude Code
  process is a desktop session (found via `~/.claude/sessions/<ppid>.json`),
  Tier B tools return the exact `ccd_*` calls for the caller to make itself.

**Tier C** reuses codex-bridge's engine in a private worker with forced stdio
transport, its own state directory and a serialized UI lease. It neither
connects to nor restarts the shared Codex daemon. The worker targets only
Claude through native Computer Use; shell, recursive bridge calls and
approval cards are excluded. Wake input uses paste, an empty composer and
exact readback before one Return. Structured send claims still require
verified broker liveness. Each lease records transport/version, metrics and
private evidence; the worker explicitly archives its temporary backend thread before closing
the process connection. Backend exit or JS reset alone did not prove removal
of the shared native helper's keyboard filters. UI fallback remains quarantined
until that lifecycle is qualified.

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
the version to the reviewed `VERIFIED_CLI` source allowlist only after
installed-receiver checks and an independently correlated native msg_id. There
is no environment override. Transport acceptance does not qualify model serving.

## Tests

- `scripts/smoke.mjs`: end to end through the MCP launcher, ground truth from
  disk, cleanup by archive.
- `scenarios/<tier>/*.json`: t0 read-only … t6 destructive (see
  [scenarios/README.md](scenarios/README.md)).
- `probe` is the canary.

Original mechanism qualification verified against Claude desktop 2.9939.4, bundled Claude Code CLI 2.1.284 and
Codex CLI 0.159.0 on 2026-09-30.

V2 qualification on 2026-10-06 uses source fingerprints and retained private
reports. Current native environment is Claude desktop 2.19675.0 / bundled CLI
2.1.286; comprehensive live qualification remains unfinished.
See [v2 qualification](docs/v2-qualification.md) for evidence and outstanding
checks, including refreshing this chat's still-legacy MCP connection.
