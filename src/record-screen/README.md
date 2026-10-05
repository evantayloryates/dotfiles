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
| `engine/Sources/*.swift` | The engine. `main.swift` boots it; `Engine.swift` holds the methods; `SocketServer.swift` is the protocol; `Targets.swift` resolves targets; `Viewfinder.swift` is the lane pool behind `frame.verify`; `Overlay.swift` draws outlines. |
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
| `overlay.show` | `{target, label?, seconds? (8; 0 = until hidden), overlay_id?, session_id?, capturable?}`; ids become `<session_id or shared>:<overlay_id>` |
| `overlay.hide` | `{overlay_id?, session_id?}`: one outline, one session's, or all |
| `viewfinder.stop` | stops every warm lane now (they stop themselves after 20 s idle) |
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