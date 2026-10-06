# claude-driver findings

Dated, newest first. Each entry: what was observed, the evidence, and n
(independent observations). Promote a pending learning
(`<state>/pending-learnings.jsonl`) here only after re-verifying it.
Versions: app = Claude desktop, cli = bundled Claude Code.

## 2026-10-06 (app 2.19675.0, cli 2.1.286)

- **Offline v2 iteration: 38 checks passed in five fresh runs (190 checks).**
  Report: `<state>/pressure/v2-2026-10-06T20-06-05-870Z.json`; runtime source
  and suite fingerprints were unchanged throughout. The actual MCP launcher
  was tested with independent clients, a synthetic broker and detached
  workers. This qualifies lifecycle/protocol behavior, not native tools or
  actual Codex/Cursor/Claude headless harness runs. Live qualification stays
  stopped pending physical typing recovery. Scope and remaining evidence:
  `docs/v2-qualification.md`.
- **Stop/replacement must serialize per recipient.** Two independent MCP
  clients produced stop/send/stop/send, never stop/stop/send/send. Direct
  controls and jobs bind title references before waiting, preventing a
  different chat taking the old title from becoming the recipient. Worker
  identity retains the original caller's self-protection gate. Cancellation
  between verified stop and replacement reports `partial_effect` with the
  known stopped state and no replacement sent.
- **Pool publication and registry updates require ownership.** Twelve
  independent processes retained all registry updates. Parking members cannot
  be claimed before native state verifies; eight concurrent claimants got
  one owner. A partial unarchive/configuration failure keeps its claim
  reserved, even after the former stale-claim age. An unarchived member cannot
  be silently returned as ready.
- **Shared evidence needs bounded reads and source identity.** Memory and
  recent-ledger reads now scan backwards with bounded memory. Unicode,
  multi-chunk and oversized records were exercised. Both learning entry
  points write one canonical candidate store; legacy pending entries remain
  readable. Memory records include the actual runtime source fingerprint.
- **A configured MCP process can still serve old code.** A read through this
  Codex chat's connected MCP returned driver `706a338`, without `apiVersion`
  or a runtime fingerprint, after source iteration. Fresh launcher tests
  expose v2. This chat's connection needs refresh and subsequent readback;
  source/commit presence alone is not evidence of runtime activation.

- **Physical typing duplication incident remains under investigation.** Taylor
  reported that one physical key produced two characters, only in Claude
  Desktop, severely affecting use. Live qualification was stopped and its
  outstanding request cancelled; no durable bridge jobs remained running.
  Resetting the current CUA session was followed by a single `q` key producing
  `q`. A supported View → Reload reset the renderer; separate `a`, `b`, `c`
  presses then produced `abc`, and three Backspace presses cleared it. No test
  text was sent. Those are synthetic-key observations, not physical-keyboard
  verification or a proven root cause. Physical readback is still required.
  Inspected Hammerspoon/Karabiner configs showed no Claude-specific key replay.
- **Broker heartbeat alone does not prove a running wait loop.** The broker
  ended its turn after a result, leaving a recent `working` heartbeat while
  its live status was idle. Requests then waited without being picked up.
  Residency now also requires busy/working live status; pending unclaimed
  requests receive bounded direct re-wakes. A CLI 2.1.286 peer wake produced
  a correlated native request/result, qualifying that version for broker
  delivery. Native controls still require the broker model and are serialized.
- **V2 lifecycle isolation passed; full live qualification did not.** The
  21-check suite passed in five independent processes (105 checks), covering
  cancellation, duplicate claims/dispatch, expiry, malformed results, dead
  workers, idempotency, locks, transcript cursors and private memory records.
  Report: `<state>/pressure/v2-2026-10-06T19-44-48-937Z.json`.
  Live session creation, idempotent send/reply and rename/pin/config readback
  passed. The queue fixture failed because Claude refused a bare Bash sleep;
  its report retains the failure rather than qualifying interruption/queue.
  A bounded Node fixture replaced it, but that rerun was stopped for the
  keyboard incident. Cross-harness live pressure coverage remains unfinished.
  Automatic shared memory stores operation metadata, not prompts or replies.


## 2026-10-02 (app 2.19675.0, cli 2.1.286)

- **A bypass session keeps bypass across clear, archive and unarchive, with
  no card.** local_13cc48b7 (merged #6463, bypass): `unarchive_session` →
  recycle message → it called `unbind_pr` and `clear_session self` → record
  lost `cliSessionId` (old id moved to `priorCliSessionIds`), old transcript
  still on disk → retitle, archive, unarchive → new brief ran Bash (curl,
  python), Write outside the project and an MCP tool with
  `permissionMode: bypassPermissions`, `prior_context=none`, and 0
  `Emitted tool permission request` lines in main.log for the whole run.
  n=2 claims, n=4 recycles.
  main.log: `[permissionMode] spawn … requested=bypassPermissions
  effective=bypassPermissions` on each respawn. Recycle turn 9–13 s.
- **A pooled session cannot be moved to another folder reliably.**
  local_980dfefa: `change_directory` to an untrusted folder logged
  `pending cwd apply … needs_trust` (a workspace-trust prompt for Taylor,
  which times out by itself), and the brief queued behind the move turn ran
  before the move applied, in the old cwd. Bypass held (0 permission
  requests). The pool is therefore per folder; claims never move. n=1.
- **Import clamp and consent mint unchanged in 2.19675.0.**
  `resolveImportedPermissionMode` still maps Bypass → AcceptEdits;
  `redeemPermissionModeConsent` still requires the card's token.
- **`start_session` exists but is server-gated off** (`ZW("2371478310")`;
  when on it replaces `spawn_task`). Its description: "It runs in this
  session's permission mode unless permission_mode names a lower one". That
  is the native answer once the gate opens for this account.
- **A session can decline a relayed recycle.** local_01041b19 (#6466) held:
  it had an open question for Taylor. Correct; the recycle message now tells
  a session to answer "recycle declined: <why>" in that case. n=1.
- **`prs` in the record keeps a MERGED entry after `unbind_pr`**;
  `ccd_pr get_status` reports `bound: false`. `openPrs()` ignores merged
  entries, so gates are unaffected. n=1.

## 2026-09-30 (app 2.9939.4, cli 2.1.284)

- **Imports can never be bypass; other modes survive.** App code
  `resolveImportedPermissionMode` clamps `Bypass → AcceptEdits` whether the
  mode comes from the transcript or the settings default. Probe P1: bootstrap
  `--permission-mode bypassPermissions` → acceptEdits; `--permission-mode
  default` → default. n=1 each (+4 earlier bypass-default imports). Raising
  afterwards needs the app card's consent token in every mode, including
  from a bypass caller: main.log shows `Emitted tool permission request … for
  set_session_permission_mode` then a renderer `respondToToolPermission …
  decision=once, hasUpdatedInput=true` (a human click) before every raise.
  n=2 (broker 2026-09-29, 58 s to approve; local_980dfefa from a bypass
  caller 2026-09-30, 9.5 min to approve — reported by that caller as "no
  card", corrected from the log). Full analysis
  and options: [strategy-bypass-create.md](strategy-bypass-create.md).
- **A scheduled-task run is the only UI-free native create, and it is
  unattended.** `create_scheduled_task` + `run_scheduled_task` produced a
  bypass session (`bypassChosenInApp: true`, cwd = the creating session's) in
  ~5 s with no card. But `send_message` refuses it ("is unattended"), and
  `change_directory` on itself raised a permission prompt despite bypass.
  n=2 runs.
- **`claude://code/new?folder=` does not set the composer's folder** (it kept
  the last project, for a trusted and an untrusted folder); the composer's
  mode label read "Bypass permissions". n=2 / n=3.

- **Batched delete, desktop path.** `delete_sessions {from_queue}` from a
  desktop session handed back one `delete_session` call for 14 queued test
  sessions; one card, Taylor approved, all 14 records gone. The app left 68
  CLI files behind for them (transcripts, `<uuid>/` dirs, session-env,
  security state, empty project dirs); `delete_sessions {cleanup_only}`
  removed them. Gates: the broker and the caller were refused; archive_project
  on the dotfiles repo refused (1387 commits, 8 sessions), on the probe
  folder allowed. n=1.

- **A resident broker survives an app quit and relaunch with no revival.**
  At quit the app logged `unhealthy cycle for <broker> (1211s, …,
  reason=app_quit)` and stopped it; on relaunch `[CCD] Relaunch auto-resume:
  ran — warmed 2 of 2 eligible (2 marked)` warmed it and sent it a message,
  and it was resident again (heartbeat `waiting`) before any driver call.
  Sessions mid-turn at quit are marked and auto-resumed; the resident loop
  keeps the broker mid-turn by design. The same 1211 s cycle shows the
  540 s wait re-arming across IDLE returns. n=1 (real quit by Taylor).

- **Pressure tests.** (1) Faked app version (`CLAUDE_DRIVER_APP_VERSION`):
  preflight saw no matrix for the key and ran the full probe, all pass. (2)
  Three concurrent CLI harnesses (rename, pin, effort on one session): the
  broker lock serialized them, all three landed, 18 s total. (3) Broker
  process killed (as an app restart would): the next plain-CLI request
  revived it via Tier C (governor at cap) and returned the layout in 26 s,
  main window and Arc (frontmost) restored. (4) Codex 0.159 (bundled CLI) in
  a read-only sandbox with approval_policy never: create in a named folder
  (focus restored: main window and front app), pin, rename, unpin, archive,
  all verified, ~4–5 s each; the MCP server runs outside Codex's sandbox so
  `open` and state writes work. Codex gates tools annotated
  `destructiveHint` behind approval (archive was, wrongly; now only delete
  and archive_project are). (5) cursor-agent: `mcp enable` approves per
  workspace (`~/.cursor/projects/<ws>/mcp-approvals.json`); its client lists
  all 22 tools; a model-driven call needs `cursor-agent login`. n=1 each.

- **Resident broker: never idle, never evicted, no delivery hop.** The broker
  stays mid-turn in a bounded Bash wait (`scripts/broker-wait.mjs`, 540 s,
  re-armed) that returns when a request file appears. The governor only
  evicts sessions idle ≥ 60 s, and a session mid-turn is not idle. Requests
  are just files: 4.3 s and 7.0 s per op with Haiku, versus 8–19 s plus a
  wake before. Heartbeat file tells the driver it is resident. n=3.
- **A peer message's trigger line is inside an envelope.** The receiver sees
  `Another Claude session sent a message:` then `<cross-session-message
  from-name=… from-mode=…>` around the text; a protocol that says "first line
  exactly" makes Haiku reply `ignored`. Protocol v4 names the envelope. n=1.
- **A ccd `send_message` to a live idle session can go undelivered.**
  `peer input … drew no acknowledgement from the CLI in 45001ms — settled as
  undelivered`, right after the broker's previous turn; a direct peer frame
  landed at once. n=1.
- **Asar (2.9939.4): nothing outside the app can start a turn in an existing
  session.** Every `claude://` route, universal link and Handoff only
  navigates the main window; `code/new?q=` only fills a new-session composer;
  scheduled tasks always make new sessions. Governor cap =
  max(6, floor(RAM / 3 GiB)) = 8 here, fixed; it is soft for real sends and
  only warm spawns yield; eviction happens when a warm spawn lands exactly at
  the cap (LRU session idle ≥ 60 s). `[WarmLifecycle:preview]` 1800 s stops
  preview dev servers, not the CLI. No native "archive project" action in the
  main-process bundle (the sidebar is the remote web UI); no route opens a
  pop-out window. n=1 (code reading).

- **The CLI governor caps live session processes at 8 and evicts idle ones
  under pressure.** `[CliGovernor] at cap=8; would evict <broker> (idle 53s)
  for user spawn`, then `pressure evicting <broker> (idle 89s)` → `Pausing
  session (governor_evict)`. On a busy day the broker is evicted within
  minutes of each use, so most non-desktop Tier B calls pay a revival. A
  real send ("user spawn") evicts someone else's idle process; a focus warm
  spawn just yields. n=2 evictions.
- **Tier C revival conflicts with Taylor using the app.** In the first probe,
  Codex found the main window showing Taylor's session instead of the broker
  (he was clicking) and correctly refused to type (3 of 4 revivals). n=4.

- ~~The app reaps idle session processes after 30 min.~~ Retracted: that
  1800 s timer stops preview servers; the broker's deaths were governor
  evictions (below and above). n=code reading.
- **Focusing a session warm-spawns its process — unless the CLI governor is
  at cap.** `Warming session <id>` on focus; with many live sessions:
  `[CliGovernor] at cap; yielding warm spawn` and no process appears. Warm
  revival therefore fails on a busy day. n=3 (all at cap).
- **Tier C revival works when warm spawn is capped.** Codex Computer Use
  typed `claude-driver wake v2` into the broker's composer; the process was
  live 21 s after the op started. A real send spawns regardless of the cap.
  n=1.
- **Focus restore can race the app.** Snapshotting right after a restore's
  deep link read the pre-restore focus (the app had not processed it yet).
  Fixed: a restore now waits until main.log confirms the restored session, and
  revival is one snapshot/one restore. n=1.
- **main.log gives exact focus.** `LocalSessions.setFocusedSession:
  sessionId=local_…` lines, timestamped, track every main-window switch
  (Taylor's clicks and deep links alike). Matched `get_window_layout`. n=3.
- **The focus policy correctly stood down when Taylor moved.** During a
  revival Taylor clicked another session; the driver reported "left alone"
  instead of yanking him back. n=1.
- **Groups are on disk.** `claude_desktop_config.json`
  `.preferences.epitaxyPrefs["dframe-group-scopes"][<acct>/<org>]` has
  `groups`, `assignments` (`code:<local id>` → group id) and `order`. n=1.

## 2026-09-29 (app 2.9939.4, cli 2.1.284)

- **peerProtocol v1 spoken directly: 0.16–0.26 s, no LLM hop.** One unix
  socket connection per message, auth line with the receiver's own peerToken
  (key file `sessions/<pid>.<sha256(resolved socket path)>.key`), one frame,
  half-close; no ack. Delivered into a self-started CLI target (transcript
  origin `kind: peer`) and into the broker (results returned). n=6.
- **The receiver gates on permission-mode class.** from-mode `bypass` vs
  `prompting` must match the receiver's class or the message is held for
  approval (a card). The driver claims the broker's own class. n=2.
- **Broker needs bypassPermissions.** archive, unarchive, pin/move of other
  sessions and renaming user-titled sessions ask Taylor outside bypass (tool
  descriptions, confirmed by the app). One card from Taylor switched it. n=1.
- **Changing a session's permission mode ends its idle process.** The broker
  process was gone right after `set_session_permission_mode`; the next send
  respawned it (slow: >20 s). n=1.
- **Broker latency.** Cold (tool schemas not yet loaded) ~19 s for two ops;
  warm ~8–12 s per request with Haiku 4.5. Delivery itself 0.16 s. n=5.
- **`set_session_title` on self sets `titleSource: "tool"`** even when the
  title is unchanged. n=1.
- **Disk focus snapshot = `get_window_layout`.** `desktop-frame.paneStore.v1
  .state.lastPrimaryCodeSession` and the newest `lastFocusedAt` both named the
  focused main pane. Superseded as primary source by main.log (above). n=2.
- **Create + restore: ~4 s with Haiku,** the main window jumped to the new
  session and back to the prior one. Imported sessions start in acceptEdits,
  `titleSource: auto`. n=3.
- **The MCP server can find its desktop host.** Its parent process is the
  Claude Code process; `~/.claude/sessions/<ppid>.json` names
  `hostSessionId`, so `"self"` resolves without any env var. n=1.
- Research-session findings (import, fork, unarchive link, env -i, bundled
  CLI, ruled-out CDP) are in [brief.md](brief.md) §3.
