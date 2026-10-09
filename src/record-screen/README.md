# record-screen

An always-on screen-recording engine that agents drive through the
`record-screen` MCP. This folder holds the engine (`record-screend`, Swift on
ScreenCaptureKit), the MCP server, and a command line.

For production coordination, start with [the agent usage and recovery runbook](AGENT-USAGE.md).
It separates delivered capabilities from app/provider checks still needed.

Why it is built this way, with measurements:
`~/src/docs/html/record-screen-strategies/index.html`. Bench harness:
`~/src/docs/plans/record-screen/bench/`.

## Capture controls and qualified limits

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

Child inclusion can change the fitted source scale within one take while the
encoded canvas stays fixed. The installed stage33 attached-panel oracle proved
scale1→0.75→1 with exact parent alignment and child error≤0.5px. Decode/compose
using the encoded sample's source-frame geometry, not an idle/current map or the
original window frame alone. `screen_points` retained the parent frame while
`content_scale` changed. This qualifies that authored AppKit case; it does not
establish all context menus, Chrome popups or parent ownership. See
[stage33 evidence](qualification/GATES.md#thirty-third-pass-dynamic-attached-child-geometry-and-exact-source-pixels).

Recordings with nonempty `exclude_apps` additionally require
`status.capabilities.exclusion_identity: 1`. The candidate observes application
identity before resolving the filter and interrupts a take on an observed change,
keeping partial media. `exclusion_quality` stays uncertain on interruption;
observation timing does not locate the first affected frame. Start a fresh take
with freshly resolved identities. Excluded frame checks additionally require
`preview_exclusion_identity: 1`: affected lanes retire, in-flight images are
validated at delivery, and a new check resolves current identities. Main-run-loop
observation can lag; these guards do not promise zero leaked pixels. Default
callers retain their previous behavior.

Candidate clock continuity samples both uptime and continuous time with bounded
brackets. An observed discontinuity interrupts only the affected take, preserves
partial footage and suppresses end-frame filling through the uncertain interval.
The source packet reports the policy, anchors, gaps and receipt segments. Actual
sleep/wake and other providers’ clock equivalence remain unqualified; see
[SOURCE-PACKET.md](SOURCE-PACKET.md). These capabilities are installed in build
f314bb340344; physical sleep/wake remains unqualified.

Candidate source packets include observed color-tag boundaries and latest color
metadata. Requested sRGB and observed buffer tags are separate; missing fields
are unknown. The declared SDR reference path passed cross-display source/preview
checks, while inherited app backing profiles can change captured values. Preserve
that behavior instead of applying an unqualified global color correction. HDR,
physical color accuracy and viewer transfer behavior remain unqualified.

Signed isolated candidates passed recording/preview routing and an owned
background-helper termination/relaunch canary. Subsequent installed delivery
and consumer checks are recorded in [qualification/GATES.md](qualification/GATES.md).
Use loaded status for current support; historical candidate evidence does not
establish every app, provider or failure boundary.

## Status

All six steps of the build order are done.

1. **Engine skeleton.** Runs at login, answers on its socket, reports status,
   holds its own Screen Recording grant.
2. **Frames.** Targets (display, rect, window), `frame.verify` through a warm
   viewfinder, and a frame outline that never appears in captures.
3. **Recording.** Scheduled with absolute start and end times, pre-rolled so
   source coverage can be inspected against actual media, with stop, cancel,
   move the end, wait, retained partial files and restart checkpoints. An
   interrupted take does not resume its live producer after a restart.

4. **Sessions.** Recordings, frame checks, notes and marks bundle into
   explicit session folders, searchable by clues when an agent loses the id.
5. **MCP.** Engine and bounded media tools, registered in Claude Code and Codex.
   Inspect loaded tool discovery and adapter metadata rather than a historical count.
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
record-screen restart    # reserve idle admission, restart once, verify new PID
record-screen build      # preserve/reuse signed build, deliver at idle, verify hash
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

- **Recording cap: 16 at once** is the original configured budget, based on
  historical tests. It is not a guarantee of capacity under other workloads.
  The candidate also counts unfinished startup, encoder calls/finalization and
  unconfirmed stream stops, including terminal takes, against admission.
- **Candidate encoder failure isolation:** a 15-second finalization deadline
  marks only the affected take interrupted, preserves partial media and closes
  its journal with unverified video coverage. It does not restart the engine or
  replay actions. Both callback completion and encoder-call return are required
  to release that reservation. A failed stream-stop acknowledgment remains
  reserved; an idle maintenance decision is needed if work never settles.
  The installed older engine still has its original restart behavior until
  the delivery gate is complete. Snapshots remain available without waiting on
  a blocked recording queue; this does not promise hardware-level isolation.
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
  stream early. Requested times are scheduling intent, not guarantees of
  physical presentation or exact decodable start/end boundaries.
- Frames retain recorder-domain source and encoded timestamps. Use
  `recording_frame_map` for actual mux intervals; provider delivery and physical
  presentation calibration are separate, scoped checks. Historical latency
  measurements do not establish a universal input-to-pixel bound.
- Sparse footage can hold the last successful source frame, including bounded
  interior padding and an end fill when permitted. Held content retains its
  earlier source time and geometry. Clock gaps suppress uncertain end filling;
  failed writers can leave fewer decodable packets than accepted submissions.
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
- **Delivery requires an idle boundary.** Changed live builds use an engine
  maintenance lease; active and scheduled work refuses delivery. Unchanged
  installation leaves the engine running. The first upgrade from a legacy
  engine requires explicit `--legacy-idle` and repeated idle observations;
  that path cannot fence new work. `--recover-terminal` permits deliberate
  recovery of unresolved terminal resources while still refusing live work.
  Prepared signed artifacts and verified prior bundles remain available after
  failed delivery. An uncertain restart is observed once, never replayed.

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

## Capture foundations and qualification

Start capture coordination with `production_plan` in a fresh MCP adapter
(`status.mcp_adapter.production_planning: 1`, introduced in0.9.0; current0.11.1), or the immediately
available CLI:

```sh
node /Users/taylor/src/github/dotfiles/src/record-screen/cli.mjs production-plan \
  '{"target":{"type":"display","display_id":1},"mode":"background","activity":"passive_capture","duration_s":30}'
```

The planner reads status and, for a window, a bounded window inventory. It starts
no capture, changes no settings, drives no UI and locks no input. Resolve exact
window IDs with `windows`; planning does not guess an app or title. The returned
request preserves explicit duration/fps/width/cursor/input/redundancy settings;
its defaults (30 fps, 1000-pixel width cap, hidden capture pointer, no input,
no redundancy) are planning values, not silently applied recording settings.
Pass the chosen settings explicitly when scheduling.

| Mode | Expectation before production |
| --- | --- |
| `background` | Passive capture. Agent UI work cannot promise undisturbed user work; choose an agreed mode first. Display/rect footage still includes visible occlusion and unrelated pixels. |
| `cooperative` | For agent UI work, the caller declares a user-agreed interval covering `duration_s` through `alignment_until`. Explain focus and global-shortcut effects even with two displays. Passive capture alone does not require a new reservation. |
| `reserved_interval` | A caller-reported approved interval covers the intended take, including passive work that claims reservation. User input remains available. No OS-level or cross-agent display lock is created. |

`alignment_until` is an absolute ISO timestamp with timezone. It preserves
caller-reported existing consent; the planner cannot authenticate it or grant
permission. Reuse current human authorization rather than requesting it again.
If alignment is missing/expired/too short, agree on the needed interval or
shorten the take before driving UI. A reservation is cooperation, not isolation.

`assessment: needs_resolution` names observed obstacles such as absent displays,
off-screen UI targets, missing access/capabilities or active maintenance.
`candidate_requires_source_check` means planning found no such obstacle;
it **does not establish native readiness or usable encoded source footage**.
An on-screen window can still refuse input. Reconfirm actual delivery and source
pixels, and consult the shared exact-environment app facts below. A bounded
inventory miss is distinguished from known absence. Observations can become
stale immediately; planning is advisory and does not intercept later UI calls.

Pointer hiding and helper exclusions are distinct from app-drawn pointers and
text carets. The plan reports each layer separately; inspect actual pixels
before claiming a clean source. Child inclusion is an explicit option, not a
universal menu-capture guarantee. App/OS/provider/display/capture-option changes,
Space changes, new helper identities and popup reopening warrant the relevant
narrow check. Preserve established evidence instead of repeating unrelated QA.

`window_display` redundancy returns guidance for two sources; it neither invents
a backup crop nor schedules one. The stored benchmark is one authored 50-second
1000×732 / 30 fps pair on a built-in 2× display with build f314bb340344 and no
input telemetry. It kept 2,371 exact samples with no drops, measured about
0.063 recorder CPU cores / 51.7 MiB peak RSS, and produced two approximately
8.3 MB files under warning pressure. These include concurrent host work and
do not establish attributable GPU/thermal cost, app representativeness,
long-duration capacity or P80 timing. Even matching settings leave the requested
app unqualified. Configured `max_concurrent:16` remains a limit, not capacity.
The plan keeps P80 null and reports profile differences without projecting
CPU, RSS, thermal equilibrium or requested-app capacity.

The additional single-window benchmark covers a 110-second 1000×732/30fps take:
3,221 exact source/mux samples, about 89 seconds of changing authored pixels
followed by 20 seconds matching the logged stopped counter. It measured about
0.052 recorder CPU cores/49.1MiB peak RSS and a 15.3MB file under warning pressure.
The 109 wall-joined resource observations are approximate; their monotonic clock
is separate. This is mixed-scene cost, not GPU/thermal capacity, requested-app
representativeness or P80. Profiles give an absolute evidence path/section.

Fresh adapter0.11.1 also reports `production_storage_guidance:1` and the measured
330s2000×1464/requested60fps window/display pair:35345 exact packets,327 fresh
normal-pressure/nominal-coarse-thermal samples,0.12953 recorder CPU cores and
47.73MiB peakRSS. Separate fixture/shared WindowServer observations are exposed;
recorder CPU excludes those processes and GPU work, while shared WindowServer
cost cannot be attributed solely to capture. Actual combined storage was
513518205 video bytes plus22630963 journal bytes. Matching parent dimensions,
scale, settings and native build remain only a candidate geometry match; actual
child fitting, backup crop, requested-app costs and encoded source must be checked.

`resource_guidance.storage_guidance` scales this reference scene's bytes, rows
and packets by requested duration as a **scenario**, never a prediction or bound.
It reports typed flags against the measured64MiB per-source native journal limit
and this adapter's250000-row/120000-packet reader limits. Different requested
settings are explicit; input density and content can change actual costs.
A one-hour reference scenario exceeds all three budgets. It is a warning, not
a predicted failure time, safe maximum take length or capture admission block.
Free disk space and safe continuous duration remain null; no space is reserved.

Check actual disk availability and each source's `bytes`, `max_bytes`,
`rows_lost`, completeness and errors. Source journal exhaustion can leave video
running while later metadata/events are missing. Bounded readers can refuse a
long source even if the video is intact. Plan explicit shorter takes at useful
application checkpoints and verify actual coverage at the joins; the plan does
not automatically split recordings, invent overlaps or schedule backups.

The opt-in qualification sampler can stop only explicit owned recordings after
session/state checks if fresh critical pressure or serious/critical coarse
thermal state appears. Eight fake-engine checks cover mismatch, settled takes,
lost replies without replay, stale pressure and thermal identity/freshness/file
boundaries. Live guard did not fire. This is neither automatic service admission
nor a user-input lock; stop latency and natural pressure recovery remain unknown.

When disturbed, mark and preserve the interval/journals, trim or select only
independently verified alternative coverage, and reshoot from an application
checkpoint when replayable. Live unrecoverable gaps stay explicit. Keep a dense
backup trajectory across held primary frames; selecting only one backup sample
per sparse primary timestamp discards available motion. Never block the user
prophylactically or stop a peer workflow to make the shot pass.

Five planning policy/MCP tests and three adjacent option/reconnect tests passed.
An owned fresh adapter's live readback preserved the installed engine PID and
zero active captures/listeners/actions/preview lanes. Existing loaded adapters
may omit the new tool/policy: use the CLI or wait for their safe next launch;
do not restart peers for discovery. Stage31 also preserves a failed Chrome
native-readiness attempt without a capture or duplicated shortcut.

Consult the shared app capability plan before an unfamiliar or changed surface:
`node /Users/taylor/src/github/dotfiles/src/codex-bridge/evidence.mjs plan
/absolute/plan-request.json`. The same service exposes `computer_use_plan` to
fresh MCP consumers. It reports missing/expired/conflicting/unknown evidence,
exact environment keys and limits; it neither operates UI nor infers success.
Keep unknown dimensions unconfirmed. Feed actual delivery/pixel/cleanup outcomes
back into that shared store, including ordinary computer use without recording.
See `src/codex-bridge/CAPABILITY-EVIDENCE.md` for the request and reuse contract.

Supported callback consumers can use `lib/recorded-workflow.mjs` to keep
dispatch, verification and cleanup separate. The wrapper closes the recorder
action before long checks, invokes the operation once, attempts supplied cleanup
once after a known begin, and never replays UI on receipt/evidence failure.
Native CUA remains explicit. Shared `computer_use_outcome`/`computer_use_audit`
and `evidence.mjs outcome/audit` preserve typed observations; a delivered receipt
alone does not establish verification or cleanup. Audit counts describe reported
persisted scopes, not all historical operations or task success rates.

For launch, the future source app may have no live identity; action_begin refuses
that missing target. A lifecycle scope can name the actual existing controller
with explicit launch intent, then independently resolve the new source PID/window
before its input scopes. Do not attribute future-source input to the controller
or fabricate a PID. After close, stale running inventory is not proof of failed
cleanup: check known PID/window absence before another close or getApp relaunch.

Input telemetry needs a separate **Input Monitoring** grant for the installed
signed `record-screend.app`. Screen Recording permission alone does not supply
it, and `record-screen grant` only requests Screen Recording. With explicit
user approval, add the installed bundle under System Settings > Privacy &
Security > Input Monitoring; authentication belongs to the human user.
Do not alter another application's permission or repeatedly request a prompt.

When input is requested without this grant, video can still finalize while the
source records `input_gap: listen_access_unavailable` and no delivered input.
That is incomplete input coverage, even if the journal closes with no lost rows.
`status.input_timeline.listen_access` is a last observation with its own timestamp;
an idle value does not establish present access. A fresh subscription rechecks it.
After approval, verify an actual app-delivered event against retained source rows.
Use a fenced idle restart only if macOS requires it; never restart active work
merely to refresh a permission observation.

The October 9 installed canary verified the enabled switch, one fenced idle
relaunch and a fresh listening subscription on build 767d45f6ce40. Six native
app-delivered gesture transitions matched retained CG timestamps, types,
destinations and positions exactly. Four targeted shortcut transitions survived
lack of global foreground; their semantic execution, physical/global coverage
and actor identity remain unqualified. See qualification/GATES.md, twenty-sixth
pass. The recorder returned to zero input subscribers after that take.

Build 767d45f6ce40 was delivered and independently read back on October 8,
following the e0d053bc6732 foundation release.
The existing screen grant and prior state survived the upgrade and an idle
fenced restart. Installed passive capture/source/export consumers passed their
written smoke scope. Use `status` capabilities for the currently loaded engine;
broader app, input, insurance and resource qualification remains open.

`input_queue_loss:1` preserves callback receipt order through bounded ingress
overload, reports lost callbacks separately from journal rows, and clears drag
continuity across missing transitions. A new recording scope does not inherit
earlier overflow. Thirty controlled actual-queue checks passed; physical provider
rate and native drag/scroll coverage remain qualification work.

MCP adapters since0.8.0 reconnect only readbacks after an engine disconnect. They never
automatically resubmit mutations, including schedules with idempotency keys.
Recover owned sessions/recordings before explicitly retrying uncertain work.
MCP `status.mcp_adapter.replay_policy: 1` identifies the loaded adapter; an
absent field means unknown/older policy. Existing MCP processes may retain older
JavaScript until their next launch; updating source or the native engine alone
does not prove their adapter changed. CLI/socket status describes the engine.

- `target_capture_options: 1`: explicit child-window setting and exact bundle
  exclusions for display/rect sources. Filters and resolved PIDs distinguish
  taps and preview lanes. Unsupported or missing exclusions fail explicitly.
- `source_journal: 1`: MCP `recording_source`, socket `record.source`, and CLI
  `record-source <recording_id>` return a bounded local source packet descriptor.
  The MCP rejects legacy engines before requesting the packet. See
  [SOURCE-PACKET.md](SOURCE-PACKET.md) for exact clocks, geometry qualification,
  encoded/held-frame links, gaps and interrupted checkpoint counters.
- `input_tap_faults: 1`: bounded timeout attempts, fresh background permission
  observations, explicit user-disable/exhausted/revoked states and deliberate
  listener recreation. Source input diagnostics summarize accepted notifications,
  not live health or complete delivery. See [SOURCE-PACKET.md](SOURCE-PACKET.md).
- Discovery and preview SDK work use shared three-second deadlines, with
  unfinished producers quarantined rather than repeatedly spawned. Recording
  startup retains its eight-second watchdog and unfinished admission slot;
  SDK startup timeout does not restart healthy peers. The candidate finalization
  watchdog isolates a take and retains unfinished admission; status advertises
  `encoder_failure_isolation: 1`. No deadline claims to cancel an uncooperative SDK.

Delivery evidence and unresolved gates are in
[qualification/GATES.md](qualification/GATES.md), with the active production
roadmap in [qualification/PRODUCTION-GOAL.md](qualification/PRODUCTION-GOAL.md).
Input provenance, supported automatic receipts, cross-display/sleep, daily-app
menus and realistic resource budgets remain qualification work. Visual effects
and composition recipes are deferred.

### Service-owned primary frame mapping (October 9)

Fresh MCP0.10.0 introduced read-only `recording_frame_map`; loaded adapter status
advertises `mcp_adapter.source_frame_mapping:1` and its own mapping/probe health.
The CLI `node /Users/taylor/src/github/dotfiles/src/record-screen/cli.mjs
frame-map JSON` is immediately available without restarting existing peers.
The native recorder remains f314bb340344; old MCP processes do not inherit new
JavaScript until their next safe launch. Missing adapter metadata means unknown.

Provide `recording_id` and exactly one query array: `frame_indices`, `relative_ns`,
or `host_ns`. Host queries require `clock_domain:"CLOCK_UPTIME_RAW"`; the service
subtracts the exact epoch using integer arithmetic. This declaration does not
calibrate a browser, OS input provider or physical presentation clock. Optional
`desktop_points:[{x,y}]` are projected inside the service. No frame-rate guess,
journal join, current-window lookup or geometry interpolation is needed.

```sh
node /Users/taylor/src/github/dotfiles/src/record-screen/cli.mjs frame-map \
  '{"recording_id":"rec_4k4zmzfr","frame_indices":[0,100,447],"desktop_points":[{"x":160,"y":558}]}'
```

Actual mux packets are inspected through a read-only inherited file descriptor.
Frames are ordered by presentation timestamps; `mux_packet_index` and accepted
submission sequence remain separate. Exact packet times join the recorded source
frame and its own geometry. Held content keeps its referenced source clock/map.
Outside intervals, missing durations/references and unavailable transforms are
explicit; no geometry is borrowed from a later/current frame. Inside the encoded
canvas is a bounds check, not visible content or semantic ownership.

Fresh MCP0.11.2 adds `mcp_adapter.source_region_mapping:1`. Optional
`desktop_regions:[{id,x,y,w,h}]` accepts up to16 uniquely named caller-declared
desktop-point rectangles. Each mapped frame returns its transformed quad,
source bounds, clipped polygon, `canvas_relation` (contained/clipped/outside)
and continuous `canvas_area_fraction`. `content_presence` stays unverified.
The same source-owned affine handles child fitting and held frames; a current
window or later geometry cannot replace it. Coordinates/dimensions are bounded
to10million points, width/height positive, ids64 ASCII identifier characters.
Source reads need no literal UI text.

Point and region projection now require declared canvas dimensions to match
the actual probed media stream. `muxed_canvas_pixels` reports measured width/
height; mismatched or missing dimensions leave projection unavailable while
exact timestamp correspondence remains separately reported. Unknown frame/
reference/transform stays unknown. Regions are continuous geometry estimates,
not decoded pixel counts, semantic extents, occlusion checks or proof of content.

```sh
node /Users/taylor/src/github/dotfiles/src/record-screen/cli.mjs frame-map \
  '{"recording_id":"rec_25rmhae4","relative_ns":["20000000000"],"desktop_regions":[{"id":"title_text","x":360,"y":88,"w":600,"h":70}]}'
```

The saved Finder check reports title/text outside parent and padded footage,
contained in full display. Actual pixels corroborate the title/text sample.
The parent canvas geometrically overlaps the declared panel while Quick Look
is absent: area fraction is not a content-presence confidence score. See
qualification/FINDER-TRANSIENTS.md and GATES.md stage40. Existing adapters keep
their loaded capabilities; CLI/fresh safe launches work without peer restart.

Failed/interrupted media can still yield known packet mappings. Correspondence
counts distinguish persisted packets, accepted submissions, exact matches and
unmatched tails; a complete journal alone is insufficient. The retained failed
writer take maps75 actual packets and reports2 unmatched accepted submissions.
Unreadable media, malformed/unterminated journals and changed snapshots refuse
without overwriting files or replaying capture/export work. Source clock continuity
is returned separately, with provider/physical uncertainty intact.

Bounds:1–64 queries,0–16 points,0–16 regions,120000 packets,250000 inspected journal rows,
64MiB regular journal,16MiB probe output,32KiB diagnostic output and1MiB response.
Regular file leaves are opened without following symlinks. Source reads/probes
each have10s budgets; initial OS open/read/close and process cancellation are not
hard real-time guarantees. One mapping/probe per adapter process; concurrent work
returns `frame_mapping_busy`. A timed-out child receives one owned stop and keeps
the slot quarantined until actual close. These limits are not a host-capacity
qualification, a filesystem lock or a claim that sibling adapters share admission.

Stage34 verified projected points against stage33 decoded markers, exact offset/
host exclusions through CLI/fresh live MCP, retained failed media, seven focused
mapping checks and eight adjacent adapter/planning checks. Capture/input ownership,
physical latency and arbitrary app transforms remain outside that proof.

### Bounded retained-input query (October 9)

Fresh MCP0.11.0 `recording_input` / CLI `input-query JSON` reads a terminal
recording's retained input without exposing the bulk journal or literal text:

```sh
node /Users/taylor/src/github/dotfiles/src/record-screen/cli.mjs input-query \
  '{"recording_id":"rec_EXAMPLE","from_relative_ns":"0","to_relative_ns":"30000000000","event_types":[10,11,12],"limit":64}'
```

Replace the example ID with an owned/relevant recording. Exact signed decimal
offsets use recorder reception time; the upper bound is exclusive and the
interval spans at most one hour. Default64/max256 events per page. Omit
`event_types` for all capture-retained event types; specify up to32 distinct CG
types when needed. Keyboard down/up/modifier types10/11/12 retain broad shortcuts
and same-app unresolved deliveries. Raw CG timestamps stay separate; raw pointer
coordinates are returned with `position_for_composition:null`.

Optional `action_tokens` is an OR filter over up to16 exact recorder tokens.
`include_unassociated:true` also preserves events with no token by default;
set false explicitly for a narrow contextual selection. Even a matching token
does not prove an actor: unrelated same-app activity during a declared block
can share it. Type/action filtered counts are mechanical query exclusions,
not a contamination estimate. Capture-excluded event contents cannot be recovered.

Pass the returned `next_cursor` verbatim as `cursor` with the same query. It binds
the source byte hash, canonical filters/interval/page size and physical row frontier.
Changed source or query refuses continuation; begin a new read. Duplicate events
are preserved in source-row order. Callback sequence is listener-instance receipt
order, not a global deduplication key or generation-order guarantee.

Response `coverage` retains scoped gap notifications even when event filters
exclude every event, plus whole-source counts, input scope/end and truncated
gap details. Untimed gaps remain explicit. Journal completion never establishes
input delivery or actual video coverage: input completeness is `unproven`, and
`video_coverage_evaluated:false`. Use `recording_frame_map` for media; consult
`recording_source` for source clock continuity and actions for rich semantic blocks.

The engine resolves paths from recording IDs. Only terminal sources are accepted;
leaf symlinks, nonregular files, identity/clock mismatches, malformed/unterminated
rows and protected-keyboard rows refuse the query. Whitelisted metadata excludes
unknown literal-text/clipboard fields. Limits:64MiB journal,250000 inspected rows,
1MiB line/response,32 reported interval/untimed gaps and a cooperative ten-second
read budget. Initial/open/read/stat/close OS calls are not hard real-time bounded.
One active query is admitted per adapter until actual read/close settles; sibling
adapters do not share global admission. Loaded status advertises
`mcp_adapter.retained_input_query:1` and `input_query.active`.

Six new and eight adjacent tests passed. Actual fresh MCP/CLI readback matches
12 retained keys to the scope-matched delivery oracle, across four pages. Six
belonged to the same app's other window and remain unresolved; a strict action
filter returns six, while two pointer events retain unqualified positions.
The failed wrong-oracle attempt and incorrect verification callback report were
preserved and corrected through separate typed outcomes; no source/input replay.
Native f314/PID35547 stayed unchanged/idle; existing peer adapters were not restarted.
See qualification/GATES.md, thirty-sixth pass.

### Destination-aware keyboard recovery (October 9)

Installed signed build53b202f58af8 tightens the keyboard foreground fallback:
when the CG destination names a different app, global foreground alone no longer
retains its unmodified keys. Unknown/nonpositive destinations retain the fallback.
Target-app keys remain generous with explicit unresolved window ownership;
bounded shortcut candidates and explicit all mode remain configurable. The old
failed cross-app take is retained beside the installed passing take, with exact
app-delivery joins and real shortcut execution. See qualification/GATES.md,
twenty-seventh pass. Actor identity and physical/global completeness stay open.
