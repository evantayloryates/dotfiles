# Capture foundation qualification

This is an opt-in qualification kit, separate from the installed recorder. It
does not change grants, synthesize input, filter user input, or restart either
service. Use computer use to interact with the fixtures. The native fixture
activates its own window; arrange production time before opening it.

The October 8 findings and proposed service contracts are in
[STRATEGY.md](STRATEGY.md). Effect styles and compositing recipes are deferred.

## Helpers

Build Swift helpers into a task-owned output directory with `swiftc -O`.
`capture-probe.swift` and `stream-probe.swift` also need `-parse-as-library`.
Use the current SDK and existing Screen Recording/Input Monitoring grants.
No helper requests a new grant.

| File | Purpose |
| --- | --- |
| `capture-probe.swift` | SCK screenshots, explicit pointer/child settings, capture transforms, optional helper-app exclusion |
| `stream-probe.swift` | At most 60 seconds of frame timing/geometry metadata; no encoder or input |
| `event-preflight.swift` | Existing permissions; demonstrates why unposted event timestamps cannot calibrate sync |
| `event-observer.swift` | At most 180 seconds, listen-only annotated-session tap; fixture destination or foreground evidence, key codes without text |
| `native-fixture.swift` | AppKit caret, app-painted arrow, native menus, controlled move and occlusion; task-local delivery log |
| `browser-fixture.html` | HTML menu, native menu/select targets, CSS cursor and content-painted cursor/caret, bounded local event counter |
| `serve-fixture.py` | Loopback-only fixture plus explicitly supplied cursor file; no directory exposure |
| `overlay-inventory.swift` | Window metadata for one supplied process only |
| `usage-inventory.py` | Native CUA tool namespace inventory across a supplied transcript directory; metadata only |
| `bridge-probe.mjs` | MCP initialize/tools-list only, no app-server/model turn |

`capture-probe WINDOW_ID MODE OUTPUT.png [CURSOR] [CHILDREN] [MARGIN] [EXCLUDE_PID]`

Modes: `isolated`, `included-window`, `app`, `rect`, `rect-excluding-pid`.
Exclusion is for the supplied, verified process only. Padding applies to
display-bound modes; isolated-window capture stays at the window's size.
For a baseline, change one setting at a time. A capture error is a finding,
not proof that the target is empty. Inspect saved images and actual stream
frames, not just automation screenshots.

`event-observer FIXTURE_PID SECONDS OUTPUT.json`

Resolve PID/window ID again before and after a take. Discard comparisons
spanning a fixture restart. Global focus is weaker than explicit delivery;
an AX button action can change pixels without any mouse event. This probe's
scope rule is deliberately simple, not the final event relevance policy.
Outside-scope input contributes counts only. Capacity/disabled-tap counters
must stay explicit; production callbacks need further load qualification.

`stream-probe WINDOW_ID SECONDS OUTPUT.json`

Frame PTS, Mach display time converted to nanoseconds, callback reception,
scale, content rect and screen rect are preserved. Clock agreement does not
establish an action-to-pixel latency bound. Never interpolate through a
display reconfiguration without starting a new geometry segment.

## Fixture and cleanup

Wrap the native binary in a task-owned `.app` with a matching
`CFBundleExecutable`, `CFBundleIdentifier`, `CFBundlePackageType=APPL` and
`NSHighResolutionCapable=true`. It writes `native-delivered-PID.jsonl` beside
the bundle, containing no characters. Prefer its observed AX controls over
hard-coded coordinates. Use its explicit edge-menu button for repeatable
child-window tests; also test genuine right-click delivery separately.

Serve the browser fixture with:

```sh
python3 src/record-screen/qualification/serve-fixture.py --cursor /Users/taylor/Desktop/cursor.svg
```

Use an owned temporary tab. The default URL is `http://127.0.0.1:47861/`.
Close only owned tabs/windows, stop owned servers/taps, confirm no active
recordings or fixture process, and preserve evidence privately outside Git.

## Known experimental limitations

- Initial fixture crashed on closing a retained AppKit window. The final
  source uses `isReleasedWhenClosed=false`; closing the repaired occlusion
  window and main window was verified. This was a fixture defect, not an
  observed recorder failure.
- Initial event tap and first foreground-only comparison are insufficient
  to establish telemetry coverage. Destination-aware retest succeeded.
- Screenshot helpers initially used 1× scale before correction. Historical
  outputs retain their actual pixel sizes. Earlier isolated metadata could
  report requested padding although the image stayed at window size.
- `includeChildWindows` behavior must be tested per app/mode/OS. October 8
  AppKit results are evidence, not a universal guarantee.
- CSS/system pointer suppression and browser native menus are not fully
  qualified. Chrome on another Space retained an automation pointer-like
  residual and produced errors in some capture modes.
