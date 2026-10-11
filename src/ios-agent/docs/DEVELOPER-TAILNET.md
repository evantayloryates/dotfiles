# Developer services through Tailscale — 1.9.25

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
- Browser enrollment URLs, the Lock Screen shortcut and signed build installation
  still use their existing CoreDevice paths. This increment does not claim to
  make those provisioning operations remote.

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
