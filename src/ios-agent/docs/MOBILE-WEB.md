# Dev mobile-web driver

Use actual Safari and Chrome on the iPhone. The adapter lives in an explicitly
enrolled local development document. Requests return through the existing
private HTTPS web origin to the same broker as native control.
Named profiles keep separate local stacks: `app` uses 10446→3000/4000;
`call-rig` uses 10520→3020/4020. Both remain private; Funnel stays off. Physical browser opening
through CoreDevice is a provisioning convenience, not the operating transport.

## MCP workflow

1. `ios_web_pages`: reuse a fresh visible, ready enrolled iPhone page in the intended browser. Do not reenroll a working tab.
2. Only if no usable enrollment exists, `ios_web_enroll`: obtain a private JSON launchFile, never print its URL
   fragment. Enrollment expires in five minutes and is single-use, origin-bound.
   Pass optional `browser: ios-safari|ios-chrome` to request an idle-only,
   atomically reserved launch on the privately configured device.
   Launch acceptance is not page readiness. Otherwise open its private URL in the intended browser. On the paired developer channel,
   `devicectl device process launch --payload-url` can open Safari or Chrome.
   Off-network, an already enrolled browser tab is sufficient for page control;
   an offline/closed browser cannot be remotely launched by this page adapter.
   The separate fixed `ios_device_launch` supports an explicit paired developer
   tunnel through Tailscale; see DEVELOPER-TAILNET.md. Enrollment URL delivery
   uses paired appservice when that lane is available. When developer TCP refuses,
   the provisioned native Focus route and1.9.45 app-owned Safari private-URL
   handoff passed cellular launch and DOM control. Chrome's app handoff and deep
   cellular Inspector remain unconfirmed. Require actual page readiness after
   every prepared handoff.
   Then `ios_web_pages`: choose the actual page ID and browser, check visible/ready
   and age. Desktop WebKit is not evidence of a physical iPhone.
3. `ios_web_begin`: one session per work turn. This acquires the SAME owner
   fence as native input, atomically in the existing broker. A second native or
   browser owner is refused. Cancel/EOF/tool-silence cleanup is inherited.
4. `ios_web_inspect`: snapshot returns bounded semantic DOM, content, rectangles,
   hit-test and viewport data. References expire after five seconds; select tag
   as well as label. State includes secure context, activation and registered
   domains. Events contain bounded console types, error codes and request timings;
   no console argument content, URLs, headers, request bodies, SDP or audio.
   Optional selector/text scope finds later semantic nodes before the 500-node
   output cap; the 8,000-element traversal cap still applies.
5. `ios_web_action`: click/fill/scroll require fresh refs. Delivery is synthetic
   DOM input; React form state must be read back. Explicit evaluate executes JS
   in this enrolled dev document. It is NOT a read-only or trusted-input tool.
   Accepted/unknown commands never replay. Inspect independently after mutations.
6. `ios_web_verify`: ready/DOM/route gates save structural receipts into the
   existing shared learning store. Supply sessionId to learning search/evidence
   to match the browser runtime rather than the native app. Expected content stays in private artifacts;
   shared evidence contains only booleans/counts. Lessons require review, never
   execute as instructions. `ios_web_end` confirms host release AND glow off.
   If page feedback is unavailable, cleanup is unconfirmed, not passed.

## Recovery decision card

| Observation | Next action | What it does not prove |
| --- | --- | --- |
| Host diagnosis fails | Read `ios_doctor.failedChecks`. Use `ios_stack_ensure` only for a missing supported dependency while idle; inspect an uncertain start before another attempt. | Phone lock, USB state or browser permission. |
| Host ready; app/page offline | Wait with `ios_wait_ready` for up to55 seconds per call, without a lease. Continue bounded waits while the task is pending. Check an available paired launch route before asking the user. | An offline bridge does not identify why the document is unavailable. |
| Cable/network state is uncertain | Run `ios_doctor {connectivity:true}` once. Inspect USB enumeration, cached peer state, one tailnet ping and bridge readiness separately. Negative enumeration leaves physical cable state unknown; cross-check CoreDevice/USBMux if recovery requires that lane. | An unenumerated phone may still have a cable connected. Peer Online is not a successful ping; ping is not a developer tunnel. Null means unknown. None establishes lock or cellular state. |
| After Wi-Fi-Off, tailnet answers but no page is ready | Reassess the paired launch route when phone work is available. Do not repeat a stale request to connect USB. | A returning tailnet ping does not prove Wi-Fi restoration, a foreground app or successful off-LAN control. |
| Visible authenticated tab reconnects | Reuse `ios_web_pages`, then acquire a fresh `ios_web_begin`; old snapshots/leases are invalid. | Reconnection does not replay an accepted/unknown action. |
| Grant expired before enrollment | Inspect pages first. If no usable enrolled tab exists, issue one new grant and open its private launchFile once. | Expired grant does not require resetting the browser or all site data. |
| End lacks phone feedback | Preserve the unconfirmed cleanup receipt. Wait for fresh feedback; acquire only after the prior owner/cleanup fence allows it. Use `ios_web_pages` for fresh indicator state, or `ios_verify gate=idle` for native/host cleanup. | Host release alone does not establish that the phone acknowledged cleanup. |
| Exact microphone/Open dialog blocks | Use an available scoped `ios_system_begin` fallback, a fresh native hierarchy and exact observed target; verify the page afterward. | Page DOM/evaluate cannot press a system permission, and paired XCTest is not an off-LAN system-control lane. |
| Another owner is active | Wait; do not refresh its MCP process, start another runner or take its lease. Read-only host diagnosis remains available. | A stale tool catalog is not a reason to interrupt working control. |

Only ask for the specific human action supported by current evidence: an actual
Apple authentication gate, physical unlock or cable change when that transport
is genuinely required. Do not infer any of those from an offline bridge or
CoreDevice timeout. Nearby developer transport and arbitrary-network page
control are separate lanes. Real laptop sleep, physical VPN outage and off-site
foreground launch still require their own acceptance tests.

## Lifecycle and visibility

The pointer-transparent perimeter glow changes no layout. A page-side 15-second
watchdog clears it on transport loss; hiding/pagehide clears it immediately.
The server retires disconnected page ownership after 30 seconds. Tool silence
ends ownership after 20 minutes; heartbeats do not prolong tool silence.
Full document reload changes its boot and retires old ownership/commands. Tab
credentials live in sessionStorage; host stores only a token hash with a 24-hour
expiry in a private file. An authenticated tab can recover across broker restart
or transport interruption without reenrollment; a fresh control session is needed.
SDK source upgrades require a page reload; ordinary Next Fast Refresh remains
live, subject to separately verified route/form preservation.

## Domain instrumentation

`window.__iosWebAgent.register('name', readFunction)` returns an unregister
function. Read functions should return bounded synthetic/domain diagnostics,
never credentials, transcripts or models. The built-in media reader reports
track kind/enabled/muted/readyState (including existing DOM media streams), WebSocket counts/bytes and selected audio
WebRTC counters. It covers objects created AFTER adapter boot only. Instrument
before call setup; it does not capture audio, create a microphone or stop an
existing product track. Fetch/XHR and console wrappers add metadata only.

## Proven and still open

Dated receipts prove desktop Chromium/WebKit and real iPhone Safari/Chrome DOM,
React form input/readback, click, scroll, events, stale refs and glow cleanup.
Those qualification-page receipts alone do not prove a coach/client business call,
actual microphone acquisition, independent screenshots or off-LAN use. Follow-up
product and microphone results below have their own narrower receipts.
Snapshots include open shadow roots and closed roots created after adapter boot.
Closed roots created earlier, browser-native shadow internals and frames remain
opaque. Desktop Chromium/WebKit fixtures verified both shadow modes, click
effects and inherited inert refusal. Bounded traversal stops at 8,000 scanned
elements, 64 roots or 500 semantic nodes. It is not an unbounded full DOM dump. It does not operate
browser chrome, OS prompts, IME/keyboard hardware, trusted touch or other apps.
WebKit Inspector can supply deeper CSS/timeline/heap information for Safari and
Chrome; its local paired transport is a separate constraint. Inspect's CDP
translation documents synthetic input too; it cannot be treated as trusted input.
XCTest/WDA remains a bounded alternative for genuine native input/system UI;
Apple authorization and its stock indicator are not hidden or bypassed.

## Delivery boundary

Next only exposes the API and qualification page in development runtime,
explicit KICKOFF_LOCAL_DEMO=1, non-hosted APP_ENV, and non-Vercel. POST origin
must match the fixed loopback/private-tailnet Host. SDK enrollment is stripped
from the address before analytics. Production requests are 404. No arbitrary
upstream URL, customer database, global browser injection or credential API.

## Sources

- https://webkit.org/web-inspector/enabling-web-inspector/
- https://developer.chrome.com/blog/debugging-chrome-on-ios
- https://docs.inspect.dev/developers/mcp
- https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Runtime.json

## Additional qualification and limits — 9 October

Physical Chrome refused covered/offscreen clicks and read-only fills, and
refused another browser launch while owned. Desktop WebKit fault injection
verified the 15-second glow watchdog on network loss; stop preserved wrappers
installed later by another library and removed its own DOM. This is not physical
cellular outage proof. Screen Wake Lock is exposed and requested only during
ownership, but the physical browser refused it in this run. Denials are backed
off 30 seconds; API presence is not a promise to keep the phone awake.

An isolated Inspect CLI 3.3.2 provider was installed under the private service
state for deep-inspector evaluation, with telemetry disabled and separate
9321/9322 loopback ports. Pairing/USB/WebInspector service checks passed; zero
inspectable targets were exposed. Safari/Chrome inspector opt-in remains an
unqualified prerequisite. No paid plan, global injection or extra Tailscale
listener was created. Its isolated daemon was stopped after discovery; the installed dependency remains
for the next opt-in test. The provider is an auxiliary local developer channel, not
the arbitrary-network operating transport.

The `next-router` reader supplies hydration/readiness and route/path only; queries,
cookies, auth values and cached application models are excluded.

## Product and recovery gates — 9 October, follow-up

The actual authenticated Safari client lobby passed normal local cookie/GraphQL
readback, Background-menu input/restoration and cleanup. The fixed `meet` reader
reports only bounded call state, track presence/liveness, permission enums and
safe error categories. Button-enabled does not mean a track was acquired.
No call was joined in that lobby test.

An enrolled document starts its adapter in `_document` before React hydration.
SDK `connected` requires a successful ready poll, not just stored credentials.
Actual product direct load/reload passed desktop WebKit. Physical Safari full
product reload returned with a distinct boot, usable domain state, fresh
ownership and glow off. Its old-document reload acknowledgment was uncertain;
the command was not replayed. Always observe the replacement document before
acquiring another session.

Live stack recovery started only a missing port-3000 web worker while preserving
another agent's port-3020 stack and existing GraphQL. Process admission checks
explicit/inherited ports, and only the exact loopback Docker forwarder with a
free verified target is permitted. Hardware USB enumeration, developer discovery,
page readiness and worker/socket health are independent facts. HTTP SDK serving
has an actual transport regression test in addition to control-socket tests.

Mac bind-mount writes did not consistently notify the container's Next watcher;
one in-place write also yielded truncated container bytes. Atomic replacement
restored exact source parity. A physical Safari atomic Mac edit and restoration
then rendered automatically, preserving route/form state without an in-container
touch. Prefer atomic writes on this mount. Doctor checks source parity separately
from SDK HTTP delivery; matching files do not prove compilation or phone render.
Arbitrary in-place writes and off-LAN browser updates remain unqualified. No shared
server was restarted for this source-update test.

Physical Safari acquired one real audio track after a human OS Allow tap; the
probe immediately stopped its tracks. No audio was recorded or uploaded. This
qualifies acquisition and request counters, not call packet flow or automatic
permission handling. See mobile-web-ios-safari-microphone-2026-10-09.json.

Mirroring's supported Actual Size menu restored usable coordinate navigation in
the current session; typing the enrollment into the visibly selected Safari
address field established a real ios-safari page. Keyboard shortcut/paste success
alone had not established phone navigation. Recheck the actual browser and route.
This nearby provisioning route does not establish arbitrary-network launching
or real microphone capture while mirrored.


## Browser performance state — 9 October

`ios_web_inspect kind=state` includes a content-free `performance` domain:
navigation/paint timings, at most the last 1,000 resource entries aggregated as
counts/duration/transfer sizes, browser-reported long tasks, optional JS heap
bytes, and viewport geometry. No resource URLs/names or long-task attribution
nodes are returned. Unsupported long-task and heap metrics are null. An event
that has not completed has a null timing. Transfer sizes can be zero for cached
or timing-restricted resources; resource durations overlap and are not elapsed
time or CPU utilization. Bridge requests are included. This is an auxiliary
signal, not an accurate process-memory or CPU profiler.

Owned Chromium and desktop WebKit passed numeric/privacy/cleanup checks.
Chromium detected a controlled 85ms scheduled task; WebKit explicitly reported
long-task support unavailable. An 85ms workload inside the SDK's async command
path did not advance Chromium's count; zero new entries cannot certify an idle
main thread. Physical browser qualification remains separate. The observer is
disconnected on adapter stop. See mobile-web-performance-2026-10-09.json.

The official `googlechromes:` URL scheme reached Safari's physical Open in
Chrome confirmation after one network command. This is a useful provisioning
candidate, but autonomous browser switching is not qualified: page-owned input
cannot press that OS/browser confirmation. Fresh target identity/readiness must
be checked after confirmation. Do not resend accepted or uncertain launches.


## Android substitute qualification and MCP v1.2.1 — 9 October

Taylor took the iPhone; no further iPhone/Mirroring actions were performed.
The authorized connected Pixel 6 provided new shared-browser evidence using
owned Chrome tabs. Private HTTPS navigation preceded enrollment. MCP input and
independent DOM readback, distinct Android identity, performance state,
stale-target refusal and glow-off passed. USB/CDP supplied provisioning and
independent observation; the page bridge carried commands over private HTTPS.
This does not qualify an iOS CDP lane or physical off-LAN operation.

Page-owned MCP clicks remained synthetic. Android CDP produced a trusted click
and active user activation. An owned generated audio source (no microphone,
speaker playback, recording, upload or external room) then sent audio to local
WebRTC peers with advancing receive counters. Fresh installed stdio MCP v1.2.1
also passed stable sent/received advancement, rejected closed media, and saved
and reread a runtime-scoped evidence-linked lesson. Lesson applicability is
conservative: document/adapter fingerprints change on a new runtime. General
claims still require corroboration; no Android result was promoted as iOS proof.

`ios_web_verify gate=web-media` samples stable document-local stream ordinals
and RTP packet counters twice. Select sent, received or both; sampleMs 500–3000.
Every requested direction needs at least one advancing stream and no reset or
replacement. Ownership/HTTPS/connected-peer/document checks must pass in both
readings. Ordinals contain no native report IDs or participant identity. Results
are instrumented audio packet evidence, not remote playout or room correctness.
Positive historical counters alone cannot pass. Full private readings are used
even if a large MCP state response omits domains in its compact preview.

A controlled network fault scoped to one owned Android page cleared its glow
in about 15 seconds, revoked broker ownership, and recovered the same tab
without reenrollment. This is a page transport-loss test, not physical VPN,
Wi-Fi, cellular or laptop-sleep acceptance. All owned tabs/media were closed.
See mobile-web-android-shared-driver-2026-10-09.json,
mobile-web-android-outage-2026-10-09.json and
mobile-web-android-mcp-media-2026-10-09.json.

## Provisioning edge and recovery

Mirroring clicked the physical Open in Chrome prompt after Mac approval, so
Chrome launch itself was observed. Fresh enrollment subsequently failed:
native address typing dropped the leading character and searched the
short-lived dev link. Both affected grants are unusable; duplicate enrollment
was refused. Token/URL/search text is omitted from the sanitized receipt. Do not
repeat unverified omnibox text entry for grants. Next qualify clipboard paste
with a plain, token-free URL before provisioning. The phone is now with Taylor;
no phone history cleanup or further operation was attempted.

A separate missing port-3000 Next worker was recovered once through guarded
stack-ensure. Port-3020 and GraphQL were preserved, plain local/private HTTPS
routes returned the correct page, and all 11 doctor checks passed. The cause
of the worker disappearance is unknown. The developer channel remaining
unavailable does not establish a disconnected or locked physical device.
See mobile-web-resume-2026-10-09.json.


## Physical Chrome and browser recovery — 10 October

Fresh MCP v1.3.0 retains 22 tools and five resources. `ios_web_inspect
kind=element` accepts a fresh snapshot/target and returns fixed computed CSS,
bounded ancestors, visual viewport/scroll and actual center-hit occlusion.
Physical untethered Chrome passed computed font-size, temporary-cover detection,
stale-reference refusal and cover/glow cleanup. Browser/native occlusion,
stylesheet origins and process memory are outside this document reader.
Physical Chrome performance readings passed; heap and long-task support are
explicitly unavailable/null on this runtime.

`ios_web_enroll rememberBrowser=true` explicitly remembers the dev origin for
24 hours from initial consent. A new tab can open a plain local URL and obtain
its own page/token/boot without another enrollment fragment. Browser and page
credentials have separate types; neither can impersonate the other. Resumed
pages inherit the original expiry. Host persistence contains hashes only.
`stop()` clears the browser's new-tab opt-in; already enrolled other tabs retain
their own original expiry. Default enrollment is still per-tab only. This is
not a remotely launchable browser or an indefinite authorization.

Three focused protocol checks passed wrong-origin/token/type, original expiry,
page capacity, hash-only restart and preservation of another owner. Fresh stdio
MCP plus desktop WebKit passed plain-route new-tab bootstrap, distinct identity,
source/boot discovery and opt-out. Physical Chrome then passed remembered
provisioning, a plain-URL new-tab resume, control and glow-off with USB unplugged.
The paired wireless developer channel opened the tabs; private HTTPS carries
routine control. Physical off-LAN browser operation is still unqualified.

Discovery now includes acknowledged boot and SDK version. After a reload, wait
for a different boot and fresh ready/visible feedback; a cached ready record or
fixed short delay is insufficient. A physical Chrome reload was issued once,
its acknowledgment was unknown, and it was not replayed. The first reacquire
was premature; later independent observation confirmed a new live boot.

Media state includes `hooks.microphoneAPIAtBoot`, `hooks.microphone`, `hooks.peer`
and `hooks.socket`. Zero counters with a missing hook are incomplete coverage,
not proof that nothing happened. The SDK attaches when the microphone API
becomes available, reports a later replacement, and preserves that replacement
on stop. A controlled late-API fixture passed accounting and teardown. A fresh
physical Chrome document showed all three hooks attached. Its actual React
microphone button then failed with `NotAllowedError`; failed-request accounting,
no live tracks and glow-off were independently read back. No prompt automation,
actual Chrome acquisition, audio packet flow or real call is claimed. Prior
Safari acquisition remains separate dated evidence.

## Scoped host recovery diagnostics — 10 October

The exact existing Docker socat forwarders for ports 3000 and 4000 are admitted
only after verifying image, command, destination, existing binding and a free
inner target. The helper preserves those bindings. Actual cold recovery started
missing GraphQL and Next and passed all eleven doctor checks. It did not reset
data or stop workers. A subsequent missing Next worker was started alone.

The Next child launcher now saves a private 64 KiB tail and fixed exit receipt
inside the container. No raw logs are exported and no restart loop is added.
It reports exit code/signal, fixed error categories and observed cgroup OOM-kill
advancement. Existing trace files are opened without following symlinks. The
prior unexplained exit has no established cause; later instrumented runtime
remained running during this batch. `doctor` still distinguishes host readiness
from browser readiness.

## Paired developer observer — 10 October

A fresh MCP connection now exposes `ios_device_inspect`. The optional pinned
pymobiledevice3 11.15.5 provider captured the actual full iPhone display over
paired Wi-Fi without USB, root, XCTest or Mirroring. MCP image readback and
temporary-owner release passed. This revealed Safari's actual Settings switches
and avoids asking the user to describe screens that this observer can see.
The device does not advertise the tested CoreDevice screen/HID services; DVT
screenshot is the working route. Native touch remains unqualified.

Enabling Safari Web Inspector changed its explicit refusal into successful
service connection and target discovery. Safari then enrolled wirelessly with
a fresh document identity and passed the authenticated synthetic client lobby,
normal Background-menu open/close, route restoration and glow-off. The fixed deep Runtime read separately passed through fresh MCP with the existing page owner and glow-off. Service discovery alone is insufficient; empty targets and old/suspended tabs remain explicit diagnostic outcomes.
Remote Automation availability does not establish trusted input or OS prompt
control. No other iOS browser is assumed to inherit Safari's feature flags.

## Process resource profiling — 10 October

`ios_device_inspect {kind:"resource-profile"}` now records three physical-device
DVT samples through the existing paired developer observer. A fresh stdio client
returned Safari, Kickoff DEV and WebContent memory/CPU readings in 9.748 seconds,
then closed the profiler and released its temporary owner. It needs neither
XCTest nor Mirroring. This nearby paired transport is independent of the remote
page bridge; it is not qualified over arbitrary networks.

Read selected samples with `ios_read` and the returned artifact ID. Memory is
physical footprint in bytes. CPU is the provider's raw `cpuUsage` value, not a
calibrated percentage. Missing readings remain null. WebContent can serve other
tabs, so these are process metrics, not attributed page CPU or JavaScript heap.
Only Safari, Chrome, Kickoff DEV and WebContent process names are retained.
The configured 500 ms sampling interval is a request; use each sample's actual
`elapsedMs` when interpreting the result. Continuous profiling is not enabled.

## Persistent Safari permission and native input fallback

For the enrolled DEV host, Safari Website Settings → Microphone is now **Allow**.
The setting was applied and read back using signed WebDriverAgent over Tailscale,
with Mirroring closed. Camera and Location remain Ask. A new `getUserMedia`
request then completed without a prompt through the normal page MCP. Capture
cloned a real microphone source disabled for silence: five AAC chunks decoded at
48 kHz mono, 4.865 seconds; stop preserved the source before explicit fixture
cleanup. No audible/full-call or Chrome microphone claim follows from that gate.

Use the explicit `ios_system_*` fallback for a genuine native browser control or
permission dialog when needed, then return to the normal DOM/page driver. Do not
use Mirroring as a runtime dependency. A successful nearby wireless start does
not prove off-site startup or eliminate Apple's possible authorization prompts.
The direct Tailscale lockdown-port handshake reset; an open port was not treated
as a working developer-service connection. See MCP.md for ownership and cleanup.

## Optional browser diagnostics — 10 October

`ios_web_inspect kind=state` includes
`domains.performance.eventTiming`, `largestContentfulPaint` and `audioSession`.
Event Timing and LCP observers start on an owned state read and disconnect when
ownership/visibility ends. A second read obtains asynchronously emitted values.
Support, active observation, zero entries and unavailable/null remain distinct.
Only numeric aggregates are retained: no DOM attribution, resource URLs or event
labels. Buffered entries can precede the current ownership window. Event durations
are not INP, and the latest LCP candidate is not a final page-lifecycle LCP.
AudioSession reads type/state without changing routing or requesting a microphone.
A browser can expose the object while omitting state; that value remains null.

Standards: https://www.w3.org/TR/audio-session/ ,
https://www.w3.org/TR/event-timing/ ,
https://www.w3.org/TR/largest-contentful-paint/ .

## Untethered cellular qualification — 10 October, final batch

Physical Safari passed with USB unplugged, Wi-Fi Off and cellular 5G:
DOM fill/save, an atomic Mac source edit and exact restoration with route/draft
preserved, replacement-document navigation readback, same-origin local GraphQL
HTTP 200 and glow-off. The paired developer channel was unavailable; no
Inspector, Mirroring or XCTest carried this batch. Chrome cellular is a separate
pending gate. This supersedes earlier Safari off-LAN “unqualified” statements;
it does not qualify off-site launch, trusted input, Inspector or audible calls.
See browser-cellular-safari-2026-10-10.json.

## Bounded page conditions — MCP 1.9.2

Use `ios_web_verify` with `timeoutSeconds: 0..30` for a named condition instead
of repeatedly asking the model to read/sleep. Default zero remains one reading.
The MCP observes at most 61 times with 500 ms gaps, stopping on observation
failure or lost ownership. The wait budget excludes an already in-flight bounded
transport read. It never retries an input, changes tabs or reacquires a lease.

- Wait for a semantic control: `{sessionId, gate:"web-element", selector:"#draft",
  elementState:"editable", expectedValue:"", timeoutSeconds:10}`. Exactly one
  visible semantic node must match; editable additionally requires browser DOM
  hit testing, enabled and not read-only. `visible` alone can include offscreen
  nodes; use `interactable` for in-viewport hit eligibility. These are DOM checks,
  not browser/OS occlusion or trusted touch.
- Wait for rendered text: `{sessionId, gate:"web-element", selector:"h1",
  expectedText:"Your heading", timeoutSeconds:10}`. Text uses case-sensitive
  substring matching; expectedValue is exact and supports an empty string.
- Wait for a same-document pathname using `web-route` and `expectedPath`.
  A full navigation retires ownership: use lease-free `ios_wait_ready`, then
  acquire the new document; never replay the navigation.

A passing element gate returns its final fresh snapshot/target. Use immediately;
normal five-second freshness and hit checks still apply at input. Timeout/failure
returns the last private observation artifact and structural receipt, not raw
content. `web-media` stays one explicit advancement sample, without repeat-until-
passing behavior. Physical Safari on cellular passed a deliberately delayed DOM
condition in two reads/1.397 seconds, fixture restoration and glow cleanup.

## Chrome cellular acceptance — same final batch

Chrome independently passed USB-unplugged/Wi-Fi-Off DOM fill/save, atomic Mac
source edit and exact restoration with draft/route preserved, navigation readback,
local same-origin GraphQL HTTP200 and glow-off. The new bounded element wait was
used for render completion. Safari-to-Chrome switching required its browser-owned
Open confirmation; page control did not press that dialog. Both browsers now have
physical cellular operating proof. Nearby Inspector and off-site browser launch
remain separate. See browser-cellular-chrome-2026-10-10.json.

Safari non-silent capture also decoded a generated 523.25Hz source at 523Hz,
RMS0.07073, 3.305seconds. A brief already-authorized microphone acquisition enabled
Web Audio; that mic was disabled immediately and stopped before recording.
Capture stopped its clones while preserving the generated source, then fixture
cleanup closed it. This is a dev experiment, not a new behavior of ios_capture:
the service still captures only existing tracks and never starts a microphone.
An actual call should reuse its existing capture owner. The no-capture baseline
remained suspended. See browser-cellular-audio-tone-2026-10-10.json.

### Cellular WebRTC probe boundary

Two document-local Safari probes generated two host candidates per peer and no candidate-add errors, but remained ICE checking with no confirmed RTP flow. Retaining authorized capture during negotiation did not resolve it. Both fixtures and capture tracks were cleaned up. This does not diagnose the actual Twilio/TURN call path; use the real call for the next media gate rather than repeating host-only loopback. See `browser-cellular-rtc-boundary-2026-10-10.json`.

### Call readiness and cleanup (MCP 1.9.3)

After opening the DEV call page, use `ios_web_verify` with `gate=web-call`,
`callPhase=lobby`, and an optional bounded `timeoutSeconds`. SDK reachability is
not call readiness. `media_requests_pending` with permission `prompt` means the
native permission flow needs investigation; DOM clicks cannot press OS Allow.
Use the explicit bounded system fallback only when the paired developer channel
is available, then stop it before resuming page control. Never infer a disconnected
USB cable or a locked phone from developer-channel failure alone.

Once Join has been sent once, `callPhase=paired` checks joined state and a remote
participant. Use a separate explicit `web-media` sample for RTP progression.
After Leave, `callPhase=released` checks observed tracks/peers have stopped.
Neither waiting nor verification automatically acquires media or retries Join.

A Wi-Fi Off cellular test must include restoration before requesting a tether
for a later nearby operation. Check current transport first. The existing fixed
Runner Wi-Fi On shortcut is a paired recovery path; independently verify Settings
or current association afterward. Launch acceptance is not proof of execution.
A browser-only cellular page does not currently provide a native permission tap
or a qualified remote Wi-Fi-settings lane.


## Named call-rig profile — 1.9.4

Use `ios_web_enroll profile=call-rig` with the synthetic room path when a real
provider-backed coach/client smoke needs the dedicated local stack. The default
`app` profile is unchanged. Enrollment does not start servers, configure provider
credentials, create a room, disable recording, or install a Serve route. Check
those prerequisites independently; a loaded lobby is not a connected call.

The private host route is `tailscale serve --bg --https=10520
http://127.0.0.1:3020` (one command). Preserve existing routes. Next's fixed
same-origin proxy sends 10520/3020 requests to local GraphQL4020 and
10446/3000 requests to4000. The agent SDK still reaches the same owner broker.
Tokens and remembered-browser enrollment remain bound to their exact origin;
no caller-supplied upstream is accepted. Next requires its existing DEV/demo
and non-hosted gates for either profile.

For independent nearby source/CSS/timeline inspection, pass the same
`profile=call-rig` to `ios_browser_debug`. Omitting it selects the regular app
origin. The profile does not make Inspector available off LAN. Routine page
DOM/state/input uses Tailscale; new system prompts still require the bounded
native fallback and its separately verified developer startup path.


Physical Chrome qualification: the dedicated coach/client call paired and the
provider reported two participants, recording disabled and zero recordings.
The first agent-native Allow batch needed no new human action. Later physical
Chrome prompts appeared despite earlier granted page metadata. A subsequent
XCTest start required a physical passcode; the agent then handled both Allow
requests. Do not infer persistent browser grants or a passcode exemption. With the cached synthetic coach sample,
bidirectional RTP advanced and received audio decoded non-silent. Capture stopped,
all buffered chunks drained, and the native fallback stopped.

A stale compiled frontend initially kept the old GraphQL address despite current
source; check the actual loaded bundle before retrying Join. Hang Up intentionally
returns to the lobby and is not a full-media cleanup proof. This pass also found
tracks surviving client-side departure from the lobby. The product lifecycle repair now owns only tracks created by this call page.
A physical same-document `/meet` → `/dev/ios-agent` transition stopped both live
tracks without reload; 45 focused lifecycle/microphone tests passed. Hang Up
retains lobby preview intentionally: leave the meet route for full release, then
check ended tracks, zero pending media/peers and glow off. Do not weaken the
released gate. See call-media-lifetime-2026-10-10.json.

Receipt: browser-call-rig-profile-2026-10-10.json. Nearby call proof does not
replace the separate cellular page proof or establish an off-LAN full call.

### Three-transport lab

`ios_audio_probe` and `ios-agent://audio-probe` now expose the bounded synthetic
call-rig experiment. Its owned domain projection gives agents strategy, named
fault, source liveness and terminal counts without tokens or raw errors.
Nearby physical Safari delivered PCM/WSS, Opus/WSS and Opus/WebRTC; scoped
slow-reader, dropped-decode, unavailable-codec and disconnect edges are retained
separately. The experiment never changes the primary call transport. Native
WebRTC host ICE has no off-LAN qualification. Use the versioned resource for
fixture/provider preflight, managed receiver startup and cleanup.

## Safari received-track capture primitive — 11 October

The shipped `rich-capture.js` factory and `CaptureStore` were exercised with a
physical Safari received WebRTC track carrying a synthetic440Hz source.152new
RTP packets advanced during recording;3chunks/77,566bytes independently decoded
on the host into144,320non-silent48kHzframes (RMS0.10484). Recorder stop preserved
the original track. Fixture cleanup then stopped tracks, closed both peers and
AudioContext, removed the temporary files/receiver and returned Home. The original
XCTest authorization was preserved throughout.

This qualifies the received-track recorder primitive, not a full Safari provider
call or MCP page-ownership/source-discovery path. No microphone was acquired, no
speaker playback was used, and local host ICE is not off-LAN proof. The existing
MCP capture operation already uses this factory; no runtime behavior changed.
See safari-received-capture-physical-2026-10-11.json.

### A native dialog can hide from the normal tree
If Inspector reports a visible DEV page but XCTest reports empty SpringBoard,
inspect the bounded `alert` field from ios_system_inspect. Use alert-button with
the fresh snapshot and exact observed button for authorized routine dialogs.
Then independently inspect the page and actual media tracks. A disappeared dialog
is not itself a microphone grant. Authentication prompts are observation-only;
never infer cable/lock state or request USB just from this UI disagreement.

## Chrome received-track capture primitive — 11 October

The same shipped factory and CaptureStore now also passed on physical Chrome iOS.
152 received RTP packets advanced during capture; three AAC chunks (78,425 bytes)
independently decoded on the host into145,344 non-silent48kHz frames (RMS0.10464).
Recorder stop preserved the received source. Both peers, fixture tracks and audio
context then closed. Temporary fixture files and receiver were removed; separate
native readback confirmed unlocked Home. The original XCTest runner was preserved.

Together with the Safari result, this closes browser parity for this received-track
recorder primitive. It does not qualify MCP-owned track discovery, a provider call,
trusted input without XCTest, audible playout or off-LAN ICE. No runtime behavior
changed. See chrome-received-capture-physical-2026-10-11.json.

## 1.9.36 — capture messages from an already-open socket

Explicit network capture now discovers up to32 live sockets created after the
page adapter booted, including connections opened before capture started. It
adds receive listeners only during capture, removes them on stop/expiry/release,
and leaves application connections open. New socket capture continues normally.
Text is scrubbed using the same known-secret rules; binary payloads remain a
binary marker. status.coverage.sockets reports discovery availability/failure,
existing/new watch counts and active capture listeners.

Nine host contracts pass, including a real Node WebSocket and the exact page SDK
wiring. Physical Safari/Chrome acceptance of this increment remains open. Existing
page documents need reload; no routine page was reloaded while preserving the
original owner. Sockets created before adapter boot or through saved constructor
references are not universally discoverable. Native has no existing-socket registry.
See existing-websocket-capture-2026-10-11.json.


## Fresh owned MCP capture —11 October,1.9.36

A fresh real MCP connection qualified both physical iOS browsers: enrolled page
readiness, normal React form fill/save/readback, existing-WebSocket receive
capture, synthetic received-track discovery/recording, original-track/socket
preservation and explicit glow-off cleanup. Inspector overview also passed under
the owned Chrome session through the explicit tailnet userspace developer lane.
The new audio fixtures decoded valid but silent output because their AudioContexts
were suspended; they do not qualify audible/provider-call audio. See
`owned-acceptance-2026-10-11.json`.

The follow-up Wi-Fi-off transition lost phone Tailscale reachability and both
bridges. Cellular foreground launch/Inspector remain unqualified. Do not repeat
network switching until the cause and a recovery path are established. Nearby
launch or a valid VPN enrollment is insufficient evidence for cellular readiness.

## Audio source attribution —1.9.38

Updated browser capture reports `coverage.audioSources` at start/status and in
the private drain/stop manifest. Each source has a stable `trackRef`, allowlisted
`origins` (`get-user-media`, `rtc-sender`, `rtc-receiver`, `dom-media`) and a
recorder-start outcome. Origins can overlap; an empty list means unknown. No
track ID, device label, SDP, address or credential is included. Match chunk
trackRef to a source containing rtc-receiver when checking far-end capture.

References remain stable when an earlier recorder fails. Source attempts are
bounded to32across the entire capture; `audioSourceLimitReached` exposes omitted
new sources. Capture still clones existing tracks and preserves originals.
These labels prove observed API-object origin, not non-silent or audible audio.
Eleven focused host checks, including exact page-SDK wiring, passed. Actual
provider-call attribution on iPhone remains the next physical gate. Existing
phone pages need a reload to use the new SDK; native installed builds are not
claimed to expose browser-only provenance.

## Cellular Safari handoff —1.9.45, 11 October

Signed delivery33da0bab6a8f429380f4f35aec4701cd installed wirelessly and its running
identity matched. With USB absent, Wi-Fi IPv4 absent and external developer
TCP49152 refused, `ios_web_enroll browser=ios-safari transport=auto` used the
DEV app's fixed private-URL handoff. A fresh visible Safari page then passed
owned readiness, unique-target DOM fill, independent field readback, guarded
Save, committed React result and indicator-off cleanup. No XCTest, Mirroring
or human action was used. See safari-cellular-handoff-mcp-2026-10-11.json.

Chrome accepted its app-owned URL handoff but no fresh page appeared. A single
Focus recovery pulse restored the prior Mac Focus without producing a fresh
native bridge. Neither input was replayed. The phone remained unlocked according
to Taylor; its screen has not yet been inspected, so a modal or lock is not the
diagnosed cause. USB recovery is requested to inspect the actual state and
restore Wi-Fi. Chrome launch and deeper cellular Inspector remain open gates.

The earlier dated nearby proofs above retain their original scope. This new
Safari result supersedes the old generic claim that all cellular foreground
launch remains unqualified; it does not qualify OS permission input or Inspector.
