# claude-driver findings

Dated, newest first. Each entry: what was observed, the evidence, and n
(independent observations). Promote a pending learning
(`<state>/pending-learnings.jsonl`) here only after re-verifying it.
Versions: app = Claude desktop, cli = bundled Claude Code.

## 2026-09-30 (app 2.9939.4, cli 2.1.284)

- **The app reaps idle session processes after 30 min.** main.log:
  `[WarmLifecycle:preview] Starting idle timeout for <id>: 1800s` when focus
  leaves a session, then `Idle timeout reached, disconnecting <id>`. The broker
  died 38 min after its last request. So the broker is usually asleep and
  revival is on the critical path for the first op after idle. n=many (log).
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
