# Developer services through Tailscale — 1.9.27

The native/page bridge remains the routine control path. A separate paired
userspace RSD tunnel now makes the fixed app launcher, Web Inspector, full-screen
observer and DVT process profiler transportable through the phone's Tailscale IP.
It does not suspend Apple's remoted, create kernel routes, request sudo or use
USB/LAN as a hidden fallback. Each operation closes only its own tunnel.

## Installed on Taylor's phone

An existing trusted USB pairing bootstrapped Apple's separate RemotePairing
record without a new Trust prompt. The private record stays in ~/.pymobiledevice3;
it is never an MCP artifact or checked into source. Subsequent pairing verification
through Tailscale succeeded with autopair disabled. Runtime never attempts pairing.

`developer-tailnet.json` in the private ios-agent state directory selects the lane:

```json
{"version":1,"transport":"tailnet","address":"100.106.65.81","serial":"00008110-001451690A21801E"}
```

Require a regular private file (0600, no symlink), exact configured device identity
and an IPv4 tailnet address. The paired endpoint is currently port49152. RSD must
independently return the same device UDID. Missing configuration preserves the
nearby native-remoted observer/CoreDevice launch route; invalid configuration or
failed tailnet connectivity fails without switching to that route. Changing a
phone's advertised RemotePairing port requires requalification of that endpoint.
Do not print pairing records, enrollment URLs or a raw discovery dump.

## Agent workflow

- Diagnose host and current owner first. `ios_device_launch` reserves control and
  accepts only Kickoff DEV, Settings, Safari or Chrome. It preserves an existing
  app process and never invokes XCTest. Confirm native readiness with
  `ios_wait_ready`/`ios_begin`, or browser readiness with `ios_web_pages`.
- Inspector/profiling tools keep their existing owner, document, content and
  cleanup fences. They automatically use this transport when configured.
- Launch acceptance is not proof of foreground readiness. The physical smoke
  independently checked the foreground through the already-owned WDA session;
  routine native/page readiness should use its own bridge.
- Remote CoreDevice lock-state query returned CoreDeviceError in this experiment.
  This launcher therefore reports lockState unknown. It does not infer a lock
  or disconnected cable, enter a passcode, or retry an unknown dispatch.
- Browser enrollment URL delivery now uses this paired lane when configured.
  `ios_web_enroll browser=ios-safari|ios-chrome` sends the private URL through
  CoreDevice appservice with a structured payloadURL and fixed browser bundle,
  activates=true and terminateExisting=false. No Safari-to-Chrome handoff or
  lock-state preflight is needed. Inspect `launch` and then `ios_web_pages`: an
  accepted dispatch is not page readiness. Unknown dispatch is never replayed.
  The URL and fragment stay in private files/stdin, never public summaries.
- The Lock Screen shortcut and signed build installation retain their existing
  provisioning path. This increment does not claim to make them remote.

## Evidence and boundaries

The physical phone accepted a paired TCP/PSK tunnel through its explicit Tailscale
address, exposed73 RSD services, and answered Web Inspector plus DVT lookup.
Safari, Chrome and Kickoff DEV launches were independently confirmed in front.
Both browsers' configured DEV documents were read over the tailnet Inspector lane;
three process samples completed and the profiler stopped. Original XCTest owner
and runner remained active. No new XCTest session or authorization was requested.
See developer-tailnet-physical-2026-10-11.json.

The phone was still nearby during these tests. Explicit overlay routing with no
USB fallback is meaningful transport proof; it is not a substitute for the next
physical off-LAN/cellular acceptance. The service must not claim that gate passed.
The existing WDA HTTP endpoint already uses Tailscale; its fresh status read passed.
That is existing functionality, not a new unauthenticated runner adoption path.
Remote RSD pairing also does not grant an XCTest authorization exemption.

Primary mechanisms: [pymobiledevice3 network stacks](https://doronz88.github.io/pymobiledevice3/guides/network-stacks/),
[RemoteXPC pairing](https://github.com/doronz88/pymobiledevice3/blob/master/misc/RemoteXPC.md).

Specific-page Safari/Chrome payload delivery passed through the explicit tailnet
provider under the held original owner. Read-only Inspector target metadata and
independent WDA foreground identified the intended browser and probe URL. Full
MCP-owned enrollment under a fresh owner remains a separate post-hold gate.
A system Watch update alert temporarily covered Safari; its exact observed Dismiss
button cleared it without changing Watch settings. See browser-launch-physical-2026-10-11.json.

## 11 October: actual untethered cellular boundary —1.9.43

With USB independently absent and Wi-Fi IPv4 absent, fresh owned native
readiness, React1577-node inspection, GraphQL and a committed Home-tab route
passed. The separate developer endpoint49152 refused, so paired Home/screenshot
sent no input. Wi-Fi On through the app-owned Shortcut restored IPv4 and the
paired endpoint without USB. Both Safari/Chrome direct DEV URL delivery, page
readiness and Inspector then passed on Wi-Fi, with indicators off afterward.
This is not cellular foreground/Inspector qualification.

Keeping one authenticated paired tunnel and DVT channel open did not survive a
correctly encoded Wi-Fi-Off transition. Its attempted On failed before input;
normal native recovery restored Wi-Fi. Earlier plus-encoded shortcut experiments
never changed Wi-Fi and are excluded from retention evidence. Reuse this failure;
do not repeat the same retained-channel approach.

`ios_doctor connectivity=true` now reports `developerEndpointTCP` separately:
accepted, refused, timeout, unavailable or null when not probed. It checks only
fixed49152, at most1.5s, and skips the probe during another owner. TCP acceptance
is not authenticated RSD or system-input readiness; refusal does not establish
lock, missing USB or VPN failure. Use the surviving app/page bridge for recovery.
See untethered-cellular-developer-boundary-2026-10-11.json.
