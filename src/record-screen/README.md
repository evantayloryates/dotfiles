# record-screen

An always-on screen-recording engine that agents drive through a
`record-screen` MCP. This folder holds the engine (`record-screend`, Swift on
ScreenCaptureKit), its command line, and later the MCP shim.

Why it is built this way, with measurements:
`~/src/docs/html/record-screen-strategies/index.html`. Bench harness:
`~/src/docs/plans/record-screen/bench/`.

## Status

Steps 1 and 2 of the build order are done.

1. **Engine skeleton.** Runs at login, answers on its socket, reports status,
   holds its own Screen Recording grant.
2. **Frames.** Targets (display, rect, window), `frame.verify` through a warm
   viewfinder, and a frame outline that never appears in captures.

Recording, sessions and the MCP come next.

## Layout

| Path | What it is |
|------|------------|
| `engine/Sources/*.swift` | The engine. `main.swift` boots it; `Engine.swift` holds the methods; `SocketServer.swift` is the protocol; `Targets.swift` resolves targets; `Viewfinder.swift` is the warm stream behind `frame.verify`; `Overlay.swift` draws outlines. |
| `engine/Info.plist` | Bundle id `com.taylor.record-screen`, `LSUIElement`, App Nap off. |
| `build.py` | Compiles with `swiftc`, bundles, signs, stamps the source hash. Output: `data/record-screen/record-screend.app` (gitignored). |
| `install.sh` | Build, link `src/launchd/com.taylor.record-screen.plist`, load it, wait for the socket. Run by the top-level `install.sh`. |
| `cli.mjs`, `bin/record-screen` | Command line (also on PATH as `~/dotfiles/bin/record-screen`). |
| `lib/client.mjs` | Socket client shared by the CLI and the future MCP. |

Runtime state lives in `~/.record-screen/` (mode 700):
`run/engine.sock`, `run/engine.lock`, `logs/engine.jsonl`, `logs/stdout.log`,
`logs/stderr.log`, and `frames/` (verify images not tied to a session, pruned
after a day). `RECORD_SCREEN_HOME` overrides the root.

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
record-screen call <method> '<json params>'
```

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
