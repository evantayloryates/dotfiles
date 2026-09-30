# claude-driver findings

Dated, newest first. Each entry: what was observed, the evidence, and n
(independent observations). Promote a pending learning
(`<state>/pending-learnings.jsonl`) here only after re-verifying it.
Versions: app = Claude desktop, cli = bundled Claude Code.

## 2026-09-30 (app 2.9939.4, cli 2.1.284)

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
