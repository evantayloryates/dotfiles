# Developer relay — nearby MCP delivered, cellular still unqualified

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
adds the fixed reflected route plus socket/frame/byte diagnostics. It built and installed with verified delivery98f3c307b304471e904c86b56b8a3c91.
Physical reflected existing-trust pairing passed. The authenticated secondary
TCP/PSK tunnel then passed independent RSD device identity through Tailscale.
No native secondary-port support or background runner was needed. A subsequent
probe retired native input, acquired a fresh exclusive launch reservation,
opened Chrome with an Apple foreground event, and issued fixed Home cleanup.
The secondary tunnel survived retirement of the original app relay. An initial
reservation attempt omitted required owner identity fields; this was corrected
without weakening the owner check. All these phone probes had Wi-Fi present;
cellular qualification remains separate. Fresh Chrome page readiness and a real Web Inspector rendered-DOM read also
passed through the detached tunnel. The SDK reported connected, complete and
visible; its ownership indicator had not yet observed the newly acquired web
lease, so that read is not promoted into owned input proof. Cellular transport
and normal MCP lifecycle integration are the next gates.
No public MCP relay tool is enabled until that and the subsequent identity,
secondary-port, background and cleanup gates pass. Preserve the working native
and Safari routes on failure. Personal DEV only; staging remains deferred.

References: https://github.com/xddxdd/sidestore-vpn (public-domain reflection
implementation and Tailscale example); https://github.com/StikDebug/StikDebug
(on-device developer loopback VPN prerequisite).

Provider source: paired_transport.py and the pinned pymobiledevice3
RemotePairingProtocol.start_tcp_tunnel implementation. Background execution has
its own iOS scheduling limits; a paid membership does not remove them.

## Integration shape after qualification

Keep ordinary agent calls simple. A managed developer-transport worker should
bootstrap via a native owner only when needed, retire native input, and carry
the independently verified secondary RSD channel into a fresh launch/web owner.
Reuse existing browser-debug implementations against that RSD connection; do
not introduce a second browser-control API. Every operation checks the current
owner and document. Begin/end, lost connection, timeout and turn cleanup close
the worker; a short idle adoption window may bridge enrollment to web begin.
No persistent phone background task is required by the nearby POC.

The first cellular probe reached fresh native state with Wi-FiIPv4absent but
failed before any relay frame (connect exit5, errno36/EINPROGRESS retained by the
one-second select path). This is not yet proof of a route or authorization
denial. The next changed condition warms the Tailscale peer and records packet
request/reply timings. Wi-FiOn and Home were restored; independent USB display
readback confirmed Home. USB remains attached, and no USB fallback is in the
relay path. A stale foreground readiness race after Home was separately fixed
with a post-transition fresh-observation fence and one focused broker check.

The peer-warmed cellular run recorded two requests and one reply. The first
reply arrived 1.113 seconds after the first request, beyond the native one-second
connect window. The old capture did not classify TCP flags, so a successful
SYN/ACK is not claimed. Build9e193383aa2b45bcb4a4113681b1da02 raises that bounded
window to five seconds and records SO_ERROR/ETIMEDOUT plus connect duration.
The next capture distinguishes SYN/ACK from reset. The browser gate also checks
owned glow, fixture fill/Save/readback, Inspector and release, using the SDK
result envelope correctly. These are candidate gates, not delivered claims.

The changed-condition capture now establishes an actual refusal: the phone's
SYN (sequence3448443502) received RST/ACK acknowledging3448443503, not SYN/ACK.
Native connect returned ECONNREFUSED in191ms. Wi-Fi was restored, the owner
released, page indicators off, and Home requested. Stop increasing the timeout.
This qualifies the Wi-Fi-off boundary, not all possible cellular/radio states.

The managed nearby worker subsequently passed two exclusive owner handoffs,
Chrome foreground, owned glow, fill/Save/committed readback, real Inspector,
Home request, owner release and indicator-off. The new actual MCP `ios_web_open`
→ `ios_browser_debug` → `ios_web_end` path also passed. Its reflector starts
from a private pinned container configuration and stops once the independently
authenticated secondary RSD connection exists. No phone background task is
needed. MCP end closes the channel; owner loss closes without further input.
The approved node remains temporary qualification infrastructure. Permanent
provisioning and the cellular launch/Inspector edge remain open. Reusing an
already visible web page avoids this bootstrap entirely.

## Phone-local Chrome Shortcut experiment

`shortcuts/open-chrome-dev.shortcut` is an Apple-signed export of
**Runner Open Chrome DEV**. It contains one **Open URLs** action taking
**Shortcut Input**, with **Stop and Respond** when no input is supplied.
It embeds no enrollment URL or credentials. Import/sync alone is not setup
completion: the physical phone displayed a first-run privacy permission to
open Chrome.

The bounded `probes/chrome_shortcut.py` validates the ordinary fixed DEV URL
before passing its Chrome scheme as percent-encoded Shortcut input. Existing
paired Tailscale invocation reached that first-run permission; it has not yet
proved a fresh Chrome page, persistent permission or cellular launch.
`probes/shortcuts_allow.py` is a narrow qualification probe, not a shipped
general system driver. Shortcuts AX exposed the underlying library; SpringBoard
exposed the status bar. No activation was sent. A weak early title match on
the shortcut library cell was discarded and the guard corrected before input.

The explicit XCTest fallback started once, remained pending, and independent
USB display showed the Shortcut permission over a passcode keypad. A concise
setup unblock was requested. Resume the same live attempt; never restart it
merely to produce another prompt. After Allow, require a fresh Chrome document,
then one separate new launch to test permission persistence. Only then consider
a phone-local Focus automation for cellular launch. A nearby Shortcut invocation
does not establish a cellular execution path or remote Inspector access.
See `chrome-shortcut-candidate-2026-10-11.json` for artifact hashes and receipts.
