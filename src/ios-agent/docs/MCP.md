# iOS agent MCP — shared service interface and operational learning

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
   Codex should supply its **actual active rollout path** to retain automatic turn
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
The catalog is 31 tools and five resources. End the normal app/page session first.
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
