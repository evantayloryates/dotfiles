# Agent operating contract — installed personal development service

Start with `ios_guide`. Its `interface` reports this connection's version,
40 tools and ten resources. Compare `/Users/taylor/dotfiles/bin/ios-agent-mcp
--catalog` for installed source without acquiring the phone. A guide without
`interface` is an older connection. Refresh only at an idle point; never kill
another owner's work to refresh schemas. See MCP.md for the operating recipes.

| Task | First useful operations | Cleanup |
| --- | --- | --- |
| Native DEV app | doctor → begin → native/react → verify | native Home → end |
| Safari / Chrome DEV page | web_pages → web_begin → inspect/action/verify | web_end → device_home (configured paired Tailscale); independently inspect Home |
| Page not yet available | doctor connectivity=true; wait_ready; fixed device_launch (native Focus fallback when provisioned) | No lease held while waiting |
| Exact observed system permission | End page/app session → system_begin → inspect/action | system_end; require runnerStopped |
| Deeper browser diagnosis | browser_debug; source/styles/dom/network/profile/heap/breakpoint/worker-* | Diagnostic domains stop and detach; content expires |
| Synthetic audio comparison | audio_probe plan; verify fixture/recording before call | stop probe, release call media, end page session |

For unavailable pages, expired grants or pending cleanup, use the recovery decision card in MOBILE-WEB.md. Read-only host diagnosis is allowed while another connection owns the phone; that does not grant access to its session.

Current MCP source is1.9.49. Signed candidate333fc2b73381422180f46783d53b1a9d
completed with verified signature and adapter, delivery8a0c15bd53fa4c34b6d82b06a16ebf95;
installation and app-owned Chrome qualification are being performed separately.
The phone-local Chrome Shortcut passed a fresh nearby launch after its one-time
permissions, then actual MCP readiness, glow cleanup and independent Home readback.
It is not yet proof of the app-owned or cellular hop. The prior HTTPS candidate
opened Safari; it is superseded as the next experiment, not counted as Chrome proof.

Native DEV cellular foregrounding and Safari cellular app-owned DOM/React Save
passed on their recorded signed deliveries. Nearby managed Chrome launch, input,
Inspector and channel/Home cleanup passed through actual MCP1.9.48. The exact
existing relay node is now retained for personal DEV with approved single-route
scope and verified restart policy. Actual-provider received synthetic audio
capture and call cleanup passed; see provider-received-capture-mcp-2026-10-11.json.
Deep cellular Inspector remains separate. Long-lived harnesses retain their
connection catalog until refreshed at an owned idle point. Historical receipts
below preserve the limits of each earlier build.

Use `/Users/taylor/dotfiles/bin/ios-agent`. App integration is isolated on
`ety/local-dev-foundation`. The dedicated Debug app is `com.dev.kudos.fit`.
Routine app control uses private Tailscale HTTPS, without USB, XCTest or Mirroring.
USB is a native build/install and recovery route. Customer production and staging
instrumentation are excluded from this delivery.

## Native foregrounding from cellular — 1.9.44

`ios_device_launch {target:"kickoff-dev"}` chooses the existing paired lane when
its fixed endpoint is reachable. If that endpoint refuses and the private
Focus setup is enabled, it sends one dedicated iCloud Focus pulse. The existing
phone automation opens DEV. It preserves a personal Focus, restores its own
temporary Focus, releases the launch owner, then reads fresh bridge availability.
Follow with `ios_begin` for actual runtime readiness; do not replay an unknown pulse.
Explicit `transport:"focus"` selects this native-only lane.

Physical MCP qualification passed with USB absent, Wi-FiIPv4absent and the external
developer endpoint refused. Fresh runtime, tailnet-Metro and lease/glow-off passed.
No XCTest, Mirroring or phone tap was used. This does not unlock a locked phone.
Provisioning uses private0600 `focus-launch.json` with exactly
`{"version":1,"enabled":true}` and the three fixed Mac Shortcuts documented in
the implementation; it also requires the dedicated phone-local Run Immediately
automation. Enabling the JSON alone does not provision that automation.

Signed delivery950108093b654ae89522d589f1d59d3c installed wirelessly and exposes
`ios_native action=developer-probe`: fixed loopback49152, two500ms bounds, no
authentication/bytes/caller address. Both families accepted on the phone with
Wi-FiIPv4absent. This supports a relay experiment; it is not a verified developer
channel. See focus-cellular-mcp-2026-10-11.json.

## Disabled reservation candidate

1.9.16 includes an opt-in runner-lifetime candidate, excluded from the normal catalog. It has structural and preservation tests, but has not passed physical retained startup/re-entry. Do not enable it in routine harness configuration yet. See RUNNER-RESERVATION-CANDIDATE.md. The earlier retained host owner has been released. The phone runner
was killed at about10:55UTC on11October; its automatic replacement failed
authentication and Xcode ended at11:00:36UTC. Host ownership does not prove
usable XCTest. Safari Remote Automation overlapped the loss, so interference
cannot be excluded; do not run competing automation-session experiments during
a requested runner hold. See xctest-hold-failure-2026-10-11.json.

## Qualified today

- Native view geometry, fresh target/hit fencing, tap, scroll, timed hold and
  focused UIKeyInput replacement. Physical dedicated meal hold, nested scroll,
  UIKit menu labels and safe dismissal passed. UIKeyInput is semantic editing.
- Standard React DevTools component/props/hooks inspection and commit profiling;
  fixed registered route/Apollo readiness; bounded console/global-fetch metadata.
- Remote Metro, embedded fallback, private local backend access; latest native
  Nutrition→Home with USB unplugged and no Wi-Fi IPv4 association.
- Fixed On/Off Apple Shortcut handoff with explicit fresh-lease return checks.
- Turn-owned glow/control, independent native expiry, release/background cleanup,
  and restoration of the prior idle-timer setting. Automatic lock is prevented
  only during a valid lease. Manual locking and OS authentication remain possible.
- One-shot startup fallback and scoped worker-outage recovery. A 35-second pause
  recovered fresh readiness in 1.633 seconds on the recorded runtime.

Newest exact binary receipt: `recovery-wireless-final-2026-10-08.json`.
Earlier paired workflow: coach 2456→phone and phone 2345→coach, nullable baseline
restored. That business workflow belongs to its dated build, not a new mutation
rerun in the latest transport smoke. Full Python suite 86, JS 22, UIKit fixture 51.

## One session, one owner

Create a new ordinary directory with mode 0700 under private service state;
use new files for every observation. Acquire with the active chat's own rollout.
Never print the lease, enrollment, full tree, props, screenshots or credentials
into routine logs. Detailed data stays in private files; publish sanitized gates.

1. Run `ios-agent doctor`. This is host prerequisite evidence, not app readiness.
2. Acquire a fresh lease with `--rollout <own-rollout> --lease-file <private-new-file>`.
3. Run `verify ready`, then `bundle-source`, `react-tree` and `native-tree` as the
   workflow requires. Gate `route` against the actual structural route.
4. For backend readiness, submit `action diagnostics-probe` and immediately
   `verify network` in the same batch; its observation expires after 3 seconds.
5. Get a fresh `action tree`. Select an actual visible control by its observed
   label/identifier and geometry. Send one `tap`/`gesture` with snapshot, node
   target and point. Verify committed route/content independently afterward.
6. In a `finally` block, release the originating lease and verify `idle` without
   a lease argument. End the agent turn only after cleanup, or explicitly record
   that native cleanup could not be observed because the device is offline.

Native input has five seconds after the first owner-fenced tree acknowledgment,
with a 15-second absolute capture age cap. Background React admission yields up
to two seconds after a tree. Live geometry/hit checks still run. Let scroll
momentum settle before the next tree; target-geometry rejection is useful evidence.
A result acknowledgment proves delivery, not a saved business mutation.

## Active work and honest blocked handoffs

A driver failure is an engineering task while a concrete workaround remains.
Try the next changed condition; do not repeat unchanged smoke checks. Before
ending an unfinished goal turn, read its actual platform status. Never say
nothing is needed while a blocked goal cannot restart itself. If the runtime
cannot resume it, name the required Play/Resume action, request it, and continue
independent work in the current turn. A checkpoint or shell process does not
schedule another turn. Keep actual authentication and publication refusals
explicit; never disguise them as completion or route around them.

## Failure and collisions

| Observation | Next action |
| --- | --- |
| Other owner active / cleanup pending | Leave that owner alone. Wait for actual retirement; do not restart or revoke them. |
| Rejection before input | Inspect the reason and settled screen; make a new explicit target decision. |
| Accepted action unknown / result timed out | Preserve receipt and accepted ID. Independently read UI/domain/persisted state. Never replay automatically. |
| Wi-Fi handoff / foreground loss retired lease | Release can remove the already-inactive capability file. It never releases a replacement owner or claims global idle. Acquire fresh only after app return. |
| Release transport/state unconfirmed | Keep the originating file for diagnosis; don't assume cleanup or acquire around it. |
| Source edit | Recheck ready and committed route. Component refresh can return Home even with unchanged bundle generation. Never replay business mutations to restore a screen. |
| Offline phone | Use host-idle as narrower evidence. Native watchdog expires control within 30 seconds without valid host responses; fresh native observation remains unknown until reconnect. |
| Host source differs | Use the documented installer restart at an owned idle point, preserving enrollment. Never stop unrelated services. |
| Backend unavailable | Read doctor. Use explicit guarded stack-ensure only at idle. Warm reuse is live-qualified; controlled shared cold recovery is not. |
| Startup never registers app | One 45-second embedded fallback retires control. Observe fresh readiness and acquire anew; it does not loop. |

The observer retires control at turn completion/interruption/replacement. Its
20-minute owner silence allowance accommodates reasoning; native expiry is still
30 seconds without valid host responses. Explicit release is the primary cleanup;
the observer/watchdog are independent fallback protections.

For Wi-Fi, use only `action wifi --args '{"state":"on"}'` or `off`. Handoff
retires control before opening Shortcuts. Reacquire, verify ready, read returned
callback plus `wifiInterface.ipv4Present`, and restore original network/route.
Prepared handoff, USB launch success and callback alone do not prove radio state.
If the connection is lost, do not repeat an accepted toggle blindly; use the
fixed USB recovery adapter or nearby Mirroring when its auth/lock state permits.

## Explicit limits

Native Fast Refresh now preserves the qualified screen route, expanded day and
unsaved meal draft (native-refresh-2026-10-10.json). Class owners or invalid refresh
boundaries can still reset state. Actual
laptop sleep/wake, tailnet VPN outage and controlled shared backend cold restart
are unqualified; worker pause is not claimed as equivalent. No guaranteed latency
or availability SLA is inferred from a development phone.

Hardware keyboard/IME/composition, multi-touch, arbitrary system UI and whole-phone
occlusion are outside current qualified scope. Main-window captures exclude system
overlays. Keep nearby Mirroring as system recovery/oracle; bounded WDA needs explicit
human authorization and actual runner stop. Do not silently switch adapters or
replace native delivery with a direct handler call. Requalify private input APIs
when iOS or the React Native architecture changes.

Temporary source probes were restored. Detailed private evidence is retained;
no XCTest, debugger, preview or temporary root tunnel is required to use the service.

## Publication closeout — 9 October

Audited foundation-branch push succeeded at `2a5218abb8`, with independent remote
HEAD readback. Dotfiles runtime/runbook is published on master. No develop merge
or customer production deployment. The shared call-rig source was committed
from its exact frozen owner handoff, separately; its physical/network/production
limits and final mouse-activation edge remain in its own task.


### 10 October annotation follow-up

Fresh stdio catalog: 27 tools / five resources. `ios_device_lock` physically ran
Runner Lock iPhone, verified passcodeRequired, and released its temporary owner.
It uses nearby paired developer transport, cannot unlock, and may interrupt
Mirroring. `annotation-lock-mcp-2026-10-10.json` records this boundary.

`annotation-trusted-audio-2026-10-10.json` qualifies Safari generated-stream
recording: three private chunks, valid assembled AAC, original track preserved,
fixture removed and glow off. This is not a microphone/full-call/Chrome/off-LAN
claim. Native console/network qualification is in the current dated native receipt.
Off-site foreground launch and approval-free system fallback remain open.

## Native browser/system fallback — v1.5

`ios_system_begin/inspect/action/end` adds explicit signed-XCTest input for Safari,
Chrome, Settings, Kickoff DEV and Home. Normal app/page workflows retain their
existing no-XCTest driver and glow. The fallback uses the same exclusive owner,
fresh targets, unique live native resolution and a hittability check; uncertain
input requires inspection before further mutation. It does not type passcodes.

Physical MCP Safari native menu input, persistent DEV Microphone=Allow, Home
return and connection-close runner cleanup passed. Nearby paired startup needed
no USB discovery or Mirroring. WDA traffic used Tailscale; arbitrary-network
startup is still unqualified and Apple may require physical authorization later.
A separate supervisor stops the matching owned runner on EOF, dead/stale owner
or lost lease. Its private runner log rolls over at 1 MiB.

`ios_device_inspect kind=resource-profile` adds three bounded process CPU/memory
samples through the pinned paired provider. Missing metrics stay null; shared
WebContent is not page attribution and CPU is raw provider units.

## Latest bounded browser/system qualification

Physical Safari and Chrome microphone permission recovery passed without Mirroring.
Chrome required enabling its iOS Microphone switch and accepting the exact DEV-host
prompt; live native label targeting and nested SwiftUI toggle resolution are in MCP.
The ordinary Chrome page driver then saved four disabled-microphone-source AAC
chunks, decoded successfully, preserved the source, and stopped it during explicit
fixture cleanup. Page glow-off and native runner PID cleanup passed.

Intentional XCTest exit previously triggered Xcode failure diagnostics, leaving
`devicectl diagnose` and `sudo true` authentication prompts. The signed runner now
uses `-collect-test-diagnostics never`; physical exit produced neither a new
diagnostic process nor a sudo probe. Routine iOS MCP operation needs no root.
The optional one-hour sudo cache is independent development configuration.

These results do not qualify actual call audio, native raw audio, arbitrary-network
runner startup, universal passcode-free authorization, or browser off-LAN updates.
See annotation-chrome-permission-wda-2026-10-10.json and
annotation-sudo-diagnostics-2026-10-10.json for the dated gates.


v1.8.1 adds a verified durable signed native build job (installation separate)
and browser-debug/native-build recipe resources: 34 tools, nine resources.
Safari source/CSS/console/passive-timeline Inspector reads are physically
qualified. Chrome Inspector and combined trace effects remain unqualified.
See native-build-mcp-2026-10-10.json and browser-debug-physical-2026-10-10.json.

## 11 October: Codex turn discovery

MCP 1.9.7 accepts the actual Codex `threadId` on native/browser/system begin. It reads that exact thread’s current rollout from the native state database, validates matching session metadata, and delegates active-turn admission/retirement to the existing broker. This fixes resumed chats whose original rollout has ended. Fresh physical native admission, Home handoff and idle/glow-off passed; 31 targeted Node checks and three structural lifecycle checks passed. Completion/interrupt tests are structural, not a claim that every persistent harness now provides automatic Stop. Claude and clients without Codex metadata must still end in finally. See codex-owner-discovery-2026-10-11.json.

## 11 October: native control waits

MCP1.9.8 extends ios_verify with native-element: one exact visible/interactive control, bounded1–30seconds, fresh references and shared structural evidence. Physical Nutrition→settings readiness passed in1.032seconds/two reads; a missing-control timeout failed correctly at1second, without input. Home prepared and device lease/glow-off passed.37 targeted checks include four new condition/integration cases. No new off-LAN, hit-testing, text-value or fault-injection claim. See native-condition-2026-10-11.json.

MCP 1.9.9 adds fixed Shortcuts setup targeting, bounded foreground readback and exact Xcode unlock-gate diagnosis. Fifteen focused driver tests and six runner tests pass. Physical Shortcuts launch and Run Immediately selection passed; its Open App action is not yet saved. No off-site launch claim.

MCP 1.9.9 physical acceptance: Shortcuts launch and Run Immediately selection passed; automation is not yet saved because its editor tree timed out. Home foreground and matching runner stop passed. Inspector Network capture passed in physical Safari/Chrome (9/16 events, zero drops, scrubbed known token/cookie fields, domains disabled, detached, glows off). Raw provider timings are not calibrated latency. No off-site launch or Inspector claim.

## Developer transport increment — 1.9.25

Fixed DEV/Settings/Safari/Chrome launch, Inspector and process profiling now have
an explicit paired userspace RSD route through Tailscale, without sudo, USB fallback
or XCTest startup. Physical foreground readbacks, Safari/Chrome dev-document reads,
full-screen capture and three stopped profiler samples passed over the overlay.
The original held XCTest owner remained intact. This adds transport reach; it does
not mark the physical off-LAN launch gate, new-runner authorization, Lock Screen
shortcut, enrollment-URL delivery or build installation qualified over that route.
See DEVELOPER-TAILNET.md and developer-tailnet-physical-2026-10-11.json.

## Static accessibility diagnosis —1.9.26

`ios_accessibility_audit` integrates the viable Apple audit daemon behind the same
owner and expiring selective-artifact workflow. Physical native completion and
Safari/Chrome positive tiny-button findings passed; background DEV refused before
audit start. Browser chrome can appear in results. Low-contrast positive control
failed, and clipped-text fixture attribution is unproved, so no zero-issue
accessibility certification is exposed. See ACCESSIBILITY.md.

#### 1.9.27 — paired browser URL delivery
Specific DEV URLs now reach Safari and Chrome directly over the configured paired
Tailscale developer lane. Both physical browser destinations and exact probe
query markers were independently read; no default-browser handoff needed.
Original XCTest remained active. Three provider-contract checks and four launch/
enrollment adapter checks passed; existing wrapper coverage passed separately.
Fresh MCP-owned enrollment and physical off-LAN acceptance remain explicit gates.

#### 1.9.28 — native alert visibility and guarded handling
The separate WDA alert API is now exposed in system inspection and guarded
alert-button input. Physical Safari Close and Chrome native-hierarchy OK paths
were independently confirmed; no microphone/authentication promotion. Six new
contract checks,27existing driver cases and31wrapper/alert checks passed.
Original runner unchanged; own static fixture removed, Home verified separately.

####1.9.29 — exact-prompt Claude cleanup bridge
`ios_harness_end` and optional begin-owner metadata are integrated with exact
session/prompt/subagent fencing and normal cleanup receipts. Six isolated contract
checks passed. The deterministic Claude hooks are prepared but not installed:
the real Claude CLI smoke failed at expired OAuth before hooks/inference. No
phone owner or live Claude settings were changed. Explicit end remains required;
CLAUDE-CLEANUP.md records the precise live-harness and physical handoff gates.

## MCP1.9.30 — phone-local cleanup and native geometry

The installed Runner Home shortcut contains one Apple Go to Home Screen action.
Paired Tailscale AppService dispatch succeeded and an independent original-WDA
foreground read confirmed SpringBoard/unlocked. This uses no XCTest startup,
Mirroring or sudo. Fresh owned MCP workflow and physical off-LAN qualification
remain separate; original long-running XCTest ownership was deliberately preserved.

Overflowing Shortcuts coordinates now preserve the usable hierarchy. Snapshot
input supports uniquely matched unnamed controls and ordinary fields, with live
geometry/hittability/owner checks; secure fields and ambiguous/moved controls are
refused. Physical clear/type readback matched Runner Home, and saved library
readback confirmed one action.72focused Node cases and12Python provider cases
passed. Fresh real stdio catalog/guide discovery is recorded separately.
See home-geometry-physical-2026-10-11.json.

## MCP1.9.31 — app-state evidence without XCTest

Fixed paired launches and browser URL delivery can report a short-lived Apple AX
foreground event for the exact target. Physical DEV/Settings/Safari/Chrome events
matched independent foreground reads. Normal native/page readiness is still a
separate check; no unlock or Home state is inferred. The stream sends no focus,
activation or visual-overlay command, disables monitoring and closes after one
launch. Seven new event contracts plus six related payload/Home contracts passed.
The original held runner remains unchanged; off-LAN qualification is still open.

## MCP1.9.32 — disabled Apple AX candidate

Default catalog remains39tools/10resources. The opt-in native AX tab-recovery
candidate adds one tool only with IOS_AGENT_EXPERIMENTAL_AX=1; no harness was
changed. The corrected low-level Workouts activation passed, but packaged Home
activation did not change selection. Standalone XCTest-free/off-LAN operation
remains unqualified while the original user-requested runner hold continues.
This candidate is preserved for focused qualification, not counted as a delivered
routine control path. NATIVE-AX-CANDIDATE.md and ax-native-candidate-2026-10-11.json
record the exact proof, failed effect gate and reasons for keeping it disabled.

## MCP1.9.33 — failed audio-recorder cleanup

If MediaStream/MediaRecorder construction or recorder start fails after cloning an
audio track, capture now stops that clone and any partially started recorder. It
records one failure and avoids retrying that same source on each one-second scan
within the capture. A new explicitly started capture may try the source again.
The application source is never stopped. Six capture contracts pass, including
constructor and partial-start failure cleanup. Physical Chrome with a deliberately
failing recorder confirmed one attempt/one clone stop, live source preservation,
final resource cleanup and independent Home return. See
capture-failure-cleanup-physical-2026-10-11.json.

Fresh browser documents receive the repair. Native includes this factory at build
time, so the currently installed native adapter needs a later build; it was not
replaced while preserving the original XCTest hold. Default catalog remains39
tools/10resources. No new source-discovery/provider-call or off-LAN claim.

## MCP1.9.34 — AX channel settlement, candidate still disabled

A new Invite activation passed with500ms of AX channel settlement, and the actual
packaged candidate then changed Invite to Workouts with independent native
readback. The candidate now preserves that bounded interval before final cleanup;
no activation is retried. This supports cleanup timing as an explanation for an
earlier unchanged Home selection, but does not uniquely establish that cause.
Eight provider/four MCP cases pass. Default remains39tools/10resources; the optional
AX flag adds one tool. Corrected Home/Nutrition, standalone XCTest-free and physical
off-LAN operation remain unqualified. It stays disabled for routine workflows.
The original runner was never stopped; independent unlocked Home cleanup passed.

## MCP1.9.35 — long-hold failure diagnosis

The user-requested original host owner was preserved, but the phone runner later
disappeared. The Xcode result records a killed test, then authorization failure
for its automatic replacement; the original host test process subsequently
exited. No intentional end was sent. The cause of the original kill is unknown.
Mirroring could reconnect without a prompt, but did not restore XCTest.

Future driver instances distinguish an exited owned runner from a transport-only
failure and report the exact observed UI-testing authorization failure before
more requests/input. Eight Python and29Node cases pass. This improves diagnosis;
it does not bypass Apple authorization or guarantee long-lived automation.
The original loaded MCP connection remains unchanged and its owner remains held.
See xctest-hold-failure-2026-10-11.json. Safari Remote Automation input was also
evaluated and closed as an unsuitable default driver: its reads work, but click
and keyboard effect gates failed. SAFARI-AUTOMATION-CANDIDATE.md records the edge.

## MCP1.9.36 — existing WebSocket receive capture

Fresh page adapters now supply their existing live WebSockets to opt-in network
capture. The recorder attaches at most32 existing receive listeners, retains
new-socket coverage, scrubs text and removes listeners without closing the app
sockets. Capture status reports discovery and actual watch/listener counts.
Nine host checks passed, including a real transport and exact SDK integration;
physical Safari/Chrome acceptance remains open. No app/page reload, native build,
XCTest startup or original-owner handoff was performed. See
existing-websocket-capture-2026-10-11.json.


## Fresh owned acceptance —11 October, MCP1.9.36

The prepared signed build `e9f862ef121c447987d7fed37767aace` is now installed.
Fresh running deliveryId matched `5da0f761d1fa477dac788b5b621c2b06`.
A fresh real stdio MCP connection passed native readiness, normal Nutrition-tab
input with committed `ClientMealLogs` readback, React inspection (1577 components),
a fresh synthetic GraphQL probe, rich console/network capture, prepared Home
handoff and independently acknowledged idle/glow-off. The initial route assertion
used the display caption, and an earlier probe expired while another assertion
ran; corrected expectations/fresh probe passed without replaying navigation.

Fresh owned Safari and Chrome sessions passed ordinary React form fill/save and
rendered readback. Each discovered one WebSocket opened before capture, retained
13 receive events, and left the original socket open after stop. These physical
MCP-owned receipts close the existing-socket acceptance gate from1.9.36.
Each also discovered and recorded the synthetic received WebRTC track through
`ios_capture`. Host ffmpeg decoded the saved chunks (Safari494528/Chrome88000
mono48kHz frames). These fixtures had suspended AudioContexts and decoded silence:
this proves source discovery, recording/artifact transport and original-track
preservation, not audible or non-silent provider-call audio. Earlier independent
primitive receipts establish non-silent synthetic capture separately.
Both browser sessions confirmed ownership released and glow off. All synthetic
peers, tracks, contexts and socket fixtures were explicitly disposed.

The stale original host owner was released by Codex turn cleanup before this
batch. No XCTest, Mirroring, sudo or microphone approval was used for this batch.
Claude CLI currently reports loggedIn=false; its live lifecycle-hook acceptance
remains pending. Do not substitute a host-only hook test for that gate.

### Cellular transition is not qualified

USB inspection found no attached iPhone. The fixed Wi-Fi Off shortcut handoff
retired native control and acknowledged idle. The subsequent Tailscale developer
launch failed before input; the phone also stopped answering Tailscale ping, and
native/page bridges remained unavailable after a bounded readiness wait. Nearby
CoreDevice recovery launch timed out and was not replayed. USB recovery was
requested; Wi-Fi restoration remains pending. This does not establish a locked
phone or a defective cable, and it is not successful off-LAN acceptance.

Do not repeat Wi-Fi Off while this failure is unresolved. Once recovered, inspect
cellular availability, Tailscale per-app cellular permission/VPN state and the
actual shortcut outcome. A viable cellular test needs both an observed ready
transport and an independently available recovery path. A phone-local timed
recovery shortcut is a useful candidate, but its background completion must be
qualified before relying on it. No new always-on runner or hidden transport
fallback is introduced by this evidence update.

See `owned-acceptance-2026-10-11.json` for structural receipts and exact boundaries.

## Read-only connectivity diagnosis — MCP1.9.37

Optional ios_doctor connectivity=true passed through a fresh real MCP connection.
All host prerequisites passed; the fixed phone was absent from USB, Tailscale
answered one ping, and no foreground app/page bridge was available. Lock state
remained unknown. These are separate observations, not an off-LAN control pass.
See connectivity-mcp-2026-10-11.json. No running worker restart or native rebuild
was needed.29 historical task-owned smoke clients were closed after verifying
no active phone owner; the temporary helper now has a30-minute lifetime and
releases its stdin handle. Persistent production MCP connections are unchanged.

## Physical Claude main-agent cleanup — MCP1.9.39

The actual Claude CLI acquired a physical Safari DEV page through the production
MCP. Its PreToolUse owner tuple matched begin; actual Stop released one owner and
confirmed glow off. A separate page inventory confirmed indicator off. Decisions
came from a loopback fake API, not provider inference. This closes main-agent
device lifecycle acceptance; the earlier OAuth failure is no longer its blocker.
See claude-physical-hooks-2026-10-11.json.

Qualified main-only hooks are installed for new Claude Code sessions. The
idempotent installer preserves permission policy and unrelated hooks, backs up
privately and rejects a changed config rather than overwriting another writer.
Nine focused lifecycle/installer checks passed. Child begin events are skipped;
actual child hook delivery remains unqualified. Explicit end, EOF and silence
safeguards remain required; Stop is not a universal cancellation signal.

USB recovery dispatched the fixed Runner Wi-Fi On shortcut and foregrounded DEV.
Native readiness passed; its fresh interface observation reported Wi-Fi IPv4
association. The configured paired Tailscale endpoint then accepted Safari
enrollment with the current web SDK. This is recovery evidence, not cellular
launch qualification. Before another Off test, independently establish the
cellular/VPN recovery conditions; do not repeat the unresolved transition.

## Bounded resumable system startup — MCP1.9.40

An observed slowdown was MCP stopping every unconfirmed startup after45seconds,
so human authorization could arrive after its runner was already gone. Begin now
returns a pending owned session after a short read; inspect resumes that same
runner, with no input authority until actual WDA readiness/session confirmation.
The five-minute ceiling, EOF, owner loss and explicit end retire pending work.
Apple may terminate authorization sooner. Its exact XCTFuture1000 enabling-mode
timeout is now a distinct observation, not a claim of lock or transport failure.

Physical pending-session return and same-session inspection were exercised. Apple
ended that attempt with its own enabling-automation timeout; runner stop and lease
release were confirmed. Human authorization/resumed ready remains open. Nineteen
focused Node checks and one exact-error Python check passed. No passcode bypass,
Mirroring dependence or off-LAN startup qualification is claimed.

## 11 October: active goal and exact alert selection correction

A stalled goal required the human Play control; active state was independently
read back. The operating guidance above now prohibits an unactionable blocked
handoff. The first-observer experiment applied before native querying: SpringBoard
alert inspection responded, but the Safari-owned camera prompt remained visible
and Safari alert inspection timed out. No physical input was sent; own runner
stop and owner release passed. See goal-resume-observer-2026-10-11.json.

MCP1.9.41 corrects exact alert dispatch to the installed WDA handler's `name`
field. The former `buttonName` field was ignored by that provider, permitting
default-button selection. Seven focused checks pass, including the installed
provider source contract. Physical selection acceptance remains pending; this
fix does not claim that stalled Safari inspection is resolved.

### Bounded Safari alert increment —1.9.42

New alert-only system inspection avoids the full browser hierarchy. Physical
reads of the exact synthetic Cancel/OK prompt succeeded, exposing approximately
10.5seconds per native alert endpoint. The new15-second read ceilings preserve
authentication refusal and unknown-input fencing. Freshness is checked at action
admission, before slow context validation, followed by exact live alert revalidation.
Eleven alert-focused checks passed. Physical alert-only inspection passed twice;
one exact Cancel dispatch resolved the correct label, but native synthesis returned
an invalid hit point and the dialog remained. The unknown input was not replayed.
Own runner stop and owner release passed; Runner Home was dispatched once and
a later independent display confirmed Home. See safari-alert-only-2026-10-11.json. No general passcode
exemption, off-LAN startup or actual provider-call qualification is inferred.

### Actual provider received-source capture —MCP1.9.42

Physical Chrome and desktop coach joined the fixed synthetic Twilio call through
normal product controls. Independent provider readback:2participants, recording
disabled and0recordings. Agent handled Chrome microphone Allow through the native
hierarchy after one human XCTest authorization; stopped the runner and reacquired
owned page control. `ios_capture` source discovery identified the received track.
Ten chunks decoded to10.26seconds of non-silent48kHz audio; original tracks stayed
live after capture stop. All30capture events drained, remaining0/dropped0. Both call
UIs exited, coach input restored/muted, saved transcript blocks preserved. Independent
provider cleanup:completed room,0participants,0recordings. New document media empty,
glow/owner released and physical Home independently viewed. Temporary helper closed.
See provider-received-capture-mcp-2026-10-11.json and AUDIO-PROBE.md for the operational
recipe and completed-room404 handling. This closes the actual-provider capture gate;
off-LAN launch/recovery and Safari's invalid native Cancel geometry remain separate.

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

11October resume: signed1.9.46 build46ba10e5fb884906aa90d0b4afb03f50 installed
once via MCP receipt35876bd766d145f774b57568e19ff674; fresh delivery4034fdeaee2849b0b1461bc56d9f532d
matched. Home cleanup independently viewed. Chrome HTTPS candidate opened Safari;
retain the paired Chrome path and do not claim cellular Chrome launch. MCP1.9.47
adds explicit USB screen/capabilities recovery, physically read through actual MCP.
Foreground-only outgoing pairing relay candidate build4c713076a2394c00beb5a2bc42190ff7
is running, not installed/qualified. Core worker restarted only after verified idle;
source identity matched, existing enrollment and Serve routes preserved.
