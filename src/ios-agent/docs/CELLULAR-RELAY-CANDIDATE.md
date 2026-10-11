# Cellular developer relay — concrete candidate, not delivered

11October physical evidence changed the next experiment. External tailnet TCP49152
refused with Wi-FiIPv4absent, but the signed DEV app connected to both127.0.0.1:49152
and[::1]:49152. Neither probe sent authentication or protocol bytes. Native Focus
foreground and ordinary HTTPS control passed under the same cellular condition.
See focus-cellular-mcp-2026-10-11.json.

The smallest useful next gate is one authenticated RemotePairing handshake through
an outgoing native relay, while DEV remains foreground. Reuse the existing trusted
host record with autopair=false and independently match the device UDID. Never
export the record, make a new pairing request, or claim TCP acceptance proves it.

The pinned provider then creates a second TCP/PSK listener on a returned port for
its userspace tunnel. A49152-only byte relay cannot carry the whole developer
channel. Bind host ingress to loopback, keep phone destinations loopback-only,
and admit a subsequent port only from the authenticated pairing result. Bound
connections, buffered bytes and lifetime; tie every dispatch to the shared owner.
Carry encrypted bytes without writing payloads into artifacts or model context.

Next gates after authenticated foreground success:

1. One browser foreground request through the relay, then independent page readiness.
2. One bounded Inspector read after DEV backgrounds. Measure the actual available
   background execution window; do not assume a persistent socket stays scheduled.
3. Explicit stop/owner-loss/expiry and restored device presentation. Do not extend
   ordinary native input into the background or keep a hidden perpetual runner.

The1.9.45 native private-URL handoff passed cellular Safari launch and owned DOM
fill/Save/React readback, with glow-off. Its Chrome custom scheme instead produced
an independently viewed OS Open confirmation. The1.9.46 candidate uses ordinary
HTTPS into the existing default Chrome browser and still requires physical
qualification. Use qualified app-owned routes for opening; reserve the relay for
actual deeper Inspector/system gaps. A failed relay must not remove that working control path.
This is personal DEV only; staging remains deferred. No relay tool is enabled yet.

Provider source: paired_transport.py and the pinned pymobiledevice3
RemotePairingProtocol.start_tcp_tunnel implementation. Background execution has
its own iOS scheduling limits; a paid membership does not remove them.
