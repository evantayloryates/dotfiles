# Claude-driver staging handoff — October 7, 2026

This is an effective staging checkpoint, not full v2 completion or production
qualification. Source fixes and bounded zero-inference checks pass. The consented
broker remains alive on PID71262, sealed build4af08654; current serving evidence
is unverified. No inference was requested. Quota exhausted is operator-reported,
not an autonomous provider probe. No free/local inference fallback is verified.

## Storage and debug retirement

All driver-owned live state, logs, releases, pressure artifacts and service memory
are physically in `/Users/taylor/src/github/dotfiles/src/claude-driver/.runtime/state`.
Reports are in `/Users/taylor/src/github/dotfiles/src/claude-driver/.runtime/reports`.
The Desktop temp_reports directory was moved, 39 file hashes verified; no Desktop
link remains. Private runtime contents are Git-ignored. Migration and debug
retirement manifests reside in `.runtime`, including original hashes.

The old ~/.local/state/claude-driver path is a compatibility symlink to the new
state directory. Existing consented native cwd, sealed releases and historical
admission references remain byte-identical. Do not delete the link before safe
runtime handoff. This is a physical storage migration, not a broker epoch change.
Claude's own session records, sockets, app logs and host-required registration
paths remain managed by Claude; these are not duplicated driver-owned stores.

The launchd debug detector was booted out and its plist archived locally. Five
fixed native debug modules were moved out of the watched session mod directory,
with full file hashes verified. General native unload remains unqualified.
Historical candidate sources containing Desktop paths are retained for evidence
and must not be installed or invoked; new report scanner/detector/review commands
use the collocated inbox. The Codex watcher was updated to the new report path.
The inference-bearing Claude observer cannot receive revised instructions while
quota is exhausted; its existing recovery policy is not changed by this handoff.
If it resumes, update its report destination before using it again.

## Built-in diagnostic support

Shared CLI/MCP operation `service_health` captures fixed health metadata without
inference. Operation failures also attempt this capture without masking the
original error. Retain latest32 health snapshots; do not capture raw transcript,
arguments, tool result, token or exception text. Use
`node /Users/taylor/src/github/dotfiles/src/claude-driver/scripts/service-diagnostics.mjs`
for a standalone snapshot. `--quota-exhausted` explicitly attributes quota status
to the operator. Default inference status is unknown, never assumed available.
Liveness and runtime integrity cannot authorize sidecar dispatch. Health captures
are historical observations, not leases or positive tool-execution receipts.

## Outstanding implementation and qualification

| Outstanding item | Required evidence or implementation |
| --- | --- |
| Persistent production serving/queue ownership | Current owned native receiver, concurrent clients, bounded lifecycle and independent receipts; existing short read trials are insufficient |
| General native unload | Receiver/environment absence and resource disposal; command removal and one owned child termination do not prove it |
| Executing-effect cancellation/steering | Independently correlated no-effect or actual outcome settlement; never infer from missing result or cancellation flag |
| Guarded mutation | Positive and negative current native admission plus persisted target readback and fixture restoration |
| Runtime handoff | Reconcile 17 historical uncertain effects, satisfy handoff gates, deploy retained per-request checkpoints without replay |
| Installed cross-harness transport | Loaded connector uses final source; fresh stdio tests do not qualify the already-running connector |
| Residency/governor/cold recovery | Sustained observations, exact termination attribution and verified recovery; no duplicate observer wake |
| Distinct-build rollback | Separate qualified build and preserved ownership/effect history |
| Quota-aware inference operation | Restore actual inference availability and verify a bounded request; native callbacks are not inference fallback |
| Remove logical legacy path | Safe new broker epoch using collocated cwd after handoff; compatibility link currently required |
| Observer destination | Update the inert Claude observer when it can receive instructions; do not recreate Desktop reports |

These remain real work. Do not announce full production release or close the goal
on the basis of this staging checkpoint. No user prompt or consent is requested
now. Production activation must preserve permissions, historical uncertainty and
owned runtime guards.

Validation: service-health tests pass; full current-source pressure
v2-2026-10-07T17-47-23-304Z passes1/1 in9161ms/sourceChanged:false.
Moved reports preserve the five pending hashes and acknowledgement history.
