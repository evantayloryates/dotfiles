# iOS agent MCP — shared service interface and operational learning

Current interface: **36 tools / ten resources**. `ios_guide.interface` identifies
the process answering this connection. `/Users/taylor/dotfiles/bin/ios-agent-mcp
--catalog` reads the installed catalog without host/phone access. A missing
`interface` means the connected process predates this check; absent new tools
do not prove the installed service lacks them. Refresh the harness connection at
an idle point, preserving any active owner. Source publication alone cannot
refresh an existing harness. DELIVERY.md has the short native/browser/system
workflow table; this document retains the detailed historical changes below.

Protocol references: [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports),
[tool contract](https://modelcontextprotocol.io/specification/2025-06-18/server/tools),
[Codex registration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

Launch `/Users/taylor/dotfiles/bin/ios-agent-mcp` as a local stdio MCP server.
Install pinned dependencies once with `npm ci --ignore-scripts` in
`/Users/taylor/dotfiles/src/ios-agent/mcp`. No model API, embedding service,
credentials or new network listener is needed by the MCP wrapper.

## Start in one call

1. `ios_guide` gives the operating contract and applicable shared lessons.
2. `ios_begin {}` acquires control and checks actual app readiness. It returns a
   session ID; output directories, CLI lease files and evidence paths are managed.
   Codex: pass your actual `threadId` on begin for exact rollout discovery.
   Inherited `CODEX_THREAD_ID` is used when present, but standard SDK stdio
   environment filtering can omit it. Verify `lifecycle.threadId`; an explicit
   **actual active rollout path** overrides discovery and retains automatic turn
   completion/interruption detection. Other clients use connection ownership.
3. `ios_native` or `ios_react` returns bounded inspection and private artifact IDs.
   Native tree targets are used exactly as observed. `ios_read` selects larger
   artifacts with JSON pointers or returns protocol-native PNG image content.
   Tree responses show a compact set of visible labeled nodes; the complete
   hierarchy remains available in the private artifact.
4. `ios_verify` confirms readiness, committed route, bundle source, backend,
   native/React tree or cleanup. For network, run diagnostics-probe immediately
   before verify. A delivery acknowledgment alone does not prove a product commit.
5. **Finally, `ios_end` before ending every work turn.** It releases and verifies
   native/host idle automatically. An unconfirmed cleanup is a failed receipt,
   never silently passed; standalone `ios_verify idle` remains available.

Resource URIs expose this guide, DELIVERY.md and CAPABILITY-EDGES.md.
Version 1.1 adds `ios_doctor`, `ios_stack_ensure`, `ios_workflow` and the
`ios-agent://paired-workflow` resource: 15 tools and four resources in total.
Diagnose host prerequisites before requesting phone setup. Stack recovery is
explicit and idle-only; a failed/unknown startup is never permission to replay.
The versioned paired recipe exposes read-only exact local synthetic-pair baseline,
persistence and restoration checks. They do not mint credentials or mutate data,
and do not replace independent browser/phone UI evidence. See PAIRED-WORKFLOW.md.
Native tools wrap fixed CLI operations and do not invoke product handlers or
control system UI. Version 1.2 adds seven browser tools (22 tools, five resources):
`ios_web_pages/enroll/begin/inspect/action/verify/end`, with the
`ios-agent://mobile-web` resource. Browser `evaluate` deliberately executes JS
in the explicitly enrolled development page; it does not bypass browser or OS
authentication. Use the browser begin/end pair in finally. See MOBILE-WEB.md.
Version 1.2.1 keeps the same catalog and adds typed browser action arguments
plus `ios_web_verify gate=web-media`: choose direction sent, received or both;
sampleMs is bounded to 500–3000. Stable document-local audio RTP counters must
advance, with a connected peer and foreground ownership at both samples.
Closed/stalled/replaced streams or a changed document fail. Receipts preserve
only structural booleans; full readings stay private. This certifies observed
packet counters, not an actual call, audible sound or microphone permission.
The owned physical Android stdio smoke passed both-direction advancement,
closed-media refusal, scoped lesson persistence/readback and glow cleanup.
Existing Tailscale phone transport and native watchdog remain unchanged.

## Ownership and cancellation

One active session per MCP connection, one physical-phone owner across all clients.
Calls on a connection serialize: collisions reject before dispatch rather than
queueing a mutation for later. The CLI retains its existing single-flight,
accepted-command identity and no-replay rules.

Connection owners use private structural metadata, never fake Codex transcripts.
MCP EOF, TERM/INT and cancelled tool calls mark owners inactive and request scoped
release. The broker independently rejects dead/stale owners. Heartbeats prove
process liveness but **only actual session tool use renews the 20-minute silence
limit**. A host outage retains the existing native 30-second watchdog.

A persistent MCP connection does not expose model turn-end universally. Clients
must call end; the silence limit is a fallback, not equivalent turn-end detection.
Codex's real rollout and a companion connection guard offer stronger cleanup:
either turn completion or connection loss retires control. Pending acquisition
is allowed to resolve once before release so EOF cannot orphan its capability.
The wrapper does not claim every
harness's native lifecycle hook has been installed or tested.

## One shared learning path

The local SQLite database lives outside Git at
`~/Library/Application Support/ios-agent/learning/learning.sqlite3`, mode 0600
inside a 0700 directory. Separate MCP subprocesses share it with WAL/transactions.

- Every fixed verification automatically captures structural gate evidence:
  booleans, counts and a conservative runtime fingerprint. Raw models, console,
  network bodies, images, transcripts and credentials are never auto-ingested.
  `ios_learning_evidence` lets another harness reuse these receipts for review.
- `ios_learning_propose` links a short reusable lesson to a service evidence ID.
  Stable keys group alternatives; duplicates are idempotent. Proposals are not
  default guidance. Store operational behavior, never client/app values.
- `ios_learning_review` records an agent's assessment and appends review history.
  Runtime support requires a successful matching receipt. General support needs
  **two successful receipts from distinct runtimes**. Evidence establishes test
  facts; the reviewing agent still must assess whether those facts support its
  prose. There is no claim of automatic truth verification.
- `ios_learning_search` defaults to supported applicable lessons; proposals,
  retired claims and mismatches require includeProposed. Competing lessons remain
  visible rather than a last-writer override. General advice survives runtime
  changes; runtime-specific claims conservatively expire on native reboot, host
  source or MCP/CLI adapter changes. General advice still yields to current guide
  and live evidence. The fingerprint is deliberately conservative because the
  display build number is not a unique binary identity.
- Capture counterexamples by retiring claims with evidence. A failed receipt can
  describe an edge but cannot promote a supported lesson. New versions are an
  opportunity to requalify naturally, not to run repetitive tests just for memory.

Learning failure does not prevent control or cleanup. No cross-harness private
memory files are touched. Retrieval is bounded exact text/key search, not a model
classifier or semantic reranker. Free text has a narrow accidental-secret check;
it is not a comprehensive sensitive-data detector. Lessons are data, never
executable instructions, and cannot widen the service's tool capabilities.

The paired recipe now supplies explicit postconditions and cleanup. General
recipe execution, contradiction-driven requalification, knowledge export and
per-harness Stop hooks remain possible extensions, not implemented capabilities.

## Harness configuration

Generic local stdio entry:

```json
{"mcpServers":{"ios-agent":{"command":"/Users/taylor/dotfiles/bin/ios-agent-mcp","args":[]}}}
```

Codex uses `[mcp_servers.ios-agent]` with the same command and
`tool_timeout_sec = 150.0`. Claude Code uses user-scope `claude mcp add`.
`python3 src/ios-agent/register_mcp.py` performs idempotent scoped registration;
use `--dry-run` to inspect the targets. Existing different ios-agent entries fail
closed instead of being overwritten. Configuration readback is not proof that a
currently running chat has refreshed its tool catalog; start/reload that client
when it can pick up the new entry. The stdio transport is for clients on this Mac;
remote harness hosting and authenticated HTTP MCP are not part of this release.

## Validation

Python: `PYTHONPATH=src/ios-agent python3 -B -m unittest discover -s src/ios-agent/tests -q`.
MCP: `npm test` in `src/ios-agent/mcp`. SDK client tests cover discovery, resource
listing, lifecycle, bounded read/redaction, images, unknown outcomes, cancellation,
collision rejection and the actual launcher in a minimal GUI PATH. Physical MCP
acceptance and registration results are recorded separately in the release receipt.


### v1.3.0 mobile-browser additions

- `ios_web_inspect kind=element`: required fresh snapshot/target, fixed CSS,
  ancestors, hit testing, visual viewport and occlusion; no system screenshot.
- `ios_web_enroll rememberBrowser=true`: explicit origin-bound, 24-hour browser
  opt-in; new tabs get distinct identities without a fresh secret URL. Default
  is false. Source/boot discovery makes reload replacement observable.
- Media state exposes hook coverage; late API installation and later wrapper
  replacement are distinguished from empty counters.

Existing clients must reconnect to discover the added schema fields. The
service is installed locally; new SDK source takes effect on a fresh document.
Physical Chrome CSS, performance, fresh-document and new-tab recovery have dated
10 October receipts. Chrome microphone remains NotAllowedError in this run;
full-call, trusted input and physical off-LAN browser gates are open.

## Paired full-device observation — 10 October

Version 1.3 exposes 23 tools and five resources. `ios_device_inspect` is the
optional read-only paired-device lane: `kind=screen|capabilities|browser-debug`.
Without a session it reserves/releases a temporary shared owner; with sessionId
it uses that connection's existing native or browser owner. Competing owners
are refused. `ios_read` returns the actual full-display PNG as MCP image content,
including browser chrome and OS overlays. It does not deliver system input.

Install the isolated pinned provider using Python 3.11+ (macOS/Python 3.14 lock
qualified): `python3 /Users/taylor/dotfiles/src/ios-agent/install_observer.py`.
Use `--check` for a dependency-only validation with no device action. The service
uses the private environment's bin/python directly, not generated provider CLI
entrypoints. No root, XCTest, Mirroring, new port or Tailscale Serve edit is used.

Actual untethered paired Wi-Fi screenshot and fresh stdio MCP image read passed
on 10 October; independent MCP status confirmed the temporary owner released.
This Apple developer transport requires nearby paired reachability. It is NOT
qualified across arbitrary networks. The enrolled page lane remains the
Tailscale operating path. Do not infer lock or cable state from a failed tunnel.

`browser-debug` requests Web Inspector opt-in/discovery and fixed, content-free
SDK/bootstrap state for the configured private development origin only. It skips
unrelated origins, other attached inspectors and inactive browsers; it never
enables console history or requests a user gesture. An enabled service, empty
target list or deadline does not prove successful deep runtime inspection.
Fresh MCP also passed the foreground Safari fixed Runtime read on 10 October, reused its existing page owner and verified glow-off. This is an independent bootstrap diagnostic, not a full remote debugger API.


## Version 1.4 — explicit capture and availability

Version 1.4 introduced 27 tools / 5 resources. `ios_device_launch`,
`ios_wait_ready` and `ios_capture` are documented in the README. Agents must
wait without a lease for foreground availability, acquire only when ready, and
end in finally. Do not turn an offline bridge into a request to unplug/unlock.
Capture is explicit, synthetic development only, bounded, scrubbed and expiring.
It does not make all audio, browser-native input or off-site launch qualified.

### Lock without a human request

`ios_device_lock` runs only the installed **Runner Lock iPhone** shortcut and
checks `passcodeRequired` independently. It holds the shared owner during dispatch
and verification, sends no input when already locked, and never replays an
uncertain launch. This is paired developer transport, not off-LAN launch.
Create the one-action Lock Screen shortcut on the Mac with existing iCloud Sync;
this exact shortcut synced, locked the physical iPhone and enabled Mirroring on
10 October. It does not unlock the phone or alter authentication.

For a genuine human unblock, use `/Users/taylor/dotfiles/bin/speak` with the actual
short request (for example, "Unlock the iPhone."), then ask the same concise
question. Do not substitute `say`, speak placeholder text, or ask for locking
when the fixed shortcut route is reachable.

Locking may interrupt active iPhone Mirroring and its reconnect can require Mac
authentication. Use `ios_device_lock` at a deliberate transition; never use it as
a routine readiness poll. Ordinary status/wait operations send no locking input.

## End-of-work phone presentation

Taylor prefers the **Home Screen** after agents finish or pause phone work. No
need to restore the previous app. Stop capture, end the native/page lease, verify
glow/inspection cleanup, then navigate Home through a verified available system
input route. Do not leave Kickoff DEV open without ongoing work. Preserve other
agent ownership and do not navigate Home during intermediate session handoffs.

`ios_end`/`ios_web_end` currently release control; they do **not** navigate Home.
The paired lock shortcut is a separate action, not a Home substitute. Mirroring
Home works only while its system-control session is reachable. On 10 October the
Mac Shortcuts action search did not expose Go to Home Screen; the empty test
shortcut was removed. A phone-local Home shortcut remains unqualified. When Home
is unavailable, report `homeNavigationPending`; do not silently force-quit the
app or start XCTest just for cleanup. Version 1.5 adds verified Home return within
an already-required explicit system fallback; normal page/app end remains separate.

## Bounded device process profile

Use `ios_device_inspect {kind:"resource-profile"}` for three CPU/memory samples.
The existing pinned optional provider, shared owner, deadline and private artifact
handling apply. It also accepts a current native/browser `sessionId`; without one
it acquires and releases a temporary maintenance owner. The profiler always
closes on completion or error. Read detailed samples selectively with `ios_read`.
WebContent is process scoped, CPU is provider raw units, missing values are null,
and paired nearby success does not qualify off-LAN access.

## Version 1.5: explicit native system fallback

Four tools make the proven signed WebDriverAgent route reusable:
`ios_system_begin`, `ios_system_inspect`, `ios_system_action`, `ios_system_end`.
The catalog is 32 tools and seven resources. End the normal app/page session first.
Start only when genuine native input or browser/system UI is needed. The same
exclusive device owner prevents a second cooperating agent from taking control.

The local private `system-driver.json` names the existing signed `.xctestrun`
under Xcode DerivedData and the phone's IPv4 Tailscale address. Startup uses
Apple's existing paired developer transport; no usbmux discovery or Mirroring.
The WDA HTTP connection runs through Tailscale. This does not establish off-site
startup. An existing open WDA endpoint is preserved rather than reused or killed. An unconfirmed network preflight refuses startup; it is not treated as a disconnected cable.
No passcode is accepted, stored or entered; Apple may require human authorization.

Inspect the native tree, then tap its visible/enabled target or scroll one half
page with a fresh snapshot. Snapshot references expire after five seconds and
are consumed before dispatch. Unknown input is never replayed. Fixed activation
supports Safari, Chrome, Settings and Kickoff DEV. Input on a locked phone is
refused. Secure-entry values are omitted from tree artifacts. This is native
XCTest input and Apple retains its own Automation Running indicator.

Always `ios_system_end` in finally. It normally returns Home, deletes the WDA
session, stops the owned xcodebuild and independently checks the runner process.
`runnerStopped:false` means cleanup remains unconfirmed. A separate supervisor
also stops the runner on MCP EOF, dead owner, lost lease, stale heartbeat or
20-minute inactivity. It kills a remaining runner only when its PID matches this
owned xcodebuild's log; another runner is preserved. Cancellation does not replay
input or promise Home navigation after ownership has been revoked.

Safari's DEV website Microphone setting was changed from Ask to Allow through
this route, without Mirroring. A fresh normal page-driver microphone acquisition
then completed in 2.128 seconds with no prompt. Five disabled-source AAC chunks
were saved privately, decoded, and the test stream was stopped. Camera and
Location stayed Ask. This is not audible microphone or full-call qualification.
Receipt: annotation-safari-permission-wda-2026-10-10.json.

### Shared evidence for new diagnostics

Process profiles, system startup/cleanup and saved capture batches now append
content-free verification receipts to the same cross-harness learning database.
Use `ios_learning_evidence gate=device-profile|system-ready|system-idle|capture-audio|capture-data`.
For an active system session, pass its `sessionId` to match that runner's provider,
OS/build and code fingerprint. For an explicitly historical profile/capture receipt,
use `matchingRuntime:false` and review its fingerprint and date before reuse.
The shared records hold only counts and booleans. Trees, process identities,
console, requests and audio stay in private artifacts, outside lesson text.
A positive audio receipt proves chunks were stored, not audible/full-call success.
New lessons still require proposal and agent review; receipts do not automatically
turn prose into trusted guidance or weaken the two-runtime requirement for a
supported general lesson.

Failed resource-profile jobs also save a structural negative receipt. When the
provider fails before returning its OS version, the fingerprint explicitly uses
an unknown OS component; it is not an exact-iOS success claim. A timeout does not
prove that the phone is locked, disconnected, or missing USB.

## Exact-label native input

Within an explicit system fallback, `ios_system_action` tap can take `label` plus
`elementType` (Button, Cell, Switch or Link using its full XCUIElementType name),
instead of snapshot/target. The service requires exactly one visible/enabled
matching element through a direct native query, checks its
live bounds and hittability, confirms the app and owner, then sends one click.
It does not fetch another full XML hierarchy for a known label. This removes model
round-trip expiry for a known control. Duplicate/missing labels send no input.
Unknown input still requires a new observation and is never automatically replayed.
For a named SwiftUI Switch row, the driver resolves the unique nested native
toggle when present; ambiguous children fail before input. A successful tap still
requires state readback. No secure field or arbitrary predicate selector is accepted. Scroll can likewise
omit snapshot to capture a fresh native hierarchy immediately before one half-page
movement; a supplied stale snapshot still fails, and unknown input is not retried.

The fallback sets WDA waitForIdleTimeout to one second. A Chrome native click
completed while its response exceeded the client deadline; the previous ten-second
idle wait was a possible contributor. A timeout still means an unknown response:
inspect the committed UI and never repeat the click automatically. One-second
quiescence waiting does not remove live uniqueness/hittability or effect readback.

The runner supervisor tolerates at most 15 seconds of unconfirmed broker checks
while its private local owner remains live. Confirmed lease replacement, dead or
expired owner, EOF and explicit end still stop it. Each native mutation independently
confirms the broker lease immediately before dispatch; an unavailable status read
sends no input. This avoids turning one transient observer failure into a new
XCTest authorization cycle. The prior stop reason was owner_unconfirmed, not
proof of a disconnected cable, locked phone or user action.

Cleanup confirmation gets at most two bounded provider checks (15 then 8 seconds).
A failed first check remains unconfirmed until a fresh DVT PID read proves the owned
runner is gone. Only a PID observed in this runner’s startup log may be stopped;
a replacement process is preserved. This does not replay app input.


### No runtime sudo diagnostics

Xcode's automatic failure diagnostics spawned `devicectl diagnose`, which ran
`sudo true` after an intentionally ended XCTest session. The runner now passes
the supported `-collect-test-diagnostics never` option. Native driver operations
do not need administrator privileges; normal per-session runner logs and private
verification artifacts remain available. This disables automatic sysdiagnose
collection, not the ownership watchdog, runner cleanup or independent PID check.

Taylor's separate one-hour cross-session sudo cache can be installed from
`src/sudo-session/install.py`; it is a development convenience, not a runtime
requirement or an iPhone passcode exception.

Fixed `activate` and `home` can leave an unrelated foreground app while the phone
is unlocked. They do not inspect that app's contents. Hierarchy, scrolling and
tapping still require Safari, Chrome, Settings, Kickoff DEV or Home; a locked
phone is refused before any action. This lets agents open the intended DEV app
from elsewhere without expanding arbitrary-app inspection.

Chrome was separately qualified on the physical iPhone: after the exact DEV-host
Allow prompt was handled natively, the normal page driver acquired a disabled
microphone source, saved four AAC chunks (48 kHz mono, 3.863 seconds), and decoded
them successfully. Capture preserved the original source; explicit fixture cleanup
then stopped it and page glow-off passed. Chrome asked again on a later microphone
acquisition, so never assume an app-level or earlier site grant suppresses all
prompts. Use bounded native permission handling when observed; no Mirroring or
human microphone tap was needed. This is not audible audio or full-call proof.
Receipt: annotation-chrome-permission-wda-2026-10-10.json.

## On-demand native input qualification (v1.7.0)

`ios_input_matrix {action:"plan"}` explains the compiled UIKit fixture.
`{action:"start"}` returns a durable `jobId` immediately; poll
`{action:"status",jobId}` on this or another MCP connection. Omitting `jobId`
lists the ten most recent jobs. Read `ios-agent://native-input-matrix` for exact
coverage and physical limitations.

The job compiles the current real native driver into the isolated synthetic app
on **Kickoff iOS POC**. It takes a process-held simulator lock shared with the
direct CLI runner. It does not acquire the phone, invoke XCTest, alter Wi-Fi,
access accounts, or schedule periodic tests. Run on meaningful native input
changes, not as a polling test suite. A new start is never recovery for an
uncertain response: recover the existing job through status first.

Success requires `state:"completed"`, `passed:true`, `cleanupVerified:true`,
all independent behavior gates, stable source hashes, runner exit 0, and an
independent original simulator-state readback. The runner checks app registry
absence before restoring a simulator it booted. Raw evidence and logs stay in
private `qualification-jobs/<jobId>` files. MCP EOF leaves an explicitly started
job running to its cleanup; reconnect to observe it. The ten-minute execution
deadline requests Python cancellation, preserving its cleanup block and lock
until exit. A killed worker/host yields unconfirmed state, never a green receipt.

This is simulator driver proof. It does not establish physical phone gestures,
React Native composition, IME/hardware keyboard, browser or off-LAN behavior.

## Typed native and React inputs (v1.7.1)

`ios_native.args` exposes typed branches for all 11 current app actions and
rejects action/argument mismatches before phone dispatch. `ios_react.command`
is a discriminated union of the 15 existing fixed provider commands, including
component IDs and all profiling readers. No product-handler, state-injection or
arbitrary provider command was added. Read `ios-agent://native-input` for short
recipes covering verified navigation, text replacement, gesture outcomes,
profiling and Wi-Fi handoff. Native target and React component IDs stay distinct.

## On-demand browser debugger (v1.8 candidate)

`ios_browser_debug` adds source catalogs and bounded source windows, matched CSS,
console windows and short WebKit timelines. Read ios-agent://browser-debug or BROWSER-DEBUG.md for recipes, ownership and retention.
Physical Safari/Chrome source/CSS/console and combined bounded timeline reads
passed nearby. Use fresh document references; pre-input rejection and unknown
dispatched effects remain distinct. See browser-debug-dual-physical-2026-10-10.json. Routine network page control stays on
`ios_web_*`; paired Inspector availability is a separate prerequisite.

## Durable native build preparation (v1.8.1 candidate)

`ios_build plan/start/retry/status` wraps the existing signed generic-device DEV build
with durable job recovery and a process-held collision lock. The catalog now has
36 tools / nine resources. Read ios-agent://native-build and
ios-agent://browser-debug for the complete recipes. See NATIVE-BUILD.md. A build does not install, launch
or control the phone. MCP install packaging remains an explicit outstanding item;
no automatic replacement or readiness claim is made.


## Signed native installation (v1.9.0)

`ios_install action=plan|start|status` accepts only a completed `ios_build` jobId.
The fixed product is revalidated under the shared phone owner: DEV bundle ID,
unique signed deliveryId, executable hash and strict/deep signature verification.
No arbitrary product path/device/app, sudo, XCTest or Mirroring. Use a 180-second
MCP client timeout for start (CoreDevice install can take up to 60 seconds).

The private installId receipt survives reconnect. Accepted/unknown dispatches
are never replayed automatically. A successful result requires a fresh foreground
bridge reporting the same deliveryId, not repeated display build 775.
The signed stamp is local build provenance plus app self-report, not hardware
attestation. `ios_begin` independently qualifies React readiness afterward.

`ios_native action=home args={}` is an explicit DEV-only cleanup handoff. The
host retires control and the app confirms cleared glow before requesting its own
suspension; a lost acknowledgment or newer owner cancels that request. Prepared
handoff is not physical Home proof. Always end in finally, then verify idle.
Native Home and relaunch passed on the physical iPhone; see native-delivery-physical-2026-10-10.json. No off-LAN installation
or whole-phone control is claimed.

## MCP 1.9.2 — condition waits

The catalog remains 36 tools / nine resources. `ios_web_verify` now accepts a
bounded condition wait and `web-element` with a unique semantic selector,
optional exact expectedValue, and visible/interactable/editable state. It returns
fresh references on success, stops on read/ownership failure, and never repeats
input or media tests. Shared learning stores only structural gate booleans and
counts. See MOBILE-WEB.md for examples and the separate physical cellular proof.

## MCP 1.9.3 — actual call conditions

`ios_web_verify gate=web-call callPhase=lobby|connected|paired|released`
reads the existing DEV meet/media projections. Lobby requires settled media
requests and a ready, supported call. Connected requires the room connection;
paired also requires a remote participant. Released requires disconnected call,
known media hooks, ended observed tracks and no remaining observed peer connections.
Unknown observations fail rather than becoming zero or false-success.

A bounded `timeoutSeconds=0..30` waits for that condition without pressing Join,
requesting permission, starting a microphone or repeating input. Fixed diagnostics
show pending request counts and permission/error categories. Raw provider errors,
identities, SDP and tokens are omitted. These conditions complement the separate
`web-media` RTP advancement gate; they do not prove audible playout or provider
room identity. Released covers instrumented document media only.


### 1.9.4: named browser stacks

`ios_web_enroll profile=app|call-rig` and `ios_browser_debug profile=app|call-rig`
select fixed private origins. `app` remains the default (10446→3000/4000);
`call-rig` selects10520→3020/4020 without replacing normal dev routes.
The dedicated route/stack and recording-disabled synthetic fixture must exist
before enrollment. Pairing, RTP, audio, provider state and cleanup remain separate
checks. Read ios-agent://mobile-web for setup and boundaries.

### 1.9.5: native refresh and call cleanup qualification

The opt-in native DEV bridge requests Fast Refresh at startup and reports `fastRefreshStartup`. The setter receipt alone is not proof of delivery: a physical screen edit and an unsaved form edit both appeared while preserving route and bundle generation. Rediscover React component IDs after refresh. See `native-refresh-2026-10-10.json` for exact scope and limits.

The companion Kickoff call-page repair stops its owned microphone/camera tracks on actual page departure, including late acquisitions, while preserving immediate effect reattachment. Physical Chrome same-document departure passed. This does not imply Hang Up releases the intentional lobby preview, persistent OS permission grants, or an off-LAN system driver.

### 1.9.6: fresh exact native targeting

`ios_native action=tap args={selector:{label,identifier,class}}` reads the full tree and dispatches one guarded tap within the same call. Supply any nonempty subset of these exact fields; all supplied fields must match. Exactly one visible interactive valid-bounds view is required. Ambiguity/absence send no touch. No ranking or automatic input replay. The existing explicit snapshot/target/point form remains available. See `ios-agent://native-input` and `native-selector-2026-10-10.json` for physical evidence and limits.

### 1.9.7: exact Codex work-turn ownership

Pass your actual `threadId` to `ios_begin`, `ios_web_begin` or `ios_system_begin`.
No transcript path lookup is needed. When omitted, inherited `CODEX_THREAD_ID`
is used if present (the standard SDK may filter it out). Native, browser and system
acquisitions read that exact thread’s current rollout from Codex’s read-only native state database and validate its metadata. This follows resumed/segmented chats rather than selecting their original file. Legacy installations without a database accept a single matching rollout; ambiguity refuses automatic discovery.
The existing broker then requires its current active turn; completion or abort
retires ownership alongside the independent MCP connection guard. No newest-chat
heuristic, conversation export, hook trust change or global notification overwrite.

Check `begin.lifecycle`: missing, ambiguous or unavailable metadata explicitly
reports `mcp-connection` and its reason. A globally shared MCP process must not
inherit a different chat’s ID; compare the returned threadId before device input
and use the explicit rollout override when needed. Claude and clients without
that inherited context still require explicit end/finally or connection close.
This is not universal persistent-harness Stop-hook coverage. Supported Codex hooks
require user review/trust; this release does not install or bypass them.

Reference: [Codex lifecycle hooks](https://learn.chatgpt.com/docs/hooks),
[Claude lifecycle hooks](https://code.claude.com/docs/en/hooks).

### 1.9.8: wait for a native control

`ios_verify gate=native-element selector={identifier:"nutrition-settings"} state=interactable timeout=8`
waits for one exact visible app-owned native control. Select by label, identifier,
class or their exact combination; visible is the default state. It reads the full
private hierarchy and returns fresh snapshot/target/rect references, a compact
receipt and shared content-free evidence. Missing controls wait within the caller's
1–30 second budget; ambiguity, truncated trees, lost ownership and failed reads
stop. No touch, text or business mutation is replayed. Native input still checks
fresh geometry/hit testing; visibility here is not whole-phone occlusion or a
committed input value. Existing route/readiness gates already support bounded waits.

### 1.9.9: phone-local setup and clearer system handoffs

The explicit system fallback now accepts fixed `app:"shortcuts"` so agents can
prepare phone-local automation without Mirroring. Other arbitrary apps remain
refused; this is a setup lane, not a claim of off-site Shortcuts execution.
Home/activate read back the foreground handoff for up to two seconds without
replaying the action. A concrete Xcode deviceprep -3 / device-locked preflight
reports `physical_unlock_required`; generic startup/transport failures and
XCTest passcode authorization remain separate and unconfirmed until observed.

Version 1.9.9 also adds `ios_browser_debug op=network`, using the same private bounded Inspector lifecycle. Request/response/cache/timing/protocol/failure events are available when supplied by WebKit; response bodies are not fetched. Physical Safari and Chrome passed with nine and sixteen retained events, zero drops, disabled domains, detached Inspector and glow off. Known token/cookie fields were scrubbed. Provider timestamps can be zero or negative; do not treat them as calibrated latency. Thirteen Python Inspector checks and five MCP debugger checks pass. See browser-network-physical-2026-10-11.json.

###1.9.10: browser JavaScript stacks

`ios_browser_debug op=profile browser=safari|chrome sampleMs=1000` captures bounded ScriptProfiler stacks. Physical Safari47/Chrome48 samples passed with stop, completion, detach and glow cleanup. All physical sample timestamps were zero: use code attribution and counts, not time-based flame charts. Detailed stacks remain in private one-hour artifacts.

###1.9.11: native buffered response bodies

Opt-in `ios_capture modes=["network"]` now reads a clone of React Native buffered text/JSON blobs only when their actual size is at most32768 bytes. Own FileReaders abort on capture stop/release. Physical GraphQL body capture and ten caller/HTTP/error checks passed; native XHR200/404/500/status0 and existing WebSocket send were observed. Unknown/oversize bodies remain explicitly unavailable.

## Synthetic audio probes (1.9.12)

The 1.9.13 Inspector adds `ios_browser_debug op=dom`: bounded read-only controls,
ancestor clipping and DOM hit points. It can reuse an active system fallback
session without ending XCTest. See BROWSER-DEBUG.md and the separate physical
Chrome receipt. It does not qualify native delivery or off-LAN Inspector.

`ios_audio_probe` exposes fixed plan/select/run/read/stop operations for an owned
physical mobile call-rig page. Read `ios-agent://audio-probe` for recording-off
fixture prerequisites, receiver startup, interpretation and cleanup. This is
a ten-second extra-stream experiment, with no automatic input replay or promise
of audible latency, comparative CPU/memory, or off-LAN WebRTC.

## Native ordinary text fallback (1.9.15)

`ios_system_action action=type` appends up to256characters to one exact `label`/`elementType` ordinary TextField, SearchField or TextView. `action=clear` is explicit and takes no text. Secure fields and passcodes are excluded. Each mutation resolves a unique live, visible, enabled, hittable target and rechecks the current owner before sending once. Read the effect afterward; an unknown outcome must never be replayed blindly.

Physical Chrome: address clear/readback, URL type/readback, separate observed Go navigation, Unicode React form value and clear/independent DOM readback passed. Type the address without Return, inspect it, then tap the observed Go button. Combined URL+Return was unreliable. The original authorized XCTest runner remained active; no session restart. See native-system-text-physical-2026-10-11.json. Fresh connections load this schema; an already connected server keeps its older schema until an idle refresh.

## Browser resources and explicit field focus (1.9.17)

`ios_browser_debug {browser:"safari",op:"resources",sampleMs:1500}` captures bounded WebKit CPU and memory readings. Chrome uses the same operation with `browser:"chrome"`. Both physical browsers returned four readings of each in two seconds, with tracking stopped, Memory disabled and Inspector detached. No caller expression or forced GC is allowed. Read selected private event subtrees; attribution can include shared-process work. Provider timestamps were zero; host `receivedElapsedMs` preserves arrival order without claiming calibrated measurement time. See BROWSER-DEBUG.md.

Safari replaces its address field when opening the keyboard. Use `ios_system_action {action:"focus",label:"Address",elementType:"XCUIElementTypeTextField",sessionId}`, then inspect before clear/type. Focus sends one guarded click and no text. Physical focus → fresh inspection → clear → empty readback → type → exact URL readback → separate Go passed under the original runner. See NATIVE-INPUT.md. No IME, secure field or passcode capability is implied.

The separate runner-lifetime reservation remains experimental and absent from the default catalog. The Safari one-shot extension experiment was not integrated: it created a tab but did not foreground Safari from Home, so it does not solve off-site launch.


## Device orientation (published1.9.18)

`ios_system_action {sessionId,action:"orientation",orientation:"portrait"}` requests one fixed orientation and reads provider state. `landscape` is also allowed. Inspect actual layout separately; this is not orientation lock. Physical Chrome recovered a clipped Join button, then joined through a fresh exact native target query. Unknown input is never replayed; all existing owner/lock/app-scope guards apply. See NATIVE-INPUT.md and system-orientation-physical-2026-10-11.json.

Published1.9.18 adds explicit portrait/landscape recovery with provider readback, plus exact-label anchored scrolling for nested native/browser panes. Both physically exercised without restarting the held runner. Native web taps require independent DOM clipping/hit-test review; AX visibility can be misleading. 25 focused driver/schema/backend checks pass.

## WebSocket capture and native selects (published1.9.19)

`ios_browser_debug op=network` includes WebSocket lifecycle and frame events in the existing bounded private capture. Physical Chrome retained159frames/15189payloadbytes with zero drops and disable/detach confirmed. Text preserves content with known-key/Bearer scrubbing; binary content is omitted. Missing socket-creation URLs stay unattributed. Use selected `ios_read` pointers.

`ios_system_action action=tap elementType=XCUIElementTypeOther` opens a uniquely named native web-select control; inspect native options and tap the observed choice. Chrome transport selection and independent DOM value readback passed. Other is never accepted for field typing. Chrome's three audio baselines and three probe-only faults also passed, with both calls exited, provider0participants/recordings0, receiver stopped and Home confirmed. See the individual evidence files; no off-LAN RTC or controlled CPU comparison is implied.

## Dedicated worker discovery (1.9.20)

`ios_browser_debug op=workers` returns a bounded worker catalog. Physical Safari/Chrome synthetic-worker discovery, mandatory initialization, continued execution and domain cleanup passed. Worker debugging has an execution gate: this service initializes every reported worker even after owner loss. Read the private worker list selectively. This does not expose worker source/evaluation or assign unattributed Network frames to a worker. See BROWSER-DEBUG.md.

## Intentional heap diagnosis and capture windows (1.9.21)

`ios_browser_debug op=heap` requires an existing web/system session and fresh `documentRef`. It takes one full-GC JavaScriptCore snapshot, retains the graph privately (up to32MiB, one-hour expiry within the shared128MiB quota), and reports counts plus bounded class/shallow-size/immediate-retainer projections. This pauses execution and is separate from passive resource sampling; no live-call latency or leak conclusion is implied.

`ios_read` now accepts both `offset` and `count` for an array subtree; `pagination.nextOffset` advances the next bounded window. Oversize results return no partial JSON. Ordinary diagnostics retain their2MiB cap. Safari/Chrome physical graphs and cleanup passed; schema, ownership, format, storage and paging checks are separate from the held old-schema connection.

Document references now use WebKit frame/loader IDs rather than jittering `performance.timeOrigin`. Fixed context reads bracket the visible-origin check with loader reads. Actual Chrome reload rejected the previous reference before Heap dispatch. No timing tolerance or mutation is used to establish document identity. See BROWSER-DEBUG.md and browser-heap-physical-2026-10-11.json.
