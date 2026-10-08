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
The installed build 775 predates this adapter; do not report it live until a new
bundle is installed and tested. The nineteen host/transport tests also passed.
