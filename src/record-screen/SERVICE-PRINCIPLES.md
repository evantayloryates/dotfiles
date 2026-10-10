# Record-screen first principles

These directives govern new recorder tools, changes to existing tools and agent
production plans. They describe design priorities, not claims that every proposed
capability is already implemented. The checklist separates Ready work from the
delivered baseline.

## Timing parity is a core deliverable

Own timing joins inside the service, as close to capture as possible. Pursue
approximately 1 ms alignment across events, action context, source frames and
derived outputs where the source supports it. An explicitly measured 1–10 ms
range is useful. Keep finer precision when readily available; do not reject a
valuable capability merely because sub-millisecond or 1 ms alignment is
unavailable. Report the achieved bound and its basis instead of inventing parity.

Preserve exact integer/rational source timestamps; round only for display.
Distinguish action request, actual input delivery, listener reception, source
content, encoded presentation and wall time. Record clock domain, process/epoch,
calibration, uncertainty, gaps and source/frame identity. Unknown timing remains
unknown. Millisecond timestamp resolution is not millisecond accuracy.

At 30 fps, successive pictures are about 33 ms apart. A precise event timestamp
can identify the appropriate recorded frame; it cannot supply an intermediate
picture that was never captured. App reaction latency, clock offset, held source
age and separately captured streams are different issues. Two close timestamps
do not prove that two streams contain the same app paint. Consumers should use
service-owned joins and returned actual frame identities, not implement their own
clock conversion or assume a requested preview time was returned exactly.

## Rich evidence; director-owned selection

Retain broad delivered shortcuts, pointer/gesture transitions and rich semantic
action blocks. Provide bounded queries, summaries, interval/type/action filters
and private artifacts so richness does not flood an agent's context. Preserve
original rows and uncertainty. Relevance filtering should be reversible.

The driving agent knows the request and production plan and chooses pertinent
events. The recorder supplies timing, delivery, target and contextual evidence;
it must not claim authenticated user/agent ownership from focus, source PID,
trusted-event flags or an action tag. A dedicated device is the medium-term
direction; exhaustive separation of concurrent human activity is not a release
requirement. Physical-device density remains a separate hands-on test.

## Learn from ordinary use, with intentional active probes

Every useful observation can improve app-specific recording knowledge. Persist
compact, version-scoped findings, gotchas, successful source choices and failures
with evidence references. Reuse the existing shared fact store; do not create a
parallel app-certification database. Unknown versions, conflicting evidence and
stale facts remain visible. New observations inform decisions without requiring
full app requalification before every local release.

An active probe is a temporary, explicit focus, not a permanent release gate.
Record its question, natural trigger, smallest useful evidence, owner and
retirement condition. Capture an opportunity during authorized work without
derailing the user's task. Do not manufacture repeated fixture runs to substitute
for a missing real-world case. Raw footage, literal inputs and sensitive app
content stay private; save compact pointers and facts.

Current probe: **genuine menu overflow and changing isolated-window fitting**.
When a real menu extends above/below its parent or changes the capture scale or
origin, preserve a short high-fidelity interval, exact input/action/frame clocks,
window/display geometry and app/OS/provider versions. Record whether the menu
actually appears in each source. Preserve a concurrent backup only when already
authorized and resource-appropriate; otherwise mark the gap. Seek changing and
closing states as well as the open menu. Save a replayable/private sample for a
later dedicated improvement pass. Use the qualified app/display fallback now;
do not relax fitted-origin refusal guards to obtain a positive result. Retire or
revise this probe once representative overflow evidence resolves the question.

## Presented actions and backstage preparation are different choices

For actions the audience should see, prefer a qualified input path that behaves
like the corresponding user input and verify what the app and system listener
actually received. Some automation intentionally bypasses system input for quiet
preparation. Neither provider acknowledgment nor DOM `isTrusted` establishes
system-wide delivery. Ask for the intended presentation mode, record expected
versus observed delivery, and preserve page-level evidence separately. Do not
fabricate global events to make a silent action look like physical input.

The dedicated provider-coverage task first builds a mechanism to answer: “We
expected A/B/C system events; did the listener observe them, or did this method
bypass it?” Only then expand the provider matrix. See the checklist's deferred
test with its uninterrupted-environment prerequisite.

## Fast local shipping and explicit repair

Prefer scoped smoke checks, quick delivery, real use and quick fixes over broad
update-blocking test matrices. Preserve measured limits and failures. Collect
diagnostics during normal use and repair the demonstrated problem without
rerunning unrelated settled phases. Never silently replay an uncertain mutation.

The proposed ticket/report, developer dispatch, release log and subscriber
completion signal are Ready implementation work, not available MCP tools yet.
A repair must identify the delivered build, its targeted verification and when
it is actually usable. “Patch prepared” is not “released”; a waiting consumer
should receive a ready-for-use signal and verify its retry. See the follow-up
brief. Checks should support rapid repairs, not become universal release gates.

## Recorder and computer-use ownership

Computer use is a tool dependency with its own maintainers and repair lifecycle.
Recorder agents specify intended action, presentation mode, timing/context and
observable outcome, then inspect the actual result. They learn how to use that
tool for recording and report reproducible dependency bugs to its owner.
They do not take over computer-use internals or historical workflow audits as
recorder release requirements. Shared facts/receipts are a bounded interface,
not a reason to couple the services' implementations or developer queues.

## User visibility and cooperative pause

A future desktop status panel/widget will expose a global, persistent
“please reach a safe pause point” gate and resume control. It must close
admission to new recording work immediately when a pause is requested, allow
current work to settle safely, show what is still draining, and queue later
requests without starting them. This is not an emergency stop or an input lock.
The authoritative gate belongs in the service, across every adapter and CLI.
The widget is a view/controller, not the enforcement boundary.

Sleep/wake qualification is deferred by Taylor. Normal production assumes an
awake Mac, with the existing gap detection retained. This assumption does not
turn untested sleep behavior into a pass. The status panel and gate are Ready
work and must not be advertised as installed until implemented and verified.

## Basic resource awareness before broad capacity work

Keep measured profiles, current load/admission observations, decisions and
diagnostics inspectable. Prefer conservative optional-work choices and shorter
takes when resources are constrained; do not silently sacrifice the requested
picture quality or stop unrelated recordings. Avoid inventing capacity from
configured slots. Distinguish admission guards from adaptive host awareness.
The dedicated sandbox task can later establish better CPU/memory/GPU/storage
budgets; normal operation should already retain useful retrospective evidence.
