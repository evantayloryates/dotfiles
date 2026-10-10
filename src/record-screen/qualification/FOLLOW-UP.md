# Next work and prerequisites

October 10, 2026. This is the implementation brief behind the maintained
checklist, not a claim that the proposed tools are installed. Work state is
independent of historical qualification. Existing source proofs remain useful.

## Desktop status and cooperative global pause — Ready

Build a reading-first panel showing Recording, Pause requested / draining,
Paused, Idle, Queued and Unavailable, plus active take names, queued counts,
what is waiting for a safe boundary and the time of the last successful update.
Do not show stale data as a confident Idle state. Make Pause/Resume prominent.
Prefer a large native desktop widget if practical, backed by a small companion
panel for current detail and errors.

The service owns a durable global gate. Pause atomically closes admission for
all new starts, including previously scheduled starts and other adapters/CLI
clients. Existing work reaches its next declared safe boundary; acknowledge
draining immediately and show Paused only after settlement. Do not terminate a
take mid-write or lock user input. Production agents need a checkpoint protocol
so the gate can stop the whole production workflow, not merely video admission.
If a client never supplies a checkpoint, show that unresolved drain explicitly.

Keep requests submitted while paused queued with stable IDs. Resume releases
eligible work in order within resource limits. An old absolute start/end window
must be rescheduled or confirmed, not silently shortened, discarded or replayed
as a UI action. A pause survives service/adapter restarts; competing callers
cannot bypass it. Queue persistence, idempotency, cancellation and bounded queue
growth are part of the first useful implementation.

Acceptance: two independent clients and CLI obey the same gate; active work
settles without peer interruption; idle pause queues a later request; resume
handles elapsed schedules explicitly; restart preserves state; unavailable or
stale status is unmistakable; no unexpected user-input block occurs.

Apple's [WidgetKit documentation](https://developer.apple.com/documentation/widgetkit)
supports desktop widgets and App Intents for interaction. Its
[refresh model](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)
is system-managed and budgeted. Therefore a widget alone should not promise
instantaneous recording-state visibility: include freshness, service-side
enforcement and a live companion panel. Local packaging/signing and actual
desktop placement still need a targeted feasibility check. This is a design
inference from the platform's documented behavior, not a verified widget build.

## Physical input — Deferred; high attention from Taylor

Environment: one owned native test window, recorder listening, short encoded
take, independent app-delivery witness; no competing automation or focus changes.
This is a standalone test, not a batch mixed with other production tasks.

Taylor: roughly 60–90 seconds of active participation, with a brief ready cue
and simple visible instructions. Move the pointer continuously, click and drag
between two marked targets, press a harmless shortcut, then scroll a trackpad
through start, steady motion, release and momentum. Prepare everything before
asking Taylor to begin; no current request or watcher is being armed.

Ready when Taylor explicitly chooses a focused interval and the fixture is
prepared. Done when delivered input, listener rows, video/frame timing and loss
or scroll-phase diagnostics are compared, gaps are explained and the tested
device/provider scope is recorded. Sparse synthetic input is not a substitute.

## Automation delivery parity — Deferred; uninterrupted sandbox

Environment: a dedicated device/runtime or an agreed long uninterrupted window,
with an owned app/browser oracle and no user input competing for focus. No
hands-on participation is expected once the environment is handed over.

First build the observation mechanism: declare expected action events A/B/C,
capture raw global listener observations before relevance filtering, record
independent app/DOM delivery and outcome, and return matched, bypassed or
undetermined with timestamps, loss/health and clock uncertainty. A missing row
is not automatically a bypass: show whether the listener was healthy, the
observation interval complete and the app actually received the action.

Then compare provider/action variants in both modes: presented user-like input
and quiet backstage preparation. Include provider-generated focus gestures.
Do not use `isTrusted` as proof of physical input. Keep compact results in the
per-app/provider knowledge store; retain raw artifacts privately.

Ready when the uninterrupted environment and independent witnesses are
available. Done when the detector distinguishes a known native positive control,
a known bypass case and an intentionally incomplete/unknown case, then produces
a useful scoped provider baseline. Permission revocation is a separately
arranged disruptive subtest, not a prerequisite for the first baseline.

## Capacity and adaptive allocation — Deferred sandbox; basic awareness now

Use the current measured profiles and admission guards now. Basic host-aware
planning must record current observations, their freshness, proposed work and
the decision/reason so a later retrospective can explain choices. It should
recommend delaying optional backups/expensive readers or shortening future takes
under pressure. Do not silently lower requested fidelity or kill other takes.
Missing measurements are unknown, not spare capacity.

Dedicated pass: control background work, run bounded representative single,
paired and backup workloads, then observe CPU, memory pressure, GPU/encoder,
storage, queue waits and dropped coverage. Tune one useful orchestration policy
with before/after evidence. No requirement for exhaustive capacity certification.

Ready when the sandbox is free of user disruption and its limits are agreed.
Taylor only hands over the environment; no physical input is required. Done
when a measured allocation policy improves the chosen workloads, logs explain
its decisions and requested picture quality remains explicit.

## Per-app learning — normal-use mechanism plus deferred depth pass

The existing shared version-scoped facts and recorder planner are the baseline.
Recorder-specific observations belong there even when discovered outside a
recording task. Capture source choice, popup/cursor behavior, input-path gotchas,
timing confidence, outcome and private evidence reference. Do not equate reports
with independent verification or use unknown versions as matching versions.

Ready improvement: make publishing an observation a small, discoverable part of
the production runbook and repair-ticket outcome, with bounded retrieval. The
new ticket pipeline must reuse these facts rather than grow a competing store.

Deferred depth pass: in a dedicated uninterrupted environment, install needed
test apps within the agreed scope, prepare representative daily-app cases and
collect specific missing versions/behaviors. Ready when that environment exists;
no live participation is needed. Done when the selected apps have useful source
recommendations and gotchas that can be retrieved during planning. This is not
a universal app certification or a gate on local updates.

## Recorder repair tickets, dispatch and ready-for-use signals — Ready

Expose a recorder bug-report MCP tool returning a durable ticket ID immediately.
Accept a bounded symptom, expected/observed outcome, affected build/provider/app,
recording/session/frame identities and private diagnostic references. De-duplicate
equivalent open incidents; capture uncertain outcomes without replaying them.
Route computer-use implementation bugs to that tool's owner, with a recorder
reproduction; do not fold its developer work into the recorder queue.

Ticket lifecycle: reported, triaged, working, patch prepared, delivered, verified,
ready for use (or needs input / cannot reproduce). Distinguish technical progress
from a build that the waiting consumer can actually use. A recorder developer
worker familiar with the runbook takes the ticket, makes a targeted repair,
smoke-checks it, ships at an appropriate safe service boundary and appends a
release-log entry with build identity, limits and verification.

Provide a cheap status/subscription interface keyed by ticket and caller. A
deterministic watcher checks persisted state without model inference and emits
one completion event per subscription/revision after ready-for-use delivery.
The consumer can work elsewhere, wake on that event, inspect the release and
retry explicitly. Handle duplicate delivery, restarts, canceled subscriptions,
unavailable workers and failures; do not emit success for “patch prepared.”

Acceptance: a synthetic incident files once, reaches an actual worker, gets a
verified targeted release and wakes its subscriber once; a second incident that
needs input stays visibly pending and does not send a false ready signal. No
broad regression suite or automatic rollback of unrelated improvements.

## Receipt coverage — Deferred; uninterrupted sandbox, bounded ownership

Use explicit action scopes and typed outcomes now. In a dedicated environment,
exercise provider setup/focus/read paths and compare them against observed input
and recording results. Identify what the recorder can observe and what requires
provider-maintainer instrumentation. Forward dependency fixes to that owner.
Ready when the sandbox and relevant provider versions are available; Taylor
does not need to supply input. Done when selected paths have a clear coverage
contract, explicit unknown side effects and independently checked outcomes.

## Basic cursor/composition recipe — Ready

Start with `/Users/taylor/Desktop/cursor.svg` and one short recorded take. Choose
one restrained cursor/click treatment; declare hotspot, source timing, coordinate
mapping and configurable size/opacity. Render a cheap preview before a final
export, verify alignment at representative moments and retain an editable recipe.
Do not wait for universal app coverage, physical-input tests or advanced animated
backup repair. This brief makes the first composition eligible to start; it
does not select Taylor's final visual style or claim a renderer has shipped.
