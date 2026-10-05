# record-screen

An always-on screen-recording engine that agents drive through a
`record-screen` MCP. This folder holds the engine (`record-screend`, Swift on
ScreenCaptureKit), its command line, and later the MCP shim.

Why it is built this way, with measurements:
`~/src/docs/html/record-screen-strategies/index.html`. Bench harness:
`~/src/docs/plans/record-screen/bench/`.

## Status

Steps 1–4 of the build order are done.

1. **Engine skeleton.** Runs at login, answers on its socket, reports status,
   holds its own Screen Recording grant.
2. **Frames.** Targets (display, rect, window), `frame.verify` through a warm
   viewfinder, and a frame outline that never appears in captures.
3. **Recording.** Scheduled with absolute start and end times, pre-rolled so
   the take starts exactly on time, crash-safe files, stop, cancel, move the
   end, wait, and survival across engine restarts.

4. **Sessions.** Every recording, frame check, note and mark is bundled into
   a session folder, tagged with the agent session, directory, repo and branch
   that made it, and searchable when the agent loses the id.

The MCP shim comes next.

## Layout

| Path | What it is |
|------|------------|
| `engine/Sources/Recording.swift`, `Recordings.swift` | One scheduled recording from arming to finished file; the queue that creates, persists and reloads them. |
| `engine/Sources/*.swift` | The engine. `main.swift` boots it; `Engine.swift` holds the methods; `SocketServer.swift` is the protocol; `Targets.swift` resolves targets; `Viewfinder.swift` is the warm stream behind `frame.verify`; `Overlay.swift` draws outlines. |
| `engine/Info.plist` | Bundle id `com.taylor.record-screen`, `LSUIElement`, App Nap off. |
| `build.py` | Compiles with `swiftc`, bundles, signs, stamps the source hash. Output: `data/record-screen/record-screend.app` (gitignored). |
| `install.sh` | Build, link `src/launchd/com.taylor.record-screen.plist`, load it, wait for the socket. Run by the top-level `install.sh`. |
| `engine/Sources/Sessions.swift` | Session folders, the event log, auto-attach by caller, search. |
| `cli.mjs`, `bin/record-screen` | Command line (also on PATH as `~/dotfiles/bin/record-screen`). |
| `lib/caller.mjs` | Builds the `caller` object (agent session id, cwd, repo, branch) sent with session-aware requests. |
| `lib/client.mjs` | Socket client shared by the CLI and the future MCP. |

Runtime state lives in `~/.record-screen/` (mode 700):
`run/engine.sock`, `run/engine.lock`, `logs/engine.jsonl`, `logs/stdout.log`,
`logs/stderr.log`, `frames/` (verify images not tied to a session, pruned
after a day), and `sessions/<session_id>/`:

```
session.json                 title, purpose, tags, caller, counts, recording ids
events.jsonl                 append-only: created, note, verify, recording_scheduled,
                             recording_state, mark, closed, ...
frames/verify-<ms>.jpg       frame checks made in this session
recordings/<recording_id>/   video.mp4 + recording.json (with marks and events)
``` `RECORD_SCREEN_HOME` overrides the root.

## Commands

```bash
record-screen status     # engine, signing, permission, clock, displays
record-screen ping       # round trip in ms
record-screen grant      # macOS Screen Recording prompt (shows once per app)
record-screen probe      # list content + 64 px screenshot, with timings
record-screen restart    # kickstart the LaunchAgent and wait for it
record-screen build      # rebuild if sources changed, then restart
record-screen logs 50    # tail the engine log
record-screen windows [app] [title]            # find window ids
record-screen verify <target> [max_width]      # capture now; prints image path, checks, timings
record-screen outline <target> [label] [secs]  # draw the frame outline (0 s = until hidden)
record-screen outline-off
record-screen record <target> <start> <end> [preset] [label]   # e.g. record display +3s +33s demo
record-screen recordings [state]
record-screen recording <id>
record-screen record-wait <id> [recording|done] [timeout_s]
record-screen stop <id>       # stop now, keep the file
record-screen cancel <id>     # stop or unschedule, delete the file
record-screen current         # this agent's open session
record-screen sessions [query] [--mine]
record-screen session <id>    # manifest, recordings, recent events
record-screen session-new <title> [purpose]
record-screen note <text> [session_id]
record-screen mark <label> [recording_id]
record-screen close <session_id>
record-screen call <method> '<json params>'
```

The engine only accepts absolute times. `+3s`, `+2m` and `+1h` are a CLI
convenience that it turns into absolute times before sending.

`<target>` shorthand: `display`, `display:4`, `rect:x,y,w,h`, `window:1234`,
`app:Chrome`, `app:Chrome/PR 42` (app plus title words), or a JSON object.

Everything prints JSON. Failures print `{"error": {"code", "message"}}` and
exit 1. The message always says what to do next.

## Protocol

Newline-delimited JSON over the unix socket. A connection can carry many
requests; replies may come back out of order, so match them by `id`.

```json
{"id": 1, "method": "status", "params": {}}
{"id": 1, "result": {"engine": {...}, "clock": {...}, "permission": {...}, "displays": [...]}}
{"id": 2, "error": {"code": "unknown_method", "message": "unknown method nope; try status"}}
```

| Method | Returns |
|--------|---------|
| `ping` | `{pong, clock_ns}` |
| `status` | engine (version, build hash, pid, signing, uptime), clock, permission, displays, paths |
| `permission.request` | `{screen_recording: granted\|missing, next}` |
| `capture.probe` | `{ok, displays, windows, list_ms, screenshot_ms}`, or `capture_unavailable` |
| `windows.list` | `{app?, title?, on_screen_only?, limit?}` → windows front to back: id, title, app, bundle id, pid, frame, on_screen |
| `frame.resolve` | `{target}` → kind, display, frame, scale, pixels, window, warnings |
| `frame.verify` | `{target, max_width? (1280; 0 = native), format? jpeg\|png, quality?, path?}` → image path and size, target, checks (luma, looks_blank, warnings), timings and `source` |
| `overlay.show` | `{target, label?, seconds? (8; 0 = until hidden), overlay_id?, capturable?}` |
| `overlay.hide` | `{overlay_id?}` (all when omitted) |
| `viewfinder.stop` | stops the warm stream early (it stops itself after 20 s idle) |
| `record.schedule` | `{target, start_at, end_at, preset?, fps?, codec?, max_width?, show_cursor?, bitrate_mbps?, label?, if_late?, idempotency_key?, dir?}` → the recording, `state: scheduled`, `starts_in_s` |
| `record.get` | `{recording_id}` → full manifest |
| `record.list` | `{state?, active?, limit?}` → newest first |
| `record.wait` | `{recording_id, until? recording\|done, timeout_s? (30, max 3600)}` → manifest plus `timed_out` |
| `record.stop` | `{recording_id}` → stops now, keeps the file, waits until it is written |
| `record.cancel` | `{recording_id}` → unschedules, or stops and deletes the file |
| `record.reschedule` | `{recording_id, start_at?, end_at?}`: before start, either; while recording, only `end_at` |

| `record.mark` | `{label, kind?, recording_id? \| session_id? \| caller}` → `marked: [{recording_id, t_s}]` |
| `session.create` | `{title, purpose?, tags?, caller?}` |
| `session.current` | `{caller}` → the caller's open session with its recordings, or `session: null` |
| `session.get` | `{session_id, events? (30)}` → manifest, recordings, recent events, dir |
| `session.search` | `{query?, mine?, agent_session_id?, cwd?, repo?, tag?, state?, since?, limit? (10)}` |
| `session.note` | `{text, session_id? \| caller}` |
| `session.update` | `{session_id, title?, purpose?, tags?}` |
| `session.close` / `session.reopen` | `{session_id}` |

`record.schedule` and `frame.verify` also take `session_id` or `caller`.

Every object reply also carries `clock: {wall, uptime_ns}`, the engine's time,
so an agent can compute absolute times without a separate call.

### Targets

Global points, origin at the top-left of the main display, y down: the same
space as Hammerspoon's `hs.window:frame()`.

```json
{"type": "display", "display_id": 4}
{"type": "rect", "x": 100, "y": 100, "w": 800, "h": 600}
{"type": "window", "window_id": 1234}
{"type": "window", "app": "com.google.Chrome", "title": "PR 42"}
```

A window target records the window itself, so it keeps working when the
window is covered or on a Space you aren't viewing. It records nothing if the
app is hidden or the window minimized; `warnings` says when that is likely.
App/title matches pick the frontmost on-screen match.

### How `frame.verify` stays fast

One ScreenCaptureKit stream (the viewfinder) stays warm for 20 s after the last
check. `timing_ms.source` says which path answered:

| source | When | Measured |
|--------|------|----------|
| `live` | same target as last time: newest frame of the running stream | 4–15 ms |
| `reaim` | same display, new area or size: the stream is reconfigured and the first frame covering the new area is used | 29–40 ms |
| `screenshot` | new filter (other display or window, outline exclusion changed): one authoritative screenshot, then the stream re-aims for the next check | 78–180 ms |
| `start` | first check after the stream stopped | 67–140 ms |

A running stream applies a new content filter a frame or two late, and frames
don't say which filter made them, so filter changes always answer with a
screenshot. Area changes are safe to take from the stream because each frame
reports the screen area it covers. The window/display listing is cached for 2 s
and window geometry is read live, so resolving a target costs about 1 ms.

### Recording

`start_at` and `end_at` are required and absolute: ISO 8601 (`2026-10-05T20:15:00Z`,
any offset, fractional seconds allowed) or unix seconds. Both are always
required, so a recording can be queued for any future window. Limits: end after
start, at most 3 h long, at most 7 days ahead, at most 4 recordings overlapping
in time, start no more than 5 s in the past.

**Presets.** Override any field per recording.

| preset | size | fps | for |
|--------|------|-----|-----|
| `evidence` (default) | 1 pixel per point | 30 | readable proof, small files (800×600 pt: 0.46 Mbit/s) |
| `demo` | native Retina | 60 | polished demos |
| `pr-clip` | 1280 wide | 30 | PR descriptions and chat |

H.264 by default (`codec: "hevc"` for smaller files). The cursor is hidden
unless `show_cursor: true`.

**Timing.**
- The engine arms 1 s before `start_at`: it resolves the target and starts the
  stream early. The video's first frame is the screen exactly as it was at
  `start_at`, and the file covers exactly `start_at` to `end_at`.
- Frames are timestamped on the host clock. Measured: on-screen changes land in
  the file 13–22 ms after they happen (about a frame at 60 fps), and durations
  come out exact (3.000000 s for a 3 s window).
- A screen that never changes still gives a full-length file: the last frame
  is repeated just before `end_at` and the session ends at `end_at`.
- The display is kept awake from arming until the file is written (an idle
  sleep assertion). The engine can't wake a sleeping Mac for a future
  recording, and closing the lid still sleeps it.
- `if_late` (`start` by default) decides what happens if the engine arms more
  than 2 s late (restart, sleep): start late and record the rest, or `skip`
  and mark it `missed`.

**States.** `scheduled` → `arming` → `recording` → `finalizing` → `done`, or
`failed` (couldn't start, or no frames), `canceled`, `missed`, `interrupted`
(the window closed or the engine stopped mid-recording; the file is kept and
plays up to that point).

**Crash safety.** Files are fragmented MP4 with a fragment every second. In a
test, an engine killed with `kill -9` 4 s into a recording left a playable
4.0 s file, the recording was marked `interrupted` on restart, and a recording
queued for after the crash still ran on time.

**Disturbances.** For window targets the engine checks once a second and adds
events to the manifest with their offset into the video (`t_s`):
`window_moved`, `window_resized`, `window_off_screen` / `window_on_screen`,
`app_hidden` / `app_unhidden`, `window_gone`. Other events: `warning`,
`started_late`, `stopped_early`, `end_moved`, `capture_stopped`.

**Cost.** A 60 fps full-Retina display recording used 3.6% of one core in
the engine (the encoder is hardware) and 45 MB of memory.

### Sessions

A session is the bundle for one piece of work. Agents rarely need to manage
them:

- **Auto-attach.** Requests carry `caller` (the CLI and MCP add it):
  `{agent, agent_session_id, host_session_id, cwd, repo, repo_root, branch}`.
  `agent_session_id` comes from `CLAUDE_CODE_SESSION_ID` (or Codex's thread
  id). `record.schedule` without a `session_id` goes into the caller's most
  recent open session, active in the last 12 h, or opens a new one titled
  after the recording's label. `frame.verify` and `record.mark` attach to the
  caller's open session if there is one; they never create one.
- **Lost ids.** `session.current` answers "what am I working in?".
  `session.search` with `mine: true` lists only this agent's sessions; `query`
  matches every word against title, purpose, tags, notes, recording labels,
  mark labels and the caller's directory, repo and branch, and says which
  fields matched.
- **Marks.** `record.mark` stamps "now" into running recordings with the
  offset into each video (`t_s`), for chapters and trims later: one recording
  by id, or every running recording in the session. With nothing running, the
  mark still goes into the session log with its wall time.
- **Notes.** `session.note` leaves breadcrumbs ("about to record the
  checkout flow"), which search finds later.
- **Closing** stops new work landing in the session; the agent's next
  recording opens a fresh one. `session.reopen` undoes it.

### Frame outline

`overlay.show` draws viewfinder-style corner brackets 6 pt outside the target,
with an optional label. It never takes focus or clicks, sits on every Space,
and is hidden from every screen capture: macOS's own `screencapture` doesn't
see it, and the engine's capture filters exclude the engine's windows too.
`capturable: true` lets other tools capture it, to check how it looks.

`clock.uptime_ns` is `CLOCK_UPTIME_RAW`, the same clock as ScreenCaptureKit
frame timestamps and Hammerspoon's `hs.timer.absoluteTime()`.

Only processes running as this user can connect: the socket is mode 600 and
the engine checks the peer's uid.

## Behaviour that matters

- **Never takes focus.** The engine runs with the `prohibited` activation
  policy and `LSUIElement`. Measured: the usual accessory policy activated a
  helper once at launch; prohibited never did. Outlines and verifies leave the
  frontmost app unchanged.
- **macOS shows its recording indicator** while the viewfinder stream runs
  (up to 20 s after the last verify).
- **One instance.** An flock on `run/engine.lock`; a second copy exits 0.
- **Restarts on crash, not on clean exit.** `KeepAlive.SuccessfulExit = false`.
- **Installs don't interrupt it.** `install.sh` restarts the engine only when
  the build hash changed or the plist link moved. After editing the plist
  itself, reload by hand:
  `launchctl bootout gui/$(id -u)/com.taylor.record-screen && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.taylor.record-screen.plist`.

## Screen Recording permission

The bundle is signed with the first `Apple Development` identity in the
keychain (override with `RECORD_SCREEN_SIGN_IDENTITY`). macOS ties the grant
to that identity, so it survives rebuilds. An ad-hoc signature would change on
every build and macOS would forget the grant each time. `record-screen status`
shows `engine.signing.kind`; it should say `identity`.

The current certificate (`Apple Development: evantayloryates@gmail.com`)
expires 2027-05-30. Renewing it keeps the same name, so the grant should hold.

First-time setup:

1. `record-screen grant` shows macOS's prompt.
2. Turn on **record-screend** in System Settings > Privacy & Security >
   Screen & System Audio Recording.
3. `record-screen restart`, then `record-screen probe` should return `ok: true`.

macOS asks again every 30 days. The re-confirm date lives in
`~/Library/Group Containers/group.com.apple.replayd/ScreenCaptureApprovals.plist`.
