# codex-bridge

Lets Claude (Claude Code, or anything that speaks MCP) delegate macOS
Computer Use work to the local Codex agent. Claude describes the goal; Codex
drives the Mac through its Computer Use runtime (accessibility tree,
screenshots, clicks, typing) and reports back. Zero npm dependencies: Node
only, like the rest of `src/mcps`.

```
Claude ──MCP stdio──▶ bin/codex-bridge-mcp (server.mjs)
                         │  JSON-RPC over WebSocket-on-unix-socket
                         ▼
                 codex app-server daemon  ──▶ cua_repl (Computer Use) ──▶ macOS apps
                 (app-bundled CLI)
```

## Why the app-server, not `codex exec`

`codex exec` works for one-shot runs but is fire-and-poll: no progress, no
mid-task steering, no approvals, a fresh process per call. The app-server
protocol streams every item as it happens, lets the bridge answer Codex's
questions (which app may it use, may it run this command), supports
`turn/steer` and `turn/interrupt`, keeps one persistent thread per session,
and returns screenshots as data. `codex mcp-server` (Codex as an MCP server)
was removed in 0.154, so this is the supported surface.

## Requirements

- ChatGPT.app (or Codex.app) with Computer Use enabled. The bridge only uses
  the CLI bundled inside the app
  (`/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`).
  The standalone `codex` on PATH is not authenticated to the Computer Use
  service ([openai/codex#19544](https://github.com/openai/codex/issues/19544))
  and does not know the app's models; never point the bridge at it.
- Node ≥ 20 (resolved through `../lib/resolve-binary.sh`, not PATH).
- Accessibility and Screen Recording granted to "Codex Computer Use.app"
  (the app prompts for these the first time).

Check everything with:

```sh
~/dotfiles/src/codex-bridge/bin/codex-bridge preflight
```

## Register with Claude Code

```sh
claude mcp add codex-bridge -s user -- /Users/taylor/dotfiles/src/codex-bridge/bin/codex-bridge-mcp
```

## Tools

| Tool | What it does |
|------|--------------|
| `codex_computer_use` | Run a task. Blocks until Codex finishes; returns its report, a step log, approvals/denials, screenshot paths (last one attached as an image). `session` picks the Codex thread; `apps=[...]` grants app access for that session; `allow_commands`, `sandbox`, `output_schema`, `timeout_sec`, `model`, `effort`, `images`, `new_thread`. |
| `codex_steer` | Inject a message into the running turn on a session. Codex changes course within seconds. |
| `codex_interrupt` | Stop the running turn. The pending call returns `status: interrupted`. |
| `codex_approve_app` | Grant an app ahead of time, scope `session` or `always` (`revoke: true` to drop it). |
| `codex_close_session` | Archive the session's Codex thread on the daemon (freeing its MCP servers and Computer Use runtime) and forget the name. The next call with that name starts fresh. |
| `codex_status` | Connection, the bridge revision this server process runs versus the checkout, policy, grants, Computer Use permanent allowlist, sessions and whether each has a turn running. |

Long turns are fine: Claude Code's stdio tool timeout is ~28 h, it
auto-backgrounds calls over 2 min, and the bridge sends MCP progress
notifications for every step so the 30 min idle timeout never trips.

## Stopping a run

A `codex_computer_use` call blocks the Claude turn that made it, so Claude
cannot react to "stop" until the call returns. Three stop paths that do not
depend on that turn:

- **Kill switch from any terminal:** `~/dotfiles/src/codex-bridge/bin/codex-bridge stop`
  (or `stop --session NAME`). It interrupts every in-progress turn through
  the daemon, which reaches turns started by any bridge process of any age,
  and raises `~/.local/state/codex-bridge/STOP` for three seconds, which
  turns on current servers poll once a second. The pending call returns
  `status: stopped`; the session stays usable. Measured 2026-09-29: a
  running turn stopped 0.4 s after the command.
- **Touch the app.** Computer Use reports "The user changed '<App>.app'"
  when a human focuses or types into the app Codex is driving; the bridge
  treats that as terminal and interrupts, returning `status: user_took_over`
  rather than letting Codex re-focus the app and fight for it.
- **`codex_interrupt`** from Claude, when Claude is not the one blocked.

The default `timeout_sec` is 300; callers with a human at the keyboard
should set it lower and keep tasks short. `codex-bridge close SESSION`
archives a session's thread from a terminal when the session's own bridge
predates `codex_close_session`.

## Sessions and threads

Each session name maps to one persistent Codex thread, recorded in
`~/.local/state/codex-bridge/state.json`. A follow-up call on the same
session resumes the thread with full context; `new_thread: true` starts over.
Threads are real Codex threads: they appear in the Codex app's history and in
`codex agents`, so you can open one and watch or take over.

## Result statuses

`completed` is the only success. `needs_input`: Codex asked a clarifying
question; the bridge interrupted the turn and returned it (answer with the
next call on the same session). `interrupted`: `codex_interrupt` stopped it. `stopped`: the terminal kill
switch (`codex-bridge stop`) stopped it. `user_took_over`: Computer Use
reported a human using the app Codex was driving and the bridge stopped the
turn. `cancelled`: the MCP client cancelled the call. `timeout`:
`timeout_sec` expired and the bridge interrupted the turn. `failed`: Codex
reported an error (in `error`). `disconnected`: the connection to the
app-server dropped mid-turn; the daemon may finish the turn, but its result
is lost to this call, and the next call on the session reconnects.

## Standing instructions to Codex

Every bridge thread starts with `DEVELOPER_INSTRUCTIONS` from
`lib/bridge.mjs` as developer instructions. As of 2026-09-29 they say:
delegated run, no human at the keyboard; use Computer Use for anything
that needs the UI, prefer purpose-built tools; open and target apps by name
with `cua.getApp`, never via the Dock, Spotlight, Launchpad or Mission
Control (`7a8a75a`); no message before the first tool call and no
narration, do every listed step (`ed4fe2c`); `report_progress` only on
tasks over three steps; say which app was not approved and stop; no
irreversible action unless the task names it; leave the desktop as found,
close what you caused, quit what you launched, report anything left
(`9917f6e`); after quitting an app never call `cua.getApp` on it again,
confirm with `cua.getState()` (`9917f6e`); final message under 200 words,
outcome then evidence then blocked or assumed. The `docs/instructions/`
variants (lean, terse, no-preamble) are what experiment 12 compared; the
default equals `no-preamble`.

A Claude Code session starts this MCP server once and never reloads it, so
a session opened before a bridge commit keeps the old instructions (and
the old everything) for its whole life. `codex_status` prints the revision
the process loaded next to the checkout's HEAD (a `bridge:` line); a
status with no `bridge:` line is a server older than this paragraph, and
a result without a `timing:` line is another tell. Restart the Claude Code session to pick up
a commit. Task text should therefore carry the cleanup and no-Dock rules
itself rather than assume the bridge delivered them.

## Permissions: who says yes

Codex asks the client three kinds of questions mid-turn. Claude is blocked
inside the tool call, so the bridge answers from [`policy.json`](policy.json)
plus per-call grants, and reports every decision in the result:

- **App access** (`mcpServer/elicitation/request` from `cua_repl`,
  "Allow Computer Use to use Finder?"). Decided by `apps.deny` →
  per-call `apps=[...]` / `codex_approve_app` grants → `apps.always` →
  `apps.session` → `apps.unknown` (`deny` by default). Accepted apps are
  answered with `persist: session|always`; `always` makes Computer Use write
  the bundle id to
  `~/Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/Library/Application Support/Software/ComputerUseAppApprovals.json`,
  after which no thread is ever asked again. Session-scoped grants live per
  Codex thread in `~/.codex/computer-use/sessions/<threadId>.toml`, so a new
  thread (`new_thread: true`) has none and the bridge answers from policy and
  the call's `apps` again. A denied app makes Codex report "Computer Use was
  not approved to use X"; the result names it so Claude can re-run with the
  grant.
- **Shell escapes and file changes** (`item/commandExecution/requestApproval`,
  `item/fileChange/requestApproval`). Denied unless `allow_commands: true` or
  the policy says `accept`. Read-only sandboxed commands never ask.
- **Clarifying questions.** Codex asks through the `questions` field of an
  agent message and then waits for a reply, which would hang the call until
  the timeout. The bridge records the questions, interrupts the turn, and
  returns `status: needs_input` at once (about 6 s); the answer is simply the
  next call on the same session, and the thread keeps its context (2 s
  round trip measured). The experimental `item/tool/requestUserInput`
  server request is handled too, with a canned "proceed conservatively"
  answer, but was never observed in this configuration.
- **Sandbox escalation.** The policy lets Codex ask to escape the read-only
  sandbox (`sandbox_approval: true`); the bridge answers from `commands` /
  `allow_commands` and the result lists the denial. With `allow_commands`
  and `sandbox: workspace-write` the thread cwd is writable without asking.
- **Permission escalations** are always declined.

Computer Use itself is not sandboxed by `sandbox`; the app allowlist is the
control. The default policy denies password managers and System Settings.

## MCP roster on bridge threads

By default (`mcpRoster: "trim"` in `policy.json`) a bridge thread starts
with a `config` override that disables every MCP server and plugin in
`~/.codex/config.toml` except Computer Use. Measured 2026-09-29: boot drops
from about 3 s to about 1 s per new thread and uncached prompt tokens for a
one-step read from 22k to 7k, with no capability lost for desktop work.
Pass `mcp_roster: "full"` on the call that creates a session's thread when
Codex should also have Slack, Gmail, Notion, Playwright and the rest.

## Ops

```sh
codex-bridge run "Read-only: what is Finder's key window title?" --apps Finder
codex-bridge status
codex-bridge approve Notes --always
codex-bridge daemon status|start|stop|restart
node scripts/smoke.mjs        # end-to-end through the MCP launcher
```

The bridge prefers the managed daemon (`codex app-server daemon`), starting
it if needed and restarting it when its version differs from the bundled CLI
(a stale daemon after an app update would serve an old protocol). If the
daemon cannot be reached it spawns a private `codex app-server --listen
stdio://` child in its own process group and kills the group on exit. Logs:
stderr of the MCP server, plus `~/.local/state/codex-bridge/app-server.stderr.log`
for a spawned child. Screenshots land in `~/.local/state/codex-bridge/screenshots/`.

## Timelines and pressure testing

Every turn on a server started after `9917f6e` writes `~/.local/state/codex-bridge/timelines/<turnId>.jsonl`
(one event per hop: turn start, each item, each server request and the
bridge's answer, screenshots, completion, result size) and a `.json` twin
with the metrics: setup, boot (Codex starting its MCP servers), Computer
Use call time, model time, tokens, result bytes. The result text ends with
a one-line `timing:` breakdown and the timeline path, and the MCP result
carries the same data as `structuredContent`.

`scripts/pressure.mjs` runs scenario files from `scenarios/` through the
launcher exactly as Claude Code does and appends a ledger row per run
(`~/.local/state/codex-bridge/pressure/<date>/ledger.jsonl`). The plan and
the scenario tiers are in [docs/pressure-testing.md](docs/pressure-testing.md);
the file format is in [scenarios/README.md](scenarios/README.md).

```sh
node scripts/pressure.mjs --list
node scripts/pressure.mjs --tier t0 --attended      # scenarios that raise windows need --attended
node scripts/pressure.mjs scenarios/t0/finder-read.json --repeat 5 --effort low
```

Sizing: `screenshots: "all"` with six emitted shots returned a 1.9 MB
result (six inline images); use it on short tasks. Inside Codex, the
`cua_repl` `js` tool truncates its output at 25k tokens (ask for the key
window or a named element, not "the whole app") and has a 120 s startup
timeout, so a cold Computer Use boot can exceed a 30 s `timeout_sec`.

## Protocol notes learned the hard way

- `unix://` and `ws://` listeners speak WebSocket (the unix one is an HTTP
  101 upgrade on the socket); raw JSON lines get silence. `lib/ws-unix.mjs`
  is a minimal client. The control socket is a symlink into
  `/private/tmp/codex-daemon-<uid>/`; connect to the realpath because macOS
  caps AF_UNIX paths at 104 bytes.
- A screenshot result is one JSON line of ~200 KB. Line readers with a fixed
  buffer (Python asyncio's 64 KB default) throw and it looks like a hang.
- With `approvalPolicy: never` Codex auto-declines app elicitations, so
  Computer Use silently fails for every app not on the permanent allowlist.
  The bridge uses the granular policy with `mcp_elicitations: true`.
- `approvalsReviewer: auto_review` reviews commands, not app elicitations.
- With the full roster every thread boots every MCP server in
  `~/.codex/config.toml` (2-3 s before the first item); the trimmed roster
  (default since `158d7a3`) makes it about 1 s.
- Passive clients on the shared daemon only see `thread/started` and
  `thread/status/changed` for other clients' threads, never items; the bridge
  also filters by thread id and declines any server request for a thread it
  does not own.
- Codex's `dynamicTools` on `thread/start` are undocumented in the v2 schema
  but work on 0.158; the bridge registers `report_progress` so Codex can post
  milestones that flow out as MCP progress.

Verified against codex-cli 0.158.0-alpha.2.1 (ChatGPT.app 26.924) on
2026-09-28. Re-run `preflight` and `scripts/smoke.mjs` after app updates.
