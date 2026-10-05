# record-screen

An always-on screen-recording engine that agents drive through a
`record-screen` MCP. This folder holds the engine (`record-screend`, Swift on
ScreenCaptureKit), its command line, and later the MCP shim.

Why it is built this way, with measurements:
`~/src/docs/html/record-screen-strategies/index.html`. Bench harness:
`~/src/docs/plans/record-screen/bench/`.

## Status

Step 1 of the build order is done: the engine skeleton. It runs at login,
answers on its socket, reports status, requests the Screen Recording grant and
proves ScreenCaptureKit works. Frames, recording, sessions and the MCP come
next.

## Layout

| Path | What it is |
|------|------------|
| `engine/Sources/*.swift` | The engine. `main.swift` boots it; `Engine.swift` holds the methods; `SocketServer.swift` is the protocol. |
| `engine/Info.plist` | Bundle id `com.taylor.record-screen`, `LSUIElement`, App Nap off. |
| `build.py` | Compiles with `swiftc`, bundles, signs, stamps the source hash. Output: `data/record-screen/record-screend.app` (gitignored). |
| `install.sh` | Build, link `src/launchd/com.taylor.record-screen.plist`, load it, wait for the socket. Run by the top-level `install.sh`. |
| `cli.mjs`, `bin/record-screen` | Command line (also on PATH as `~/dotfiles/bin/record-screen`). |
| `lib/client.mjs` | Socket client shared by the CLI and the future MCP. |

Runtime state lives in `~/.record-screen/` (mode 700):
`run/engine.sock`, `run/engine.lock`, `logs/engine.jsonl`, `logs/stdout.log`,
`logs/stderr.log`. `RECORD_SCREEN_HOME` overrides the root.

## Commands

```bash
record-screen status     # engine, signing, permission, clock, displays
record-screen ping       # round trip in ms
record-screen grant      # macOS Screen Recording prompt (shows once per app)
record-screen probe      # list content + 64 px screenshot, with timings
record-screen restart    # kickstart the LaunchAgent and wait for it
record-screen build      # rebuild if sources changed, then restart
record-screen logs 50    # tail the engine log
record-screen call <method> '<json params>'
```

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

`clock.uptime_ns` is `CLOCK_UPTIME_RAW`, the same clock as ScreenCaptureKit
frame timestamps and Hammerspoon's `hs.timer.absoluteTime()`.

Only processes running as this user can connect: the socket is mode 600 and
the engine checks the peer's uid.

## Behaviour that matters

- **Never takes focus.** The engine runs with the `prohibited` activation
  policy and `LSUIElement`. Measured: the usual accessory policy activated a
  helper once at launch; prohibited never did.
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
