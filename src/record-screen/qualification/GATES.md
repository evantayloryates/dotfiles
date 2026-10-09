# Qualification update — October 8, 2026

## Eleventh pass: buffer/backing color isolation and source diagnostics

The previous goal turn made progress: preview lifetime passed and one combined
fixture exposed the cross-display color boundary. This stage preserved those
results and used eight sequential single-buffer probes to isolate that boundary,
followed by one targeted declared-backing capture. No pointer series was repeated.

| Gate | Verified evidence | Limits |
| --- | --- | --- |
| Pre-encoder isolation | Fresh external BGRA and NV12 buffers shifted declared primaries; explicit 709 matrix and explicit CI sRGB rendering did not repair the values. Retina cold buffers stayed within two channel values. Eight probe children actually exited 0; no encoder/input was used in these probes. | Local macOS 26.5.1, two actual display profiles, owned AppKit fixture; no universal SCK or app root-cause claim. |
| Backing-color control | Draw logs showed inherited Color LCD / DELL P2419HC backing spaces with profile refresh enabled. External source primaries closely matched device RGB interpreted through the external ICC profile. Changing only the owned window backing to sRGB restored both BGRA/NV12 references within one channel value. | Controlled backing boundary; not evidence to change another app, system profile, or apply a recorder-wide correction. Earlier shifted footage stays preserved. |
| Actual source and preview | Signed/loaded ff2c43b308aa recorded 229 exact muxed/source timestamps with zero dropped encoder frames/lost journal rows. All 18 sampled declared reference RGB values across external → Retina → external geometry stayed within two channel values. The 230-frame software preview reproduced all 18 source values exactly. | Six authored SDR sRGB references and the local H264/software-preview path. No HDR, physical colorimetric or arbitrary viewer/codec accuracy claim. |
| Source diagnostics | Ten CV-buffer checks passed. Source journals emit observed color boundaries and frame color-segment links; source metadata exposes the latest actual tags separately from requested sRGB. The real NV12 source observed primaries/transfer/matrix 709. Actual MCP recording_source returned these fields; persisted source/footer retained them. | Missing/legacy tags remain unknown. Summaries describe accepted journal rows; loss/error flags remain authoritative. App backing intent is not inferred from output tags. |
| Cleanup and preservation | Both fixture PIDs absent, all eight probe children, owned MCP server and isolated engine actually exited. No input subscriber, preview lane, lease, export or quarantine work remained. Runtime evidence copied privately. Production readback stays cd78c24b652e/PID 71911. | Host pressure/churn continued independently; no peer workload was stopped and no resource capacity claim follows. |

The first probe/audit compile diagnostics remain saved. The initial tag test
expected the literal sRGB instead of CoreVideo's IEC_sRGB; the corrected test uses
the actual constant and exits normally on failed assertions. An initial journal
verification path was wrong; the saved runtime identity resolved the correct path
without restarting the take. These are retained diagnostic failures, not recorder
capture failures.

Primary API references: [output-buffer color space](https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/colorspacename),
[window backing color space](https://developer.apple.com/documentation/appkit/nswindow/colorspace),
[backing change notification](https://developer.apple.com/documentation/appkit/nsview/viewdidchangebackingproperties()).
The observed profile comparison is an inference from local reference transforms;
the controlled backing experiment is the direct acceptance evidence.

Private stage: gates-v11/qualification-summary.json, buffer-comparison.json,
profile-transform-proof.json, declared-color-proof.json, preview-color-proof.json,
source/mux proof, draw-state logs and runtime-evidence. Next: provider mapping/tap
gaps and sleep boundaries, Chrome overflow, realistic insurance/admission, shared
workflow receipts and idle-boundary production delivery. Effects remain deferred.

## Tenth pass: preview lifetime and combined pointer/color evidence

Taylor resumed with explicit guidance to maximize learning, retain useful work
and avoid unnecessary rollback or repeated phases. The checklist is active.
This stage reused the recording identity observer and one authored combined
fixture; no installed engine or peer workflow was restarted.

| Gate | Verified evidence | Limits |
| --- | --- | --- |
| Persistent preview lifetime | Signed candidate 83efb9156bea invalidated only the affected lane when owned helper PID 48094 exited; the unexcluded lane remained. Missing helper requests refused. Relaunched PID 50261 resolved a fresh lane. Fifteen lease checks and two targeted MCP tests passed. | Helper was on another Space, so this stage adds lifecycle evidence, not pixel-exclusion proof. Ninth-pass actual pixel evidence is preserved. Observation can lag; forced late SDK delivery remains unqualified. |
| Delivered pointer coordinates | Four native CUA clicks matched the app's independently converted Quartz positions and raw CG timestamps exactly. Two clicks on external 1×, two on built-in 2×; three source geometry segments include negative desktop y. All four predicted source points matched decoded yellow marker centroids within 0.5 pixels. | Native CUA clicks only, not all providers/physical input/drag/scroll. Requested screenshot coordinates differed from actual delivered points. Raw composition positions remain withheld pending provider coverage and service mapping. |
| Source clock and retention | One 48.6-second 440×312/10-fps take supplied 481 exact muxed/journal timestamps, zero lost rows and zero dropped encoder frames. App-delivered timestamps matched retained events despite unrelated global foreground. | Source spacing does not establish OS frame completeness or physical presentation latency. |
| Color fidelity failure | Six declared sRGB patches sampled across three geometry segments: Retina maximum channel error 2, external maximum 76. External red 238/20/1, green 76/253/0, blue 56/0/253; Retina primaries 253 with other channels zero. Returning home restored the initial colors. | Actual cross-display capture/decode finding. Capture already requests sRGB. Display profile, SCK NV12 conversion and writer interpretation are hypotheses to isolate, not established causes. |
| Preview color preservation | A 487-frame software draft preview reproduced all 18 sampled parent patch RGB values exactly. | Parent color failure propagates correctly; preview preservation does not repair the capture. Arbitrary codec/color or viewer behavior remains unqualified. |
| Recovery and cleanup | Initial native coordinate action refused noWindowsAvailable. Exposed AX external/home controls worked, subsequent native delivery passed, and the same take was kept. Both owned engines exited 0; all three helper/fixture PIDs absent; no input subscriber, preview lane, exclusion lease or export remained. Private runtimes copied out. | Host pressure continued; no cause or production resource budget inferred. Installed production cd78c24b652e/PID 71911 stayed unchanged. |

Private evidence: gates-v10/qualification-summary.json, frozen preview-source,
coordinate-color-proof.json, preview-color-proof.json, actual decoded authored
frames, source/mux proof and both runtime copies. The initial fake-engine test
lacked its image response; the fixture was corrected without changing the service
behavior. The local analyzer had no NumPy; the repeatable verifier uses Pillow
and the standard library instead. These diagnostic failures remain recorded.

Next high-impact work: isolate actual buffer color metadata/pixel format against
PNG/encoder output without repeating pointer qualification; finish provider
mapping/gaps and sleep boundaries, then remaining Chrome overflow, realistic
insurance/admission and production delivery. Visual composition stays deferred.

## Ninth pass: excluded-helper lifetime and recovery

The resumed workflow continued into a process-lifetime canary. Workspace launch/
termination notifications omit background/LSUIElement apps; the candidate uses
KVO of the full running-app list. The first implementation incorrectly treated
an indexed KVO change as a complete list and refused to start the excluded take.
That failed candidate (0d9751d46d4c) remains private evidence; full-list reads
corrected it. Apple documents main-run-loop timing, so detection is observational
and cannot establish the first leaked pixel or promise zero collisions.

| Gate | Verified evidence | Limits |
| --- | --- | --- |
| Mechanical lifecycle | 35 checks: missing baseline, replacement, same-PID/different-launch identity, multiple helper processes, stale SDK filter disagreement, recovery, 16-lease admission, fanout and reentrant callback. | Synthetic identity transitions; actual adapter tested separately below. |
| LSUIElement live interruption | Signed isolated 281b374ad0b2 recorded with explicit helper exclusion. An unrelated fixture launch and close kept it running. Closing the excluded background helper interrupted the take, finalized its partial MP4, and released the lease. | Detected termination; no universal launch latency, first affected frame or in-place filter repair guarantee. |
| Fresh-process recovery | Relaunched helper changed PID 89252 → 8579. A fresh excluded take resolved the new PID and completed with zero dropped frames. | Task-owned accessory helper on the built-in display; persistent preview-lane lifetime is still open. |
| Actual source pixels | At the sampled source frame, baseline had 63,140 authored magenta pixels; excluded and recovered samples had zero. All 148 baseline + 437 interrupted + 76 recovery muxed timestamps matched journal decisions exactly, zero loss. | Three 360×212 takes, baseline 30 fps and subsequent 15 fps. Authored chroma presence does not prove arbitrary clean footage. A strict RGB threshold failed because the baseline decoded to 253/62/254; exact color reproduction remains unqualified. |
| Consumer uncertainty | Recording manifest, recording_source, journal video outcome and a 12-frame exported preview retained interrupted/uncertain parent quality. Failed startup and unknown contamination onset remain explicit. | Consumers must inspect or reshoot; successful writer finalization is not clean-source proof. |
| Capability boundary | MCP requires exclusion_identity v1 for recordings with nonempty exclude_apps. Ten Node regressions passed, including refusal of an old filter-only engine and supported forwarding. | Capability advertisement/readback is distinct from the live capture build; no installed release yet. |

Private stage evidence, frozen candidates and runtime copies are in gates-v9.
The final capability-advertisement candidate 4663eb00f2cf compiled, signed,
loaded with the existing grant and read back exclusion_identity v1 plus the
restored uncertain source outcome; actual capture used 281b374ad0b2.
Only owned helpers/engines were closed; actual PID exits, zero input subscribers,
zero preview lanes, zero exclusion leases and no pending export were verified.
Production remained cd78c24b652e/PID 71911 with its existing grant. Host pressure
recurred during this stage; no cause was established and no peer work was stopped.
Remaining gates: preview-lane lifetime, raw pointer coordinates, tap/sleep gaps,
Chrome select/nested overflow, realistic insurance/admission, capture colors,
production install/rollback and final runbooks. Visual effects remain deferred.

## Eighth pass: mapped previews and recovered worker canary

Taylor explicitly resumed at approximately 22:21 UTC. Earlier pressure incident
had closed; the existing watcher was verified alive. New live work followed
low-paging/churn samples, with no peer workflow stopped. Production remains
cd78c24b652e/PID 71911; screen access remains granted. No release has occurred.

| Gate | Verified evidence | Limits |
| --- | --- | --- |
| Owned subprocess recovery | 88 real-child checks: concurrent stdout/stderr drains, bounded output, short-exit races, independent caller timeout, unfinished admission, TERM-resistant child exit and recovery. | One owned child; a kernel-stuck producer remains quarantined. No global desktop restart. |
| Derivative time/content map | Ten software exports across zero/nonzero-start VFR fixtures matched 264 actual decoded frames to expected held parent content. Final source repeated six exports/139 frames with 35 assertions, including the exact 0.07–0.14 s cut at 100 fps. MP4/GIF non-grid trims, packet clocks, scale dimensions and private output modes passed. | Authored uniform-grey content; does not prove arbitrary renderer/codec/color fidelity or GIF viewer scheduling. |
| GIF pixel failure corrected | ffmpeg 8.1.2 `palettegen=stats_mode=diff` omitted the fixture's final 190-grey color despite correct packet counts. Full histograms preserved it; failed palette and export remain private evidence. | Local pipeline/version finding; underlying library root cause not established. |
| Latest background worker live canary | Signed isolated fa3912d0a529 take completed: 639 exact mux/source samples, zero loss/drops, three geometry segments; two authored marker geometry proofs had zero edge error. All four typed key transitions matched native delivery timestamps exactly. | Native fixture, 22 seconds; actor ownership and pointer coordinates remain unknown. Short healthy operation does not reproduce the earlier watchdog. |
| Worker costs and cleanup | Main refresh mean 24,724 ns/max 95,375 ns; periodic listener context mean 2.31 ms/max 6.50 ms; window context mean 3.64 ms/max 7.89 ms; shared recording monitor mean 5.10 ms/max 12.06 ms. All workers/listeners returned inactive. Owned fixture closed through CUA and inventory verified absent. | Component costs in a bounded canary, not physical input latency or a production resource budget. |
| Real preview/media readback | Software draft, hardware standard and GIF each had 145 correct parent packet references. Real MCP recording_source/export_time_map returned actual rational media times and explicit outside-grid exclusions. Native menu appears in source and GIF preview pixels. Full/native/60-fps hardware preview had 725 mapped packets with exact nominal clock; GIF maximum nominal rounding 1/300 s. | Menu extends to the frame edge; this does not complete nested-overflow or insurance gates. |
| Receipt uncertainty preserved | The valid action close arrived after its declared deadline; receipt stayed expired/interrupted. Typed/marker/menu observations corroborate operation behavior independently. | Do not upgrade an expired interval to timely verified completion. Close compact scopes immediately; end result/refs must match the API. |
| Agent boundary | Ten Node regressions passed, including unsupported-engine refusal, effort forwarding, real sidecar interpolation, >2^53 exact integers, wrong identity/clock rejection and no export replay after socket loss. | Source/MCP candidate only; installed production still lacks this contract. |

Private evidence is in gates-v8. Candidate source/signature history is preserved
separately: fa3912d0a529 captured live; 9a06e1656195 loaded and exported with
tighter clock validation; 007cee2570b2 adds unique default names and whitespace
cleanup; 974d30f9c443 fixes decimal grid rounding and actually exported seven
packets at parent ticks 7–14. Exact latest load/name/boundary readbacks are
recorded in the stage summary.
Remaining helper PID churn, raw coordinates/tap-fault/sleep behavior, overflow,
resource insurance, installation/rollback and final runbooks remain open.

## Historical clean pause — October 8, 21:28 UTC

Taylor requested a pause until an explicit resume. Owned capture/fixture load
is stopped; installed production remains unchanged. Eighth-pass offline work
added a standalone owned-subprocess runner with 88 passing real-child checks.
It is not yet integrated into exports, and derivative timing/geometry mapping
and preview effort tiers remain open. The preceding watchdog and failed
insurance gate are preserved below; no production-readiness claim is made.
Resume details are in [PRODUCTION-GOAL.md](PRODUCTION-GOAL.md).

## Historical pause checkpoint — October 8, 18:55 UTC

Taylor requested a clean pause before the 3 p.m. call. Owned native fixtures,
input listener and isolated engines are stopped; no active recordings or action
scopes remained. The goal was paused, then resumed at 20:01 UTC. Production remained unchanged.

After the measured listener-loop cost, source candidate 3a066b8a1c64 compiled with
window enumeration on a utility queue, one-query admission, stopped-generation
snapshot rejection and explicit age/stall/cost diagnostics. It has not been
launched/live-tested. Last live-qualified candidate remains 99752c4615cf. Resume
with its offload/lifecycle canary. Private pause/runtime evidence is in gates-v5.

## Seventh pass: Electron depth, motion and WindowServer watchdog

Private gates-v7 preserves nine take directories and the user-supplied watchdog
report. Production remains cd78c24b652e, automatically relaunched as PID 71911
after desktop recovery; its existing screen grant was read back as granted.
No production install, security grant, user input lock or crash-report send.

| Gate | Actual result | Limit |
| --- | --- | --- |
| Electron native/nested menus | Owned VS Code window: native context menu in encoded footage; three nested levels present with child inclusion and absent without it. All 5,002 muxed timestamps across five Electron takes matched journals exactly. 98 retained key/modifier events addressed Code; operation scope closed as delivered. | App delivery does not prove actor ownership. Padded display also included unrelated desktop pixels; this pair did not establish additional menu rows beyond the isolated canvas. |
| Single-window motion | Two 25-second takes: 721 point-resolution/30-fps samples and 1,384 Retina/60-fps samples matched journal timestamps, zero lost rows and reported encoder drops. Decoded binary app counter changed 719 and 1,337 times respectively. | Timer/capture/encoding differences are not isolated source drops or physical latency. Source was off Space during recording. |
| Preliminary resource cost | Recorder median CPU was 2.02% and 5.94% of one core; sampled RSS peaked at 89.23 and 149.28 MiB. Video sizes were 4.16 and 18.80 MB. Baseline motion-only and WindowServer samples are saved. | Includes setup/finalization samples, excludes attributable GPU/driver cost. Concurrent workloads remain. Not a capacity, P80 or insurance qualification. |
| Failed paired take | Window source failed: 715 accepted submissions, 713 actual decoded/muxed packets, timing proof failed, binary counter unchanged. Display crop finalized with 379 exact samples. | Motion had already stopped changing at the end of the prior Retina take. The window was off Space; matching scene coverage of the crop was not established. A finalized backup is not proof that it can restore the shot. |
| WindowServer watchdog | User report captured at 20:51:55 UTC: 40-second missed check-in, unresponsive ws_main_thread, nominal thermal state, display OFF. Main kernel image UUIDs matched IOGPUFamily 130.13 and AGXG17X 351.2. WindowServer PID changed 98864→70678. | Graphics wait is evidence, not attribution to the recorder, fixture, other workload or a specific driver defect. Report resident-memory fields conflict with sampled RSS and are not used for memory attribution. |
| Failure visibility | Source journals recorded window-query stall, tap disabled and unavailable-context gaps. Main context refresh reached 63.095 seconds, background window query 67.914 seconds. Scheduled window take finalization was delayed until 20:51:59. | Existing Quartz monitor ran on the recording queue, and other periodic OS reads remained on the listener main loop. Offloading only transient enumeration was insufficient. |
| Next context candidate | 113 listener-context, 106 shared recording-monitor and 113 window-context assertions passed. Full source cfbf7de741a7 compiled and signed in a private bundle. Periodic TCC/workspace/tap reads and shared disturbance enumeration now use retained single-worker slots, late-generation rejection and explicit stale/unknown snapshots. | Not launched or installed. Initial tap creation, per-event protected-input check and encoder/SDK work still involve OS APIs; no universal bound on all OS failure paths. Live canary remains required after passive health reconciliation. |
| Structural historical audit | 31 prior chats since September 17: 2,655 CUA calls had matching results; 1,441/1,510 scripts with action references had an observation reference in the same or next call. This qualification chat is counted separately. | Static code references and opaque outputs do not prove skill invocation or task success. No semantic classification performed. Future quality evaluation needs structured delivery, verification and cleanup receipts. |

Owned candidate PID 27957 was stopped only after terminal recordings, zero input
subscribers, actions and preview lanes. Reopened owned motion/protected fixtures
were closed; process readback showed neither running. Raw footage, input and the
5.15 MB crash report remain private. No further live load in this checkpoint.

Live qualification remains deferred at the current host-health boundary: the
passive recorder entered an active memory-pressure episode at 20:58:45 UTC.
At 21:13:49 UTC it reported pressure level 2, paging 45.74 MiB/s and compressor
churn 666.77 MiB/s. Its existing watcher was confirmed alive; no peer workload
was stopped or restarted. This later episode does not prove the watchdog cause.

## Sixth pass: background context and cross-display evidence

Resumed October 8 at 20:01 UTC under the existing production interval. Installed
production remains untouched; signed isolated build 17b8543c1052 was used.

| Gate | Actual result | Limit |
| --- | --- | --- |
| Single background window producer | 113 assertions passed: blocked query, one stall gap, retained unfinished slot, rejected old-generation result, fresh recovery and unavailable-query gap. Window discovery now runs on a utility queue rather than the listener run loop. | Synthetic discovery faults; no claim of terminating an uncooperative Quartz producer. |
| Live offload/subscriber lifecycle | 1,119 main context refreshes averaged 2.202 ms, max 7.633 ms. Background window queries averaged 1.885 ms, max 14.063 ms. Zero input queue overflow; listener returned inactive with zero subscribers after both takes. | Component wall cost, not CPU attribution or guaranteed input latency. Earlier measured foreground enumeration mean was 11.663 ms. |
| Retina/external/return geometry | Real owned AX actions moved the fixture from display 1 (scale 2) to display 5 (scale 1, negative global origin), then back. Four actual encoded marker PNGs matched their own geometry-segment transforms with zero edge error. Encoded canvas stayed 1400×964 while external content used 1× pixels. | Authored fixture only. Input position remains unqualified; idle callbacks with absent geometry stay null. |
| Delivered events across displays | 24/24 delivered key/modifier events matched retained events by type/code and exact original event timestamp. Source/handler clocks stay separate. | This provider/fixture, not physical-input latency or sleep-safe global clock equivalence. |
| Source/mux timing | 8,315 cross-display samples and 2,618 secure-field take samples matched journal timestamps exactly. Both journals closed with zero lost rows and zero reported encoder drops. | Accepted callback ledger, not an OS source-drop measurement. |
| Secure-field behavior | Owned NSSecureTextField received synthetic keys; all 16 delivered key/modifier events were retained and the global protected-input flag stayed false. | A secure field alone did not exercise global suppression for this provider. Protected-input canary and explicit omission/recovery checks are next; listener health is not complete coverage. |

Private gates-v6 contains frozen sources, compile/test output, both take manifests,
exact packet proofs, key correspondence, source PNGs and sampled status. The
pixel verifier now selects frames from their actual geometry segment and skips
absent transforms; it no longer borrows a later segment to validate an earlier one.

## Sixth-pass follow-up: protected input and real desktop loss

| Gate | Actual result | Limit |
| --- | --- | --- |
| Protected input and recovery | Signed build 93b7f82505a9: the owned fixture requested Carbon protected input for 9.756 seconds. Recorder observed enabled/ended gaps. All 24 fixture-delivered events during that protected interval were omitted; all six post-protection events matched exactly. 139 input/action/numeric assertions passed. | NSSecureTextField alone did not enable this global flag for the tested injected provider. Protected input is not inferred from a field's appearance. Extra concurrent input reached the foreground fixture; actor ownership remains unknown. |
| Actual desktop discontinuity | At 20:16:53 UTC, loginwindow logged direct logout reason WindowServerExited; WindowServer PID changed 401→98864 and GUI processes recovered. The cause of the exit is unknown. Chrome take failed after target loss. | This was observed, not induced. No user workflow or global desktop service was restarted by this qualification. |
| Partial video vs journal | Failed Chrome take decoded 1,197 frames over 42.022671 seconds. Journal had 1,210 accepted writer submissions and no row loss; the 13 missing muxed packets made the proof fail. | Closed source metadata is not a successfully finalized video or measured muxed coverage. Failed proof remains saved. |
| SDK quarantine after desktop loss | Surviving isolated engine's fresh discovery exceeded its three-second deadline, then retained its unfinished slot. Next call refused in 0.448 ms; status and action recovery still worked. Old action expired with declared-scope end, not successful UI completion. | Actual SDK discovery remained unfinished. Only the idle task-owned process was replaced; no peer take or production engine was stopped. |
| Fresh-process recovery | Signed new source build 47ba5460519f discovered the recovered desktop and completed a fresh Chrome take. 125 journal assertions preserve video failure independently of journal completeness. Real record.source/footer returned writer_status=2 and successful_finalization=true. | Legacy/unfinished journals return no finalization outcome. Muxed coverage still needs video evidence. |
| Chrome transient pixels | Actual encoded frames show authored HTML sentinel and genuine native context menu with explicit child inclusion, even while target on_screen=false. All 1,732 muxed sample times matched the journal, zero telemetry loss. | Chrome 154.0.8037.98 / build 8037.98, macOS 26.5.1 / 25F80, tested provider/surface only. Automation pointer-like residual remains in footage. Native select/nested overflow/Electron depth remain open. |
| Browser keyboard path | CUA tab operations changed owned DOM text and generated 28 fixture events. No retained keyboard event was addressed to Chrome; 21 extra declared-action candidates were addressed to Codex. | Passive OS telemetry does not prove browser-provider virtual-input coverage. Those action candidates are explicitly uncertain, not the browser's delivered keys. Bracket compact individual operations; an extended qualification series exceeded its 60-second declared block. |

The WindowServer loss also coincided with a 2.092-second main context refresh.
Offloaded window enumeration does not establish a bound on other framework/TCC
reads during a desktop failure. Production latency/resource recommendations must
preserve this limitation. Private gates-v6 retains all failed and recovered
proofs; the root cause of the desktop exit remains unknown.

## Fifth pass: input scope and contextual action blocks

Production remains the original signed engine (PID 840, build cd78c24b652e);
no installed binary, permission or input-lock state changed. This pass used
owned fixtures and isolated signed candidates db6985a8f52a and 99752c4615cf.
Taylor's 24-hour visible-test authorization remains in effect through October
9 at approximately 17:51 UTC. All raw evidence is private in gates-v5.

| Gate | Actual result | Limit |
| --- | --- | --- |
| Scoped native keys | 36/36 AppKit-delivered key/modifier events matched recorder rows by order, type, key code and exact original event timestamp. Every match occurred without fixture foreground. | Current native fixture/CUA provider only; app-level delivery does not identify its input window or prove human/agent ownership. |
| Unrelated app typing | Separately owned app received 40 key events; zero keys addressed to that PID entered the recorded source after the declared action block ended. Outside-scope events contributed counts only (2,047 in the main take). | During a declared block, outside-app modifiers/shortcuts remain explicit candidates; all mode deliberately retains broader ambiguous keys. No guarantee of zero collisions. |
| Pointer/gesture signals | Main source retained movement, click/release, scroll, drag and right-click event types with source/destination/window clues. Queue overflow and journal loss both zero in this bounded run. | Pointer coordinates remain raw/unqualified. The context-menu click did not prove a visible menu in this pass. High-rate overload, other providers and physical input still need qualification. |
| Contextual action and pixels | Recorder stamped typing and an AX marker block. Fixture marker handling fell within its service interval; encoded before/after frames show red to green while another owned app occluded the target. AX changes need no fabricated mouse event. | Sparse visual evidence establishes this effect, not a universal presentation latency bound. Caller result remains unverified until corroborated. |
| Action recovery | Real isolated-engine restart recovered the open token as interrupted with null end time. Wrong caller was rejected; correct caller settled it without inventing an end timestamp. Callback wrapper ran once, stamped a mark, saved/read back a shared imported receipt. | Explicit native-CUA bracketing; no automatic global interception. List inspects newest 4,096 disk files, returns at most 100 and reports truncation/errors; explicit token lookup remains possible. |
| Offline policy and lifecycle | 138 assertions: scope rules, shortcuts, other windows, drag expiry, strict numbers/settings, exact service clocks, caller/session boundaries, expiry, concurrent close, private persistence and retry after failed publication. Nine schedule/extension assertions: 16 overlaps, rejected 17th, extension admission, lead/duration bounds and cancellation. | No input synthesis or SDK capture in these tests. Service stamps are observation times, not exclusive ownership. |
| Public and shared contracts | 14 Node tests passed: capability refusal before dispatch, explicit input settings, scoped action forwarding, wrapper no-replay behavior, imported provenance, restart uncertainty and existing shared-store regression. | Existing clients may need reconnect for new tools; current production engine deliberately rejects unsupported options. |
| Final signed native canary | Candidate 99752c4615cf received 8/8 delivered keys, zero reported input gaps, clean journal closure; five malformed RPCs failed with bad_params while the engine remained healthy. Listener returned inactive with zero subscribers after stop. | Secure-input, revoked grants, forced tap timeout and overload are not live-qualified; failures have explicit gap/status paths. |
| Source timing regression | Main take: 2,671 actual muxed samples; final canary: 573. All 3,244 match journal video times exactly, with zero lost rows. | Original event clocks are retained; normalized input v1 uses recorder reception time. Cross-clock/physical-input and sleep qualification remain open. |
| Context cost observation | Final candidate measured 115 context refreshes, mean 11.66 ms and max 41.50 ms. Raw event timestamp to recorder reception ranged 8.89–37.30 ms in its 8-key canary. | This is a component wall-cost/queue observation, not CPU or latency attribution. Move window enumeration off the listener run loop and benchmark before production recommendations. |

The first delivery comparison assumed a 10 ms handler window and matched only
11 events. That failed proof is retained. Exact original event timestamps and
ordered type/code matching established 36/36; handler lag ranged 0.480–32.982
ms. Do not erase this correction or convert it into a latency guarantee.

Two regression compiles initially failed because the shared checkout changed
while swiftc read it. Final source was frozen to private files; all four affected
suites and the full engine then compiled/passed. Total verified Swift assertions
including the unchanged 50-case deadline suite: 356. The reschedule admission
hole was fixed and tested: extending a take cannot quietly reserve a seventeenth
overlapping slot or bypass the three-hour/seven-day bounds.

Next: remove listener-loop context enumeration, qualify actual event clock and
coordinates across displays, broaden Chrome/Electron app lanes, audit historical
computer-use outcomes structurally, measure motion/insurance costs, then deliver
at a verified idle boundary with rollback and loaded-capability readback. Visual
effect strategies and final composition remain deferred.

## Fourth pass: signed candidate and recovery

The production engine remains unchanged. This pass used an isolated signed
engine, a task-owned native fixture and Taylor's standing visible-test permission.

| Gate | Actual result | Limit |
| --- | --- | --- |
| Shared SDK deadline | 50 assertions: shared producer, canceled waiter, uncooperative producer, fail-fast retries, ignored late success. Discovery/start/screenshot 3-second bounds and retiring-lane admission added. | Synthetic producer faults; not proof of recovering the actual capture service from every SDK stall. |
| Recording state/race handling | 12 assertions against actual recording scheduling/preflight: cancel/stop, eight-second production watchdog, late failures, retained unfinished admission, no peer restart. A failure reason was erased by later persistence; fixed and retested. | No synthetic SDK start seam or encoder-stall claim. Existing encoder-finalization restart behavior remains separate. |
| Signed live capture routing | Candidate cfd6e1f887d2, PID 53662, reused existing Screen Recording access. Native menu present with child inclusion, absent with explicit false. Exclusion resolved current Sky PID 4973. Identical filtered target returned tap; baseline/different explicit options returned independent lanes. | One app/display/configuration; stale-exclusion PID churn and Chrome/Electron depth still need testing. |
| Healthy peer survives failed target | Missing window failed; healthy display-crop take completed with 1,270 written frames, zero reported encoder drops, actual 44.302-second MP4. Scheduled cancellation passed. | Reported encoder drops do not establish every source callback/frame was delivered. |
| Interruption and recovery | Stopped only isolated candidate mid-take, restarted against same state. Take became interrupted. Partial MP4 decoded 292 frames across 10.012 seconds; next 8-second take completed, 228 written frames, zero reported drops. | Plain ffprobe nb_frames said 30 despite 292 decoded frames. Restored manifest counters were stale (1); now identified as checkpoints. Decode footage to establish actual coverage. |
| Source journal candidate | Asynchronous, bounded 64 queued rows/64 MiB per take; private JSONL, source/geometry/encoded frame linkage, exact decimal nanoseconds, declared semantic marks and explicit gaps. 122 overflow/clock/private-file/write/footer assertions passed. | Corrected H.264/Retina HEVC journals matched all 1,337 muxed samples exactly; zero row loss. Three HEVC geometry segments matched encoded pixels within 0.884 px. Cross-display geometry and physical-input timing remain open. No input collector or automatic native action interception claimed. |

Live timing correction: the first 25-second journal take had 716 samples and
zero telemetry loss, but every muxed timestamp differed by -1.643910 ms. A
1 GHz track alone did not fix the separately quantized movie edit-list offset.
Setting both movie and track timescales fixed the next H.264 (336 samples)
and Retina HEVC (1,001 samples) takes. The failed proof remains saved.

Correction: the original recorder already had an eight-second arming watchdog.
Earlier descriptions of all engine startup as unbounded were too broad. The
candidate isolates SDK-start failure from peer restarts, quarantines unfinished
work and bounds discovery/preview waits. Encoder finalization retains its own
15-second watchdog. Actual SDK process recovery remains a separate gate.

Private evidence is in `gates-v4/`: deadline/startup/journal test results,
signed candidate metadata, native source PNGs, filter/tap replies, unavailable
and canceled recording replies, interruption/readback, and recovery capture.
The first candidate was stopped, restarted, exercised and stopped again; its
fixture was closed and viewfinder lanes drained. Production was not restarted.
Final signed journal build 69ba825e0ce1 also passed real MCP readback, interrupted
checkpoint labeling and recovery. Its partial take decoded 759 frames across
26.021 seconds without a journal footer; the descriptor correctly reported
incomplete telemetry and checkpoint counts. A fresh five-second take closed
cleanly, and all 139 muxed samples matched journal timestamps exactly.
All 209 Swift assertions, nine Node tests and four supervisor tests passed.
Owned engines/fixture exited, active jobs and lanes were empty, and private
runtime evidence was copied into gates-v4/runtime-evidence. No new grants or
input lock; production remains the original build cd78c24b652e (PID 840).

## Third pass: background implementation and fault qualification

No focus actions, recording, new grants, Claude inference or delegated model
turns. The installed engine was neither replaced nor restarted. Candidate
code is committed independently of live delivery.

| Gate | Qualified result | Remaining limit |
| --- | --- | --- |
| Capture option source contract | Explicit child-window setting and exact bundle exclusions on display/rect targets; missing apps and unsupported combinations fail. Full Swift candidate build and 25 parse/identity checks passed. | Real SDK filtering, exclusion PID churn and preview tap selection through the production engine still need a live pass. |
| Filter-aware source identity | Recording taps and viewfinder lanes include child configuration, exact bundles and resolved exclusion PIDs. Legacy keys remain unchanged. | A restarted excluded app requires fresh resolution; no universal cursor-cleaning recipe is enabled. |
| Engine capability negotiation | Candidate status advertises target options v1. Two tests, including an isolated socket engine, show the MCP rejects old-engine options before capture, passes explicit false and preserves legacy calls. | Raw socket callers must negotiate support too. Installed old engine does not advertise support. |
| Shared app facts and declared receipts | Four local MCP tools plus standalone CLI. Seven tests cover concurrent writers, atomic publication failure, exact version/expiry/conflicts, private files, exact nanoseconds, session scoping, readback and invalid requests. MCP tests forbid model/transport paths. | Reported observations and caller-claimed ownership; automatic interception and concurrent-user attribution remain open. |
| Persisted baseline learning | Two prior app observations and one prior action block saved in the shared computer-use evidence store and independently read back. Exact app/OS/provider/display keys; seven-day expiry. | Observation times use evidence mtime; versions reconciled after the same-day runs. No automatic model training, success audit or unconditional app guarantee. |
| Qualification startup recovery | Four synthetic tests cover stalled helpers ignoring SIGTERM, partial evidence, concurrent admission, handled supervisor interruption and subsequent successful starts. Private stdout/stderr/outcomes; only owned groups stopped. | Wrapper qualifies helper control only. Engine startup deadlines, root cause, forced supervisor termination, resource budgets and actual stalled-SDK recovery are still open. |

The private unsigned candidate also passed a real socket status/list smoke:
capture-options v1 was advertised, no recordings or warm lanes were present,
and its owned process exited cleanly. No SDK capture or permission request was
made. Initial fixture state exceeded the macOS Unix socket path limit; the
engine rejected it explicitly, and a short isolated state path passed. Failure
and recovery evidence were retained; the temporary runtime state was removed.

The shared store is `/Users/taylor/.local/state/codex-bridge/capability-evidence/`;
its contract is in `src/codex-bridge/CAPABILITY-EVIDENCE.md`. Native consumers
use it directly without self-delegation. Existing MCP processes may require
reconnection to discover new tools. Private test logs, source candidate binary,
option checks and persistence readback live in `gates-v3/` under the same
qualification bundle. No visual composition code was added.

Next delivery gate: bounded live engine qualification of the option/filter/tap
contract, automatic receipts and a dense source journal; then cross-display,
menu readiness/overflow, concurrent user input and realistic redundancy load.
Only focus-taking work needs another agreed production interval. Background
source preparation does not reserve a display or block Taylor's input.

## Second pass: live evidence

Second pass, within an approved 15-minute production interval. These are
qualification helpers and source contracts; the installed recorder has not
been changed or restarted. Visual composition remains deferred.

## Passed in bounded tests

| Gate | Actual evidence | Limit |
| --- | --- | --- |
| Live-stream helper exclusion | Sequential 8-second display-crop streams: baseline retained Sky's software pointer; explicit PID 4973 application exclusion removed it. 459 and 466 frame callbacks; source PNGs inspected. | Opt-in helper only. Do not exclude an application by a stale PID or automatically exclude every overlay. |
| Visible Chrome native menu | Task-created window 5798 was on screen. All four screenshot variants succeeded; isolated child inclusion omitted/preserved the menu as expected. A 10-second child-enabled stream supplied 568 frame callbacks and inspected menu pixels. | One Chrome/OS/provider configuration. Earlier off-Space errors remain a separate failure lane. |
| Native child surfaces in a stream | Display-bound window capture omitted the AppKit menu with inclusion disabled and contained it in later child-enabled source frames. | Enabled stream's sparse frames omitted it through 4.03 seconds and contained it at 5.04 seconds. This is a presence bracket, not exact onset or a proven SDK warmup delay; cause remains open. |
| Action handling to pixels | Move/resize run matched three markers at 8.72–31.79 ms. Longer run matched all 12 markers, 3.18–63.52 ms, median 8.13 ms. | Fixture action-handler timestamps, not physical input or agent dispatch. Sparse source PNG encoding adds probe overhead. No P80 production promise. |
| Geometry through move/resize | 22 actual source PNGs; predicted colored marker edges differed from observed edges by at most 0.884 pixels. Encoded size stayed fixed while content scale changed. | Authored fixture, one display/scale; not cross-display, sleep/wake, arbitrary app or input-coordinate qualification. |
| Broad keyboard delivery with receipts | Left and Shift+Right plus modifiers were retained by destination evidence while target was not foreground. Eight delivered input events; tap remained enabled, no reported gap. Twelve AX marker actions had separate handler evidence. | One declared action-block receipt; source PID is corroboration, not agent identity. No unrelated events occurred in this tap interval, so it does not prove concurrent-user filtering. |
| Source packet prototype | `normalize-source.py` emitted source-relative times, geometry segments, candidate transforms, evidence paths, handler-to-frame joins, receipt and delivery reasons. All 12 joins passed; changed PID rejected. | Private qualification artifact, not an installed MCP contract. Unqualified raw input coordinates are retained but withheld from composition positions. |

The longer stream had 1,110 callbacks, 1,106 complete frames and zero PNG
write errors. These are observed counts, not inferred dropped-frame counts.
SDK status alone must not be used as proof that a requested transient surface
has appeared. A first preview displayed incorrectly; direct PNG inspection
established an absent menu rather than an entirely blank window.

## Findings that change the implementation plan

Three standalone probe processes started together stalled before producing
evidence. A bounded stack sample showed repeated ReplayKit/ScreenCaptureKit
capture-service disconnection callbacks. They were terminated; sequential
retries succeeded. No engine restart was needed. Root cause and whether it
is specific to process startup remain unresolved. Previous dual recordings
inside the engine did succeed, so this is not evidence that all concurrent
capture fails. Add admission control, wall-time startup deadlines, failure
evidence and measured recovery before recommending redundancy. The final
probe now has a wall-time watchdog and at most two pending PNG buffers.

A browser debugging banner and an unrelated tab appeared in the owned Chrome
window during this pass. The fixture tab alone was closed; the shared window
and other tab were preserved. Window creation does not establish perpetual
exclusive ownership. Treat browser UI/layout shifts, provider decorations
and tab changes as disturbances, with source/action provenance. Do not
cancel another workflow's debugging session or close its window in cleanup.

A pointer-like visual in Chrome remained after excluding Sky's application
from a display capture. That rules out this exclusion as a complete fix for
that visual in this observed state. Its owner and exact rendering mechanism
are not established. Separately qualify provider decorations and app content;
do not promise universal cursor removal based on the native helper result.

## Next gates still open

1. Shared versioned facts and declared action blocks now have a tested store.
   Automatic supported action receipts and simultaneous agent/user attribution
   still need qualification.
2. The source candidate now has options, filter-aware tap identities and old-
   engine refusal. Live SDK/preview routing and installation remain pending.
3. Cross-display/scale and sleep/wake synchronization; injected pointer
   coordinate semantics; menu overflow beyond the frame; source handover.
4. Repeat the delayed AppKit menu case and qualify stable daily-app depth
   lanes, including Electron, with recovery and updated version facts.
5. Realistic motion/resource budgets for redundancy. Probe PNG overhead is
   not a production encoder budget; small static clips are insufficient.
6. Turn the demonstrated source packet into the MCP consumer contract with
   source-only verification effort tiers. Final effects/render recipes stay
   in the later composition phase.

## Evidence and cleanup

Private bundle: the existing `capture-qualification-2026-10-08/gates-v2/`
directory under this chat's visualization folder. Key files:
`isolated-retry.json`, `marker-series.json`, `geometry-pixel-proof.json`,
`marker-input.json`, `action-receipt.json`, `source-packet.json`,
`menu-readiness-samples.json`, `chrome-native-stream.json`, and the source PNG
directories. Input logs contain key codes, not characters; unrelated
transcript bodies were not imported into this qualification bundle.

The task-owned native fixture and browser fixture tab were closed; its
loopback server and probes stopped. Other Chrome tabs/windows were preserved.
Final engine/recording/process checks are recorded with the private results.
