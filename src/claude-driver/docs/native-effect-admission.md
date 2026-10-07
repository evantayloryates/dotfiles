# Native effect admission and retry contract

The helper checkpoint and the actual native invocation are separate boundaries.
On October7, request rmuxpt37w-d5e587 returned dispatch:false/cancelled, but the
model invoked the exact requested archive0.588s later. Independent metadata
confirmed the archive. Preserve the original failed report and its erroneous
retrySafe:true observation in `native-late-cleanup-forensics-2026-10-07.json`.
Instructions alone cannot enforce cancellation.

The broker's service-local command PreToolUse hook now checks actual
`mcp__ccd_*` calls. It requires all of:

- Exact native session, directory, PID/start, ancestry and reviewed CLI2.1.289.
- Current immutable template hash and completed wait/check deployment evidence.
- Matching request/index, canonical native arguments, unexpired deadline,
  helper dispatch checkpoint, no cancellation and no STOP.
- Request-recorded installed handler/settings hashes matching current bytes.
- Atomic exclusive consumption of that operation slot before the tool executes.

The admission record contains native tool_use_id, slot, process epoch, build and
generation, without prompt bodies. Duplicate/foreign/cancelled/expired/ambiguous
calls deny. Legacy entries without an index admit only a unique matching slot.
Malformed/oversized PreToolUse input explicitly denies; the installer passes a
fixed event argument so malformed Stop input can end quietly without a loop.
The hook never emits a permission allow decision; platform permission checks
remain binding. This is an accidental model-error guard, not a security boundary
against an owner who can edit their own service files.

Native evidence is scoped: one positive call matched an admission marker to its
actual tool receipt; one cancellation after helper dispatch produced an actual
native PreToolUse denial. Private subprocess tests exercise refusal and concurrent
single consumption. These do not prove every platform hook timeout/runner-fault
path. The native full suite still failed serving after one bounded Stop rescue.

For an enqueued native mutation without a correlated receipt, current error and
inspection state is `outcome_unknown`, with `retrySafe:false`. This applies even
when the helper has no dispatch checkpoint or the request records a gate policy.
`controlState` preserves the actual cancelled/expired bookkeeping. Pure reads
can be repeated; pre-enqueue validation failures can separately establish safe
retry. A recorded policy or missing admission marker alone is not no-effect proof.
Jobs preserve this uncertainty rather than implicitly replaying an operation.

Use native receipts and independent app state to reconcile. Do not manufacture
a completed receipt, overwrite historical control evidence, or treat desired
end state as proof of which earlier attempt caused it. A deliberate owned-fixture
cleanup after fresh readback is a new desired-state action; it never authorizes
replaying an uncertain message. Pending effects prevent a clean deployment handoff.

The host, hook package and active broker dependency package have separate
fingerprints. [resume.md](resume.md) records current exact versions and reports.
Fresh CLI/MCP clients are required; old connected clients do not reload these
guards merely because workspace source changed.

## Platform hook fault contract — verified documentation October7

The [official Claude hook reference](https://code.claude.com/docs/en/hooks#timeouts)
states that a timed-out command PreToolUse hook does not block the tool; normal
permission flow continues. Its exit-code section also documents non-blocking
launch errors and invalid output outside a blocking exit2 decision. Consequently
an installed policy, request cancellation or missing admission marker alone is
not proof that the platform prevented an effect. Preserve unknown/non-retryable
outcomes. This is primary documentation evidence, not a fault-injection test of
our exact bundledCLI2.1.289; that native qualification remains open.
