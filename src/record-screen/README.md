# record-screen

An always-on screen-recording engine that agents drive through the
`record-screen` MCP. This folder holds the engine (`record-screend`, Swift on
ScreenCaptureKit), the MCP server, and a command line.

Why it is built this way, with measurements:
`~/src/docs/html/record-screen-strategies/index.html`. Bench harness:
`~/src/docs/plans/record-screen/bench/`.

## Candidate capture controls (October 8 qualification)

The source candidate accepts `include_child_windows` and `exclude_apps` in
JSON targets. Omission preserves existing behavior. Exclusions use at most
eight exact bundle identifiers on display/rect targets; missing apps and
isolated-window exclusions fail explicitly. Resolved PIDs and child settings
participate in recording-tap and viewfinder identities, preventing previews
from reusing footage with different settings.

`status.capabilities.target_capture_options: 1` identifies support. The MCP
checks it on the same engine connection before forwarding optional controls;
an older installed engine returns `unsupported_capture_options` before
capture. Default callers avoid the additional capability check. Raw socket
callers must also negotiate support. Reports include requested/effective
child settings and resolved exclusion identities.

The October 8 installed engine is still unchanged. Source build, 25 offline
parse/identity assertions and isolated MCP socket tests passed; production
filter/preview routing still needs a bounded live qualification before
installation. Prior helper stream results are evidence for the approach,
not qualification of the installed engine. See
[qualification/GATES.md](qualification/GATES.md).

## Status

All six steps of the build order are done.

1. **Engine skeleton.** Runs at login, answers on its socket, reports status,
   holds its own Screen Recording grant.
2. **Frames.** Targets (display, rect, window), `frame.verify` through a warm
   viewfinder, and a frame outline that never appears in captures.
3. **Recording.** Scheduled with absolute start and end times, pre-rolled so
   the take starts exactly on time, crash-safe files, stop, cancel, move the
   end, wait, and survival across engine restarts.

4. **Sessions.** Recordings, frame checks, notes and marks bundle into
   explicit session folders, searchable by clues when an agent loses the id.
5. **MCP.** 18 tools over the engine, registered in Claude Code and Codex.
6. **Agent outputs.** Every finished recording gets keyframes (start, marks,
   scene changes, end), a labelled contact sheet, a poster and a per-second
   activity timeline; frames at any offset; frame-exact mp4 trims and GIFs.

## Layout

| Path | What it is |
|------|------------|
| `engine/Sources/Recording.swift`, `Recordings.swift` | One scheduled recording from arming to finished file; the queue that creates, persists and reloads them. |
| `engine/Sources/*.swift` | The engine. `main.swift` boots it; `Engine.swift` holds the methods; `SocketServer.swift` is the protocol; `Targets.swift` resolves targets; `Viewfinder.swift` is the lane pool behind `frame.verify`; `Overlay.swift` draws outlines. |
| `engine/Info.plist` | Bundle id `com.taylor.record-screen`, `LSUIElement`, App Nap off. |
| `build.py` | Compiles with `swiftc`, bundles, signs, stamps the source hash. Output: `data/record-screen/record-screend.app` (gitignored). |
| `install.sh` | Build, link `src/launchd/com.taylor.record-screen.plist`, load it, wait for the socket. Run by the top-level `install.sh`. |
| `engine/Sources/Review.swift` | Activity tracking during recording, keyframes, contact sheet, frames at offsets, ffmpeg exports. |
| `engine/Sources/Sessions.swift` | Session folders, the event log, auto-attach by caller, search. |
| `server.mjs`, `bin/record-screen-mcp` | The MCP server (stdio, zero dependencies; shares `src/lib/node/mcp-stdio.mjs` with claude-driver and codex-bridge). |
| `lib/install.mjs` | Registers the MCP in Claude Code (user scope) and Codex; run by `record-screen install` and `install.sh`. |
| `cli.mjs`, `bin/record-screen` | Command line (also on PATH as `~/dotfiles/bin/record-screen`). |
| `lib/caller.mjs` | Builds the `caller` clues (claimed agent session id, cwd, repo, branch) stored on new sessions. |
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
recordings/<recording_id>/   video.mp4 + recording.json (marks, events, review, activity)
  review/                    keyframe-<t>.jpg, contact.jpg, poster.jpg
  frames/                    at-<t>.jpg from record.frames
  exports/                   trim-<from>-<to>.mp4, clip-<from>-<to>.gif
``` `RECORD_SCREEN_HOME` overrides the root.

## MCP tools

Server `record-screen`. Every reply carries `clock.wall` (engine time) for
computing absolute times. Errors come back as `<tool> failed [code]: message`,
and the message says what to do next, in tool names.

| Tool | Does |
|------|------|
| `status` | engine health, permission, displays, clock, warm lanes, outlines |
| `windows` | windows front to back, for window targets |
| `frame_check` | captures the target now and **returns the image** (1024 px default) plus resolved frame, checks and timing |
| `frame_outline` | shows (or with `hide`, removes) the frame outline for the human |
| `session_open` | opens a session; keep its id |
| `session_find` | finds sessions by query words and filters; returns clues; `mine` filters on this agent's claimed id |
| `session_show` | one session with its recordings and recent events |
| `session_note` | a breadcrumb in the session log |
| `session_update` | title, purpose, tags, open/closed |
| `record_schedule` | absolute `start_at` + `end_at`, `session_id` or `session {title}`, preset and overrides, `idempotency_key` |
| `record_wait` | blocks until `recording` or `done` (waits in 15 s slices with progress notifications) |
| `record_stop` | stop now and keep the file, or `discard: true` to cancel and delete it |
| `record_reschedule` | move start/end before start, or end while recording |
| `recordings` | one manifest by id, or a filtered list |
| `mark` | marks now in one recording or every running one in a session |
| `recording_review` | **contact sheet image** + keyframes, activity per second, marks; `keyframe_images: N` adds keyframe images |
| `recording_frames` | **images** at exact offsets |
| `record_export` | frame-exact mp4 trim or GIF, by seconds or mark labels |

Typical flow: `session_open` → `windows` / `frame_check` to aim (and
`frame_outline` to show the human) → `record_schedule` → `mark` while it runs →
`record_wait` → `recording_review` → `recording_frames` for exact moments →
`record_export` for a clip.

Registration: `record-screen install` (also run by `install.sh`) adds
`/Users/taylor/dotfiles/src/record-screen/bin/record-screen-mcp` to Claude Code
(user scope) and `~/.codex/config.toml` (`tool_timeout_sec = 3700`, because
`record_wait` can block for up to an hour). New agent sessions pick it up.
`~/src/docs/plans/record-screen/bench/mcp/smoke.mjs` drives every tool over
stdio.

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
record-screen record <target> <start> <end> [preset] [label] --new "<title>"   # or --session <id>
record-screen recordings [state]
record-screen recording <id>
record-screen record-wait <id> [recording|done] [timeout_s]
record-screen stop <id>       # stop now, keep the file
record-screen cancel <id>     # stop or unschedule, delete the file
record-screen sessions [query] [--mine]
record-screen session <id>    # manifest, recordings, recent events
record-screen session-new <title> [purpose]
record-screen note <session_id> <text>
record-screen mark <label> <recording_id | session_id>
record-screen install [--dry-run]
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
| `overlay.show` | `{target, label?, seconds? (8; 0 = until hidden), overlay_id?, session_id?, capturable?}`; ids become `<session_id or shared>:<overlay_id>` |
| `overlay.hide` | `{overlay_id?, session_id?}`: one outline, one session's, or all |
| `viewfinder.stop` | stops every warm lane now (they stop themselves after 20 s idle) |
| `record.schedule` | `{target, start_at, end_at, preset?, fps?, codec?, max_width?, show_cursor?, bitrate_mbps?, label?, if_late?, idempotency_key?, dir?}` → the recording, `state: scheduled`, `starts_in_s` |
| `record.get` | `{recording_id}` → full manifest |
| `record.list` | `{state?, active?, limit?}` → newest first |
| `record.wait` | `{recording_id, until? recording\|done, timeout_s? (30, max 3600)}` → manifest plus `timed_out` |
| `record.stop` | `{recording_id}` → stops now, keeps the file, waits until it is written |
| `record.cancel` | `{recording_id}` → unschedules, or stops and deletes the file |
| `record.review` | `{recording_id}` → keyframes, contact sheet, poster, duration (built on demand for recordings that finished without one) |
| `record.frames` | `{recording_id, at_s: [1–24 offsets], max_width? (1024)}` → image paths, with `frame_t_s` (when the frame shown began) |
| `record.export` | `{recording_id, format? mp4\|gif, from_s?\|from_mark?, to_s?\|to_mark?, max_width?, fps?, name?}` → path, bytes, ms |
| `record.reschedule` | `{recording_id, start_at?, end_at?}`: before start, either; while recording, only `end_at` |

| `record.mark` | `{label, kind?, recording_id \| session_id}` → `marked: [{recording_id, t_s}]` |
| `session.create` | `{title, purpose?, tags?, caller?}` |
| `session.get` | `{session_id, events? (30)}` → manifest, recordings, recent events, dir |
| `session.search` | `{query?, agent_session_id?, cwd?, repo?, branch?, tag?, state?, since?, limit? (10)}` → hits with clues |
| `session.note` | `{session_id, text}` |
| `session.update` | `{session_id, title?, purpose?, tags?}` |
| `session.close` / `session.reopen` | `{session_id}` |

`record.schedule` requires `session_id` or `session: {title, ...}`;
`frame.verify` and `overlay.show` take an optional `session_id`.

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

### How `frame.verify` stays fast, and correct under concurrency

Each target gets its own warm ScreenCaptureKit stream (a "lane") whose filter
and area never change. Every frame a lane returns is checked against the
screen area and size it must cover. Concurrent checks of the same target share
one lane and one start-up; different targets run in parallel on separate
lanes. Lanes stop after 20 s idle; at most 24 are live (LRU). They use no
hardware encoder session. `timing_ms.source` says which path answered:

| source | When | Measured |
|--------|------|----------|
| `live` | the target's lane is warm | 2–12 ms |
| `start` | first check of a target (opens its lane) | 60–200 ms |
| `tap` | a recording of exactly this area is running: its newest frame, no extra capture, and it shows exactly what is being recorded | 8 ms median |
| `screenshot` | fallback when a lane can't produce a frame | 50–180 ms |

An earlier design re-aimed one shared stream. It was fast for one agent but
returned the previous target's frame under concurrency (30 of 40 images wrong
with 8 agents on one area), so it was replaced. The window/display listing is
cached for 2 s and fetched once even when many requests arrive together
(concurrent cold fetches left new streams silent). Window geometry is read
live, so resolving a target costs about 1 ms.

### Concurrency

The engine handles requests in parallel. Measured on this M5 Pro:

| Load | Result |
|------|--------|
| 16 agents, each checking its own area, 10 times | 1,807 checks/s, median 6.7 ms, p95 25 ms, 0 wrong images |
| 8 agents checking the same area | 334 checks/s, median 6 ms, 0 wrong |
| 12 agents checking areas that 12 running recordings cover | 1,118 checks/s via `tap`, median 8 ms, 0 wrong |
| 500 simultaneous notes into one session | 2,584/s, all 500 in the log, counts exact |
| 16 / 20 simultaneous recordings, full motion | 0 dropped frames, durations exact to the frame |
| 22–30 simultaneous recordings | the hardware video encoder stalls |

Correctness was checked by putting a differently coloured square on each test
area and confirming every image showed its own colour.

- **Recording cap: 16 at once**, set by the hardware encoder (20 ran clean, 22
  stalled), with headroom for Zoom, FaceTime and other apps sharing it. The
  17th gets `too_many`, naming the recordings and sessions holding slots.
- **If the encoder stalls anyway**, recordings that can't finish within 15 s,
  or can't start within 8 s of `start_at`, are marked `interrupted` or
  `failed` from outside their queue. The engine then restarts itself (launchd
  brings it back in about 5 s with a fresh encoder), and queued recordings
  re-arm. API calls never wait on a recording's queue, so a stall can't hang
  the engine.
- **Outlines are namespaced** by `session_id` (`<session_id>:frame`), so two
  agents' outlines never replace each other. `overlay.hide {session_id}`
  hides only that session's.
- Frame-check filenames carry a random suffix, so concurrent checks never
  overwrite each other's images.

### Recording

`start_at` and `end_at` are required and absolute: ISO 8601 (`2026-10-05T20:15:00Z`,
any offset, fractional seconds allowed) or unix seconds. Both are always
required, so a recording can be queued for any future window. Limits: end after
start, at most 3 h long, at most 7 days ahead, at most 16 recordings
overlapping in time (see Concurrency), start no more than 5 s in the past.

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

### Review and exports

Built for agents that can't watch video.

- **Activity tracking.** While recording, every written frame is sampled on a
  24×24 brightness grid plus a 12×12 colour grid, read straight from the
  frame (about 900 reads, no conversion). A change of 3 or more (0–255 scale)
  from the last keyframe, at least 0.75 s after it, becomes a scene-change
  keyframe (up to 60). The manifest's `activity_per_s` gives the strongest
  frame-to-frame change in each second (0 = nothing moved). Small changes, such
  as one new glyph, can fall between samples.
- **On finish,** before the state turns `done` (196 ms measured, including
  closing the file): `review/keyframe-<t>.jpg` for start, every mark, every
  scene change and the end (marks win over changes within 0.3 s);
  `review/contact.jpg` with up to 12 labelled tiles (start, end and marks
  always included); `review/poster.jpg` (the end state). A static recording
  gets a few evenly spaced frames instead of changes.
- **Frames at offsets** (`record.frames`) come out exact. Recordings are
  variable frame rate, so `frame_t_s` says when the frame shown began.
- **Exports** (`record.export`, ffmpeg from Homebrew): the engine decodes from
  the start with the hardware decoder, converts to a constant rate
  (`fps=`), and cuts with `trim`, so a cut point inside a stretch where nothing
  changed still shows the right frame and durations come out exact (measured
  2.20 s for a 2.186 s mark-to-mark cut at 30 fps; 7.000 s for the full 7 s
  recording). mp4 re-encodes with VideoToolbox at 30 fps; GIF uses 12 fps, a
  diff palette, at most 960 px wide and 60 s long. A 4 s GIF took 152–174 ms.
- Recordings interrupted by a crash get their review on demand from
  `record.review`.

### Sessions

A session is the bundle for one piece of work. Sessions are **explicit**: the
engine never decides which session a request belongs to.

- `record.schedule` needs `session_id` or `session: {title, purpose?, tags?}`,
  which opens one in the same call. The reply always names the session.
  `frame.verify` keeps its image in a session only when `session_id` is given;
  `record.mark` takes `recording_id` or `session_id`.
- **No identity.** There is no authorisation and no ownership: every agent can
  read and act on every session, by design. Who opened a session is stored as
  `made_by` (`caller`: claimed agent session id, client, cwd, repo, branch).
  It is a clue, never used to route work: a client can't prove who it is
  (subagents share their parent's id, Codex may send none, resumed sessions
  get new ids).
- **Finding a lost id.** `session.search` matches every query word against
  title, purpose, tags, notes, recording labels, marks and the made-by
  directory, repo and branch, and filters by `agent_session_id`, `cwd`
  (prefix), `repo`, `branch`, `tag`, `state` and `since`. Each hit carries
  clues: `matched` fields, `last_note`, `recent_marks`, `recording_now`,
  `last_image`, counts, `made_by`. The agent decides which one is its own.
- **Marks.** `record.mark` stamps "now" into one recording, or every running
  recording in a session, with the offset into each video (`t_s`). With
  nothing running, the mark still goes into the session log.
- **Notes.** `session.note` leaves breadcrumbs that search finds later.
- **Closing** stops new recordings landing in the session; `session.reopen`
  undoes it.

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

## Candidate capture foundations

The qualification branch of work is committed before engine installation.
The currently loaded engine may therefore be older than these source additions.
Use `status` capabilities rather than assuming the installed behavior.

- `target_capture_options: 1`: explicit child-window setting and exact bundle
  exclusions for display/rect sources. Filters and resolved PIDs distinguish
  taps and preview lanes. Unsupported or missing exclusions fail explicitly.
- `source_journal: 1`: MCP `recording_source`, socket `record.source`, and CLI
  `record-source <recording_id>` return a bounded local source packet descriptor.
  The MCP rejects legacy engines before requesting the packet. See
  [SOURCE-PACKET.md](SOURCE-PACKET.md) for exact clocks, geometry qualification,
  encoded/held-frame links, gaps and interrupted checkpoint counters.
- Discovery and preview SDK work use shared three-second deadlines, with
  unfinished producers quarantined rather than repeatedly spawned. Recording
  startup retains its eight-second watchdog and unfinished admission slot;
  SDK startup timeout does not restart healthy peers. Encoder-finalization
  recovery remains separate. No deadline claims to cancel an uncooperative SDK.

Delivery evidence and unresolved gates are in
[qualification/GATES.md](qualification/GATES.md), with the active production
roadmap in [qualification/PRODUCTION-GOAL.md](qualification/PRODUCTION-GOAL.md).
Input provenance, supported automatic receipts, cross-display/sleep, daily-app
menus and realistic resource budgets remain qualification work. Visual effects
and composition recipes are deferred.
