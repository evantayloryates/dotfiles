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
| `codex_status` | Connection, policy, grants, Computer Use permanent allowlist, sessions and whether each has a turn running. |

Long turns are fine: Claude Code's stdio tool timeout is ~28 h, it
auto-backgrounds calls over 2 min, and the bridge sends MCP progress
notifications for every step so the 30 min idle timeout never trips.

## Sessions and threads

Each session name maps to one persistent Codex thread, recorded in
`~/.local/state/codex-bridge/state.json`. A follow-up call on the same
session resumes the thread with full context; `new_thread: true` starts over.
Threads are real Codex threads: they appear in the Codex app's history and in
`codex agents`, so you can open one and watch or take over.

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
  after which no thread is ever asked again. A denied app makes Codex report
  "Computer Use was not approved to use X"; the result names it so Claude can
  re-run with the grant.
- **Shell escapes and file changes** (`item/commandExecution/requestApproval`,
  `item/fileChange/requestApproval`). Denied unless `allow_commands: true` or
  the policy says `accept`. Read-only sandboxed commands never ask.
- **User-input questions** (`item/tool/requestUserInput`). Nobody can answer
  live, so Codex is told to proceed on best judgment and stop before anything
  irreversible; the questions come back in the result for a follow-up call.
- **Permission escalations** are always declined.

Computer Use itself is not sandboxed by `sandbox`; the app allowlist is the
control. The default policy denies password managers and System Settings.

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
- Every thread boots every MCP server in `~/.codex/config.toml` (2–3 s before
  the first item). Trim that file, or accept the cost.
- Passive clients on the shared daemon only see `thread/started` and
  `thread/status/changed` for other clients' threads, never items; the bridge
  also filters by thread id and declines any server request for a thread it
  does not own.
- Codex's `dynamicTools` on `thread/start` are undocumented in the v2 schema
  but work on 0.158; the bridge registers `report_progress` so Codex can post
  milestones that flow out as MCP progress.

Verified against codex-cli 0.158.0-alpha.2.1 (ChatGPT.app 26.924) on
2026-09-28. Re-run `preflight` and `scripts/smoke.mjs` after app updates.
