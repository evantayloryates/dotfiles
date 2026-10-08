# Qualification record — 7–8 October 2026

The service is personal development tooling. Customer production instrumentation
is excluded. Claims below distinguish a prototype, a synthetic integration test,
and the installed real-device service.

## Evidence established

- The physical input prototype delivered native UIEvents on iOS 26.7.1. Nutrition
  opened and Home returned, independently observed through iPhone Mirroring.
  It used a temporary loopback adapter; it was not the installed network SDK.
- The UIKit simulator fixture verified taps, a long press, scrolling, UIKeyInput,
  occlusion rejection, stale snapshots, hit-through glow, preservation of layout
  and key window, old-gesture cancellation fencing, and native expiry.
- Nineteen host/transport tests passed, including the real pinned React frontend
  with a synthetic component and independently specified hook value, unauthenticated
  WebSocket rejection, private sockets/files, provider failure/recovery, and
  completion cleanup. Native mutations are never automatically replayed.
- The SDK compiled with DEBUG=0 and the opt-in macro still defined contains no
  agent, glow or private HID symbols. This is an exclusion compile gate, not a
  completed customer Release build or App Store submission qualification.
- The Mac and iPhone are enrolled in the existing personal Google Tailscale account.
  iOS Settings shows the Tailscale VPN installed and Connected. Restarting the
  Tailscale app cleared its stale Install onboarding page. Tailnet ping succeeded
  through DERP; direct peer connectivity is not a prerequisite.
- Private HTTPS Serve targets loopback port 19403. Certificate validation succeeds
  and unauthenticated device requests are rejected. Funnel remains off.

## Review and fixes

Review covered the broker, local CLI, installer, build wrapper, native SDK,
React prelude/provider adapter and app integration. Startup failure now rolls
back its lease. The CLI status output omits the owner capability; its regression check runs against the real lease. Provider failure revokes control; owned process groups receive
bounded cleanup. A new owner cannot race unfinished frontend cleanup. Background
notifications fence pending network responses so an old response cannot restore
an expired session. Native trees flag both count and depth truncation. The observer also expires
in-flight commands even when the client stops polling; the original owner
capability can recover a terminal unknown outcome without regaining control.

The first build-wrapper iteration bundled the JS adapter but did not activate
the native SDK: its flags did not reach AppDelegate's compiler. The wrapper now
sets both C and C++ flags and requires agent classes in the actual Mach-O product,
including Xcode's separate Debug dylib. Installation success alone is not
accepted as proof. The corrected product passed the binary gate and was then installed. Its
authenticated SDK registered through Tailscale; native and React checks passed
on that installed connection.

The installer also tolerates the observed short launchd registration race after
bootout, with a scoped, bounded retry and no elevated permissions or unrelated
service restart.

## Installed service gates

The installed SDK registered through private Tailscale HTTPS with matching
read-back enrollment. Its first Home snapshot had 330 native views, maximum
depth 49 and no truncation. React initially reconstructed 1,034 components;
inspection returned props and eight hooks for ClientNutritionTabs. Native
Nutrition/Home taps and a drag revealing earlier rows were independently
observed through Mirroring. Profiling captured ten commits. App-window images
visually exclude the glow; Mirroring shows the glow and absence of debug bars.

A SIGKILL of the scoped installed host restarted it, reconnected the device
and revoked the old lease in 1.33 seconds. The glow disappeared independently
and the old owner capability was rejected. Reacquisition restored native and
React access. Home/foreground exit revoked the lease with reason
`device_foreground_lost` and stopped the frontend. Telemetry is a recent
request snapshot; foreground metadata can lag concurrent background requests.

React frontend ports are dynamically allocated and IPC directories belong to
individual leases. This permits isolated tests alongside a live phone session
and prevents delayed old-host cleanup from unlinking replacement sockets.
The CLI waits for socket readiness only before sending a command; it never
replays accepted input or inspection requests.

The installed cellular gate passed on 8 October with the user confirming USB
unplugged and Wi-Fi disconnected. Native and React inspection, login navigation,
UIKeyInput entry of a reserved synthetic phone number, clear and screen restoration
all passed through Tailscale. Continue was never submitted. A 1,100 ms hold
delivered native events and moved the caret; this is not a complete physical
long-press recognizer or keyboard matrix. Explicit release left no lease, no glow
and no React frontend. See `cellular-smoke-2026-10-08.json`.

The Mac VPN was initially stopped. Reconnecting the existing Tailscale account
restored the app channel. A separate foreground interruption revoked control
and required a fresh lease; its cause was not established. The evaluation iproxy
was stopped before installed-SDK testing. No XCTest or Mirroring was used for
this cellular test.

## Boundaries

The driver controls foreground app-owned views. It does not control Settings,
Apple authentication, system overlays, or hardware buttons. UIKit private event
construction must be requalified when iOS changes; Mirroring and bounded WDA
remain fallback lanes. Main-window captures cannot prove whole-phone occlusion.

Console metadata is available while original console behavior is preserved;
full console bodies, typed domain operations and remote Metro/build delivery
are separate integrations. A foreground app connection is not evidence that
coach web, Android, live-call recording or every app workflow is ready.

## Next adapter qualification

Six metadata-adapter tests passed on 8 October: bounded/private snapshots,
console argument/receiver preservation, fetch response/rejection preservation,
getter avoidance, lease generation fencing and handler cleanup. Console/network
records are cleared at session end and publishing is coalesced to five updates
per second. Coverage is global fetch only; call sites expose numeric positions,
not raw stacks. Runtime error metadata preserves the original global handler.
The new bundle compiled through the real Metro wrapper and passed the native
binary gate without source changes. It was installed on the physical phone
preserving enrollment. Native-to-JavaScript protocol fault injection recorded a
metadata-only error; a fresh lease cleared that record and restored standard
React inspection. The welcome screen remained unchanged and cleanup removed
control, glow and the frontend. See `installed-metadata-smoke-2026-10-08.json`
and `installed-metadata-build-2026-10-08.json`. This qualifies session wiring,
not a full physical HTTP/console/global-handler matrix. A seventh host test
executes the actual Babel-transformed bridge against synthetic native events.

Immediate reacquisition exposed a status clarity gap: a stopped active frontend
was reported false while its process was still retiring. Acquisition correctly
refused to race cleanup. Status now exposes `reactFrontendCleanupPending`, and
a regression test verifies it remains true until process exit is observed.
Twenty host/transport tests pass; the updated host was restarted at idle.
The final live smoke matched the running source hash, reconstructed the real
React app, observed pending cleanup during release, then verified no pending
cleanup, no lease, no glow and no frontend. Local GraphQL and the web sign-in
page independently returned HTTP 200. See `final-host-smoke-2026-10-08.json`.
Remote Metro delivery and read-only domain status now have installed gates below.
Complete authenticated coach/client business workflows remain separate.

## Private remote runtime qualification, 8 October

The managed Metro LaunchAgent binds only 127.0.0.1:19404 with two workers and
discarded stdout/stderr. Installation verifies the existing personal tailnet,
every matching guarded local backend worker, GraphQL/web HTTP readiness and the
actual device bundle's configured URLs. Serve ports 10444/10445/10446 provide
Metro, local GraphQL and local web; port 10443 remains the agent channel. Funnel
is off and other routes are preserved. `mobile/local-env.js` stayed unchanged.

Twenty-four Python and ten JavaScript checks pass, including private config
validation, no-clobber Serve ownership, static route literals/constants, domain
payload exclusion, lease fencing, real Babel bridge events and the actual Metro
transformer. The real bundle exposed a relative-filename mismatch; a regression
now covers it. The installed phone exposed an upstream React Native overload
that discards HTTPS. The full overload preserves the scheme without patching
dependencies. Release and ordinary Debug native compile exclusions passed again.
Targeted app lint has no added findings; existing formatting/unused-import
findings remain.

The installed phone loaded its existing local client session through HTTPS and
reported `ClientDashboard`, seventeen active Apollo queries, and 1,010 React
components. A fixed read-only GraphQL readiness query returned HTTP 200; its
warning and request yielded metadata only. A native tab tap committed
`ClientSchedule`, independently asserted through the registered navigation ref.
Home was restored. A temporary JavaScript marker changed live without native
rebuild or process relaunch, and was restored. This is a narrow live-update gate,
not a complete React Fast Refresh state-preservation matrix.

With Metro stopped, the fixed semantic reload selected the embedded bundle and
reconstructed the client dashboard and 1,010 React components in 3.9 seconds.
After Metro returned, another Tailscale reload selected `tailnet-Metro` and
restored inspection without CoreDevice, XCTest or Mirroring. State now exports
only the bundle-source enum; reload clears its cached ready flag. Explicit
release ended each lease and inspection process. The offline check covers Metro
absence at selection time; an interrupted download after a successful health
check is not yet an automatic-fallback guarantee. The upstream health check can
wait up to ten seconds when a server is unreachable.

See `remote-runtime-host-smoke-2026-10-08.json`,
`remote-runtime-build-2026-10-08.json` and
`remote-runtime-installed-smoke-2026-10-08.json`. USB remained attached for the
one-time builds. This exact build's additional cellular gate is pending; the
earlier installed-driver cellular gate remains separately qualified. Full
global-error forwarding and business-workflow matrices remain open.

## Current staged qualification checkpoint, 8 October 2026

The extended suite passed 65 Python checks, 18 JavaScript checks and 31 UIKit
simulator gates. The simulator used independent callbacks and state assertions;
its app registration was verified absent before shutdown. Physical React Native
gestures, software keyboard, secure fields and system occlusion are still open.

The newest telemetry/input native build passed build/source-stability/adapter
gates and installed. Native executable SHA-256:
`f3fbe29db82dab3ed5ca4da6d10e3362535d2aa0627d5850e214aa0dcb0e0780`.
Embedded JavaScript SHA-256:
`12b16ad2b45da4c373282d95a683db3ae9e49167b488a068cf8577093b6f374e`.
Its fixed diagnostics matrix uses device-global fetch with isolated telemetry
and a synthetic ErrorUtils receiver, preserving the real handler identity; it
does not intentionally invoke the app’s crash reporter. Installed physical
matrix acceptance remains pending.

Read-only `doctor` currently passes host-source, private Serve/Funnel, guarded
local backend and HTTP checks, while separately reporting no registered phone.
Explicit `stack-ensure` passed live warm reuse without spawning or stopping
workers or resetting data. It checks the actual local Docker socket and preserves
new/uncertain device ownership after Docker startup. Cold recovery has unit
coverage but not a controlled live CLI outage/recovery result. Real prior Docker
outages were recovered with the canonical launchers; their cause is unknown.

The local paired-login helper compiled and passed 45 focused identity,
transaction/file-lifecycle and existing local-access checks. A successful live
mint verified hashed token storage, single use and expiry; both tokens were
retired immediately and private credentials removed. Signed-in browser/phone
behavior and reversible nutrition-target equality/restoration remain unqualified.

The phone’s app did not open when tapped, and developer foreground requests
timed out, including with Metro temporarily stopped and subsequently restored.
A restart was requested; the developer channel disconnected, but restart
completion and the cause are unverified. One physical unlock confirmation is
pending. No XCTest was started. Host-idle verification passed; native cleanup
cannot be freshly confirmed while the app bridge is offline.

The current 16-step report is at
`/Users/taylor/src/docs/html/iphone-link-status-update/index.html`.
Refresh it as specified in [PROGRESS.md](PROGRESS.md), keeping this checkpoint
separate from older installed/cellular results.
