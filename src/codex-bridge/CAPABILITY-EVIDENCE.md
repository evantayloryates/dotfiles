# Shared computer-use capability evidence

Native agents and bridge consumers share one local store. This module lives
next to the existing service but does not depend on delegation, app grants,
the app-server, a model turn or native UI. The recorder can consume these
facts and receipts without duplicating app knowledge in its own memory.

Default: `/Users/taylor/.local/state/codex-bridge/capability-evidence/`.
`CODEX_BRIDGE_STATE_DIR` redirects state for isolated qualification. Entries
are immutable JSON files: private directories, 0600 files, canonical content
hashes, fsynced temporary files, atomic no-replace publication. Independent
writers append without a shared read-modify-write index. Failed publication
leaves no visible partial entry. Power-loss recovery is not qualified.

## Access

| MCP tool | Contract |
| --- | --- |
| `computer_use_outcome` | Append separate reported verification/cleanup states linked to an existing receipt in the same session. Evidence references required for verified/failed checks and completed/partial cleanup. |
| `computer_use_audit` | Read a bounded typed outcome audit for one explicit session. Uncovered receipts remain unknown; latest claims and conflicting verification history remain separate. Counts are not task success rates. |
| `computer_use_plan` | Plan 1–16 named capabilities for one exact entity. Distinguish missing/expired/conflicting/mixed/unknown observations from reported pass. Caller confirms environment dimensions; no UI canary or automatic success grading. |
| `computer_use_observe` | Append a reported capability observation. Exact app/OS/provider/display/surface/capture scope, evidence references, limits, observation time and expiry are required. |
| `computer_use_facts` | Read one exact entity key, at most 100 entries. Different versions do not inherit results; future observations are withheld and expired observations are omitted by default. Conflicts are preserved. |
| `computer_use_receipt` | Append an agent-declared contextual action block with intended target, recorder host-clock bounds, result and evidence references. |
| `computer_use_receipts` | Read at most 100 receipts for one explicit session. |

New MCP processes advertise these tools. Existing connected clients may need
reconnection for discovery; this change does not restart their transport.
Native Codex consumers use the evidence tools or standalone CLI directly,
never delegate a model turn to operate themselves.

```sh
node /Users/taylor/src/github/dotfiles/src/codex-bridge/evidence.mjs fact /absolute/observation.json
node /Users/taylor/src/github/dotfiles/src/codex-bridge/evidence.mjs facts /absolute/entity.json
node /Users/taylor/src/github/dotfiles/src/codex-bridge/evidence.mjs plan /absolute/plan-request.json
node /Users/taylor/src/github/dotfiles/src/codex-bridge/evidence.mjs receipt /absolute/receipt.json
node /Users/taylor/src/github/dotfiles/src/codex-bridge/evidence.mjs receipts SESSION_ID
node /Users/taylor/src/github/dotfiles/src/codex-bridge/evidence.mjs outcome /absolute/outcome.json
node /Users/taylor/src/github/dotfiles/src/codex-bridge/evidence.mjs audit SESSION_ID
```

Use `facts ENTITY.json --expired` to inspect stale observations explicitly.
The schema and runtime validation are in `lib/evidence-tools.mjs` and
`lib/capability-evidence.mjs`. Unknown fields and malformed queries are
rejected even though the small shared MCP server does not validate schemas.
Evidence paths are local references; the service does not fetch their content.
Avoid literal keystrokes, transcripts or arbitrary tool arguments in entries.

Entity dimensions: `bundle_id`, `app_version`, `app_build`, `os_build`,
`provider`, `provider_version`, `surface`, `capture_mode`, `display_profile`.
Use a precise capture-mode value including relevant options. Unknown version
facts must remain explicitly unknown and must not become reusable guarantees.

## Baseline planning and requalification

For a newly encountered or changed app, query the shared lane before running
the requested actions. A plan request contains `entity`, `capabilities` and
`environment_verified` (boolean). Capabilities are caller-selected names such
as native readiness, shortcuts, menu overflow, pointer delivery and cleanup;
the planner does not interpret arbitrary prose or choose visual effects.
Match names to existing observations when reusing a lane. Include the recorder
build/options in `capture_mode` when they affect the tested capture behavior.

Set `environment_verified:false` if any app/provider version, display profile
or surface scope is unknown. The flag is caller-reported; this tool does not
inspect installed apps or certify the caller's claim. Exact app/OS/provider/
display/capture changes lead to a new bucket and missing-evidence baseline.
Current plans advertise `environment_policy_version:1`, retain the caller flag
as `environment_claimed_verified`, and return an effective `environment_verified`.
An explicit dimension value `unknown`, `unavailable`, `unspecified`, `unverified`
or `not_available` always forces that effective value false, even when the caller
sets true. Matching ignores case and surrounding whitespace for these reserved
sentinels only; it does not normalize entity buckets or interpret arbitrary prose.
`unknown_dimensions` names the affected fields and checks keep the passing facts
visible while blocking reuse and expiry promotion. Other named values remain
caller-reported, not independently verified. Old loaded processes may lack this
policy; read back the policy marker or use the current CLI without restarting peers.
Expiry requires a refresh canary; conflicting results require a targeted
boundary check. A current reported pass can become a scoped reuse candidate
only with confirmed environment and complete observation-window coverage.
Its earliest contributing expiry is returned as `not_after`. Workspace,
visibility, permission or helper identity changes can still invalidate current
readiness: respect the evidence's limits and verify the relevant surface.

Planning is read-only and appends no synthetic success. It scans at most 1000
regular files of 64 KiB per exact entity, validates each observation, evaluates
at most 100 non-future observations and returns at most five evidence summaries
per capability. A truncated observation window disables all reuse candidates;
an oversized bucket/file, symlink or corrupt entry refuses planning. Conflicts
outside the returned window must never disappear into an apparent latest pass.
Evidence paths are references only; their contents are not fetched or graded.

Retained-history audits must keep execution and verification denominators
separate. Stage63 inspected all246 saved bridge reports/event logs and all140
typed receipts across35 sessions. Bridge turn completion did not carry typed
verification or cleanup, and exact session keys did not overlap the newer store.
Do not infer app success, cleanup or native-provider adoption from those counts,
final prose, file modification dates or a shared caller/provider name.

Later cleanup can be appended against the same immutable receipt after exact
session/process readback. Preserve earlier partial outcomes and state explicitly
when the prior verification object is carried forward rather than re-executed.
Four such settlements and one retrospective source-metadata outcome now leave
zero uncovered receipts; one cleanup remains unknown. The old incorrect verified
claim/missing reference and its failed correction remain intact. An existing
reference path alone would not validate its contents. See record-screen
qualification/GATES.md stage63 for exact scope.

Verify executable identity as well as PID before touching a retained helper.
Stage63's old fixture PID66754 belonged to a later live computer-use runtime;
it was left intact. Do not treat PID presence as proof that the original helper
survives, or use another live process to claim its historical cleanup.

Use the result to choose the next narrow check, then append a reported outcome
with limits and evidence references through `computer_use_observe`. This same
feedback path works for ordinary computer use without recording. Capture facts
stay in this shared capability service rather than a second recorder catalog.
No watcher, scheduled canary, model training or automatic native-provider hook
is implied. Existing MCP processes keep their loaded tool roster until their
next safe launch; the CLI is immediately available without restarting peers.

## Typed verification and cleanup

An outcome names `session_id`, the persisted `receipt_id`, `observed_at`,
`verification` and `cleanup`, with optional contextual blocks. Verification
contains `state` (verified/failed/not_checked/unknown), `method`, `summary` and
`evidence_refs`. Cleanup contains `state` (completed/partial/not_required/unknown),
`summary` and `evidence_refs`. Verified/failed verification and completed/partial
cleanup need nonempty absolute evidence references; contents are not fetched.
Optional `context` supports expected_outcome, observed_state and cleanup_plan.
Keep raw inputs, tool output bodies and secrets out of these summaries.

The immutable outcome inherits caller, provider, target, result and exact clock
bounds from the linked receipt; the caller cannot replace those through an
outcome. Ownership and reported results remain unverified. The entire outcome
payload must fit 64,000 UTF-8 bytes before publication. A missing receipt or
wrong session refuses publication. Reporting a revised outcome appends another
entry rather than erasing prior failure or partial cleanup.

The audit scans at most 1000 regular 64KiB files per receipt/outcome bucket,
evaluates at most 100 receipts and 100 non-future outcomes, and returns at most
100 detail rows (default 20). It validates outcome/receipt agreement and makes
truncation, future withholding and uncovered receipts explicit. A receipt that
claims delivered or verified still has unknown verification/cleanup without a
typed outcome. Latest verification and prior conflicting verified/failed states
remain distinct; older history outside the window may be unknown. This audit
measures persisted reported observations only, not every UI action, authenticated
agent identity, evidence truth or historical task success.

`src/record-screen/lib/recorded-workflow.mjs:withRecordedWorkflow` is the supported
explicit callback path. It requires an evidence store, dispatches the operation
once and defaults the receipt result to dispatched. It closes the recorder scope
before potentially long verify/cleanup callbacks. Hooks run only after known begin;
supplied cleanup is attempted once even after operation/verification failure.
Missing or invalid proof becomes unknown rather than success. Callback errors
remain in the calling process; stored summaries are generic. Missing terminal
reply prevents stamp/outcome fabrication. Receipt or publication failure never
replays the operation. Native CUA still needs explicit calls/bracketing; this
helper does not intercept its API or authorize UI/cleanup beyond the task scope.

Receipt bounds are unsigned decimal strings, preserving nanoseconds above
JavaScript's integer precision. Only the recorder's `CLOCK_UPTIME_RAW` domain
is accepted here; callers must sample that qualified clock, not label wall
time or another clock as equivalent. `intent` supports rich context blocks.
A receipt is `caller_claimed`, with ownership explicitly unverified. Combine
it with destination evidence, app/window lifetimes and captured pixels.
Matching time, focus or source PID does not establish exclusive agent identity.
A missing end bound or interrupted action should not be fabricated as success.

## Learning and delivery limits

October 8 seeded two bounded observations (helper exclusion and visible
Chrome native menu) plus the existing declared qualification action block,
then independently read all three back. Observation times use evidence-file
mtime; app/provider versions were reconciled after those same-day tests.
Expiry is seven days. This is explicit evidence accumulation, not automatic
success grading or model training. Capture strategy selection and canaries
must continue to qualify changed versions and uncertain surfaces.

Recorder-stamped action blocks and a supported callback wrapper now have bounded
native smoke evidence. Other-provider attribution, outcome observation and
historical workflow success auditing remain open. This
module does not intercept native CUA or infer ownership from bridge logs.

## Qualification

```sh
node --test /Users/taylor/src/github/dotfiles/src/codex-bridge/scripts/capability-plan.test.mjs /Users/taylor/src/github/dotfiles/src/codex-bridge/scripts/evidence.test.mjs /Users/taylor/src/github/dotfiles/src/codex-bridge/scripts/evidence-mcp.test.mjs
```

Seven tests cover strict validation, exact-version/expiry/conflict behavior,
session isolation, exact nanoseconds, idempotency with reordered fields,
failed publication, corruption detection, four concurrent writers, MCP
readback/error shapes and target schema discovery. Protocol tests forbid all
child spawning and network connections inside server processes. They do not
invoke bridge status/preflight or delegated computer use.

Six additional planner tests qualify changed environment buckets, expiry/future
claims, conflict/unknown handling, withheld reuse for unconfirmed dimensions,
an older failure beyond the response window, bounded scan/file/symlink refusal,
strict requests and immutable readback. The fresh guarded MCP advertises five
evidence tools and reads plans without model/transport paths. October 9 live
CLI/shared-store readback kept prior Chrome readiness unknown and three native
fixture outcomes separate; both recorder action outcomes were imported exactly.
This establishes explicit evidence feedback and planning, not automatic outcome
auditing of historical opaque UI tool results.

October 9 typed workflow qualification adds four outcome and six callback tests;
with prior planner/store/protocol and legacy callback checks, 28 tests pass.
Fresh guarded MCP advertises seven evidence tools. Actual installed readback
through the new wrapper reused byte-identical 307-sample media/source proof,
closed its own action before verification, and recorded scoped completed cleanup.
Two earlier native episodes were explicitly reported from retained evidence:
one readiness failure and one pixel check pass, both with partial cleanup while
their fixture/session await the input-grant canary. CLI audit read back all three.
The broader historical CUA corpus still lacks this typed coverage; its call
counts and opaque bodies have not been promoted to a success audit.

## Recorder reply import and shared native policy

Native consumers can import an already settled recorder reply without writing
a Node wrapper:

```sh
node /Users/taylor/src/github/dotfiles/src/codex-bridge/evidence.mjs recorded-action /absolute/private/action-end.json
node /Users/taylor/src/github/dotfiles/src/codex-bridge/evidence.mjs outcome /absolute/private/outcome.json
node /Users/taylor/src/github/dotfiles/src/codex-bridge/evidence.mjs audit EXPLICIT_SESSION_ID
```

The first command returns the immutable receipt ID for the outcome's
`receipt_id`. It imports the full terminal reply as received, preserving exact
service stamps, context and null end bounds for restart interruption. Active
replies refuse. Reimporting identical replies returns the same ID; a storage
failure never warrants repeating the UI operation. Read back receipts/audit
before claiming publication. These commands do not drive UI or connect to the
app-server. The MCP manual receipt schema remains separate from reply import.

CLI JSON request/reply files must be regular, non-symlink, valid UTF-8 JSON and
at most 64,000 bytes, including files that grow while being read. Input errors
never echo the file's body. Keep authored compact requests and summaries in
those files; bulk source rows, screenshots, credentials and raw tool bodies
belong in their existing private stores. Three CLI integration checks cover
exact/imported clocks and idempotency, unknown restart bounds/active refusal,
and malformed/oversized/symlink/non-file refusal without publication.

The recorder exposes action_begin/end/scopes with exact service times and rich
context, gated by action_scopes v1. Supported callbacks use
`src/record-screen/lib/recorded-action.mjs:withRecordedAction`; native CUA remains
explicitly bracketed. Receipt failure never triggers UI replay. `EvidenceStore`
can `putRecordedAction(reply)` after terminal settlement, preserving null ends
for engine-restart interruption. Imported provenance is recorder_reply_imported:
the clock claim is preserved, not authenticated, and caller/result ownership
remains unverified. Manual receipt tools keep their original strict v1 shape.

Mechanical scope rules live in native/InteractionScope.swift and are compiled
into the recorder. They retain broad app-delivered keys, bounded shortcut/action
candidates, drag continuity and differentiated window clues without text. The
store does not start this listener, read raw source packets or classify human
text. Current proof: 36/36 native keys despite non-foreground delivery; 40 separate-
app keys excluded after block closure; eight final keys matched; scope restart
kept end time unknown. See record-screen/qualification/GATES.md for limits.

Fourteenth-pass native qualification appended a scoped Chrome native-select
readiness observation and independently verified its exact entity/value/ID.
The result and input-backend version remain unknown, with one-day expiry. An
isolated fixture was capturable despite display occlusion and failed native
coordinate delivery. Do not convert this observation into universal Chrome
failure or a reusable success guarantee; keep surface, capture and workspace
conditions attached. The recorder report embeds no unrelated display content.
