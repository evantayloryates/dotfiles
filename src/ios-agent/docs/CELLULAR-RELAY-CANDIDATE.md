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
channel. Bind host ingress to loopback, keep phone destinations fixed to loopback or the approved single reflection address,
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
an independently viewed OS Open confirmation. The1.9.46 HTTPS candidate was physically installed and tested: ordinary HTTPS
opened Safari on this phone, so it does not qualify a Chrome-specific launch.
The paired developer route did open Chrome, establish an owned ready page,
verify an editable value and release the glow. MCP1.9.47 now refuses the
unqualified Chrome auto fallback before input; explicit app mode remains an
experiment. App-owned Home cleanup was independently viewed on the full display.
Explicit USB screen recovery also passed through the actual MCP entrypoint;
it is read-only, opt-in and never an automatic tailnet fallback.

## Changed-condition results and next gate

The first native relay build (4c713076a2394c00beb5a2bc42190ff7) failed because
Xcode compiles the injected delegate as Objective-C; replacing C++ atomics with
C atomics fixed the actual compilation mode. Cached retry0097df7a47ce4182a91587044fa1e757
completed, was signed, and installed with verified native identity.

Two foreground direct-loopback probes did not complete existing-trust pairing.
The second changed startup order by queuing provider bytes first. It recorded
one exchange frame,203consumer bytes and zero phone bytes, then timed out.
This proves neither a working pairing channel nor an OS policy denial. Both
probes released their owner and issued app-owned Home cleanup. No new pairing,
XCTest, Mirroring or protocol payload logging was used.

The next condition uses a narrowly scoped packet-reflection route inspired by
SideStore. The fixed destination is10.7.0.1:49152; the temporary Linux reflector
admits only this phone's Tailnet IPv4/TCP49152traffic, swaps IP addresses, and
expires automatically. Existing Tailscale stays the phone's VPN. An isolated
Linux/TUN test passed an exact TCP round trip (10packets/588bytes) and removed
its interface on exit. This is Linux mechanism proof, not iPhone proof.

Taylor approved temporary node runner-relay-test and only10.7.0.1/32. The
personal account and persisted approval were independently read back; exit-node
access remains disabled and SNAT is off. Native candidate71ca6285b9f943c383ab5b0720c48a8e
adds the fixed reflected route plus socket/frame/byte diagnostics. It is building;
install and one physical reflected existing-trust handshake are the next gate.
No public MCP relay tool is enabled until that and the subsequent identity,
secondary-port, background and cleanup gates pass. Preserve the working native
and Safari routes on failure. Personal DEV only; staging remains deferred.

References: https://github.com/xddxdd/sidestore-vpn (public-domain reflection
implementation and Tailscale example); https://github.com/StikDebug/StikDebug
(on-device developer loopback VPN prerequisite).

Provider source: paired_transport.py and the pinned pymobiledevice3
RemotePairingProtocol.start_tcp_tunnel implementation. Background execution has
its own iOS scheduling limits; a paid membership does not remove them.
