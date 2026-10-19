# Recovery when both independent controllers are absent

The surviving-standby recovery route does not cover app quit or simultaneous loss
of both actors. `broker_service_pair_bootstrap_plan` is the read-only admission
boundary for that case. The experimental executor is implemented below; native outage qualification remains pending.

The caller supplies the exact primary session and current standby enrollment
SHA256. The planner reads only that retained pair. A live peer for either actor
returns wait; it must never be stopped to make bootstrap eligible. Otherwise both
old OS PIDs must be absent (PID reuse refuses), and no peer with either host ID may
exist. Recheck absence, selectors and enrollment after offline review.

Both records must remain registered, importable, owned bypass scratch actors with
no worktree or PR. Both sealed generations must be installed, independently
reviewed offline, terminal with zero unknown effects, and without STOP. Intentional
STOP is preserved. Primary metadata target and standby archive target must refer
to this exact pair; policy/grants/settings/anchor and retained empty-family receipt
must agree. Deleted/moved/foreign records and third-actor targets refuse. Missing
PID is not a crash diagnosis. This planner classifies the cause as unclassified.

A prepare result establishes only prerequisites for a future durable transaction.
It explicitly does not authorize import, process startup, serving, or replay.
Records' account-store identities must be captured in that transaction before any
effect and checked through all later steps; the legacy standby enrollment does not
contain a historical account-store hash.

## Installed mechanism evidence

Current installed app2.42304.0 has session-manager member
`.vite/build/index.chunk-CFJssAFf.js`, SHA256
`abff2bf8cd6fa8d3d18964636ebaa6034e93997a9eea16a8802eaec0f759c9b7`.
The existing-import branch delegates to unarchive. The extracted unarchive method
returns immediately for an already-active record; for an archived record it saves
metadata and requests warm-lifecycle registration. Warm lifecycle and later view
navigation may cause downstream startup, but neither import return nor unarchive
return proves a new native process or readiness.

`node scripts/native-resume-contract-v2.mjs` evaluates only this reviewed extracted
method against synthetic records and stubbed dependencies. It never executes the
whole bundle or contacts the app. Exact source hash guards drift. The source
reader defaults to2MiB; this named member uses an explicit3MiB bound, with an8MiB
hard ceiling. See runtime pressure reports for exact results and limitations.

## Experimental durable executor

`broker_service_bootstrap_pair` requires `driver_submit`, exact primary `session`,
`expected_enrollment_sha256` and `experimental:true`. Use a whole-operation job
budget (for example timeout_sec360), then reattach the original job. It is not
automatically invoked by ordinary routing. Its completed result deliberately
leaves unattendedBootstrapQualified=false until native outage qualification.

The implemented transaction has stable child submission keys, retained actual
scheduler IDs, and before/after checkpoints:

1. Capture exact plan, enrollment digest, record/account identities, source,
   versions, grants and stable-settings baseline. Recheck before every effect.
2. Quiesce/retire only the two independently absent old generations using existing
   offline operations. Bootstrap uses require_new_stop:true: any existing
   quiescence intent/STOP refuses, even if it belongs to this generation. Never
   clear a prior unrelated STOP or uncertain history.
3. Attempt each exact existing import at most once. Record publication before
   dispatch and reconcile uncertainty. No generic wake, keyboard injection,
   permission/auth changes, new session or retries to bypass a native trust gate.
4. Independently observe both new native host identities and bounded startup
   evidence. Import metadata alone is insufficient. If no process starts, retain
   the root for a changed-condition continuation; do not loop or invent success.
5. Restore both exact roles against the newly verified counterpart epochs. A
   controlled proof must relate each new target epoch to this root's original
   pair and absence/import evidence. Do not silently drop roles or widen grants.
6. Prepare/activate through existing stable-hook operations. Independently verify
   current settings/anchor, native readiness, policy and one causal native read.
7. Obtain a fresh empty-family receipt and CAS-rebind the pair, retaining old
   binding bytes. Rebind the existing fixed scratch metadata index when enrolled
   and independently verify it against the new counterpart epoch. Ordinary
   management enrollment retains the same controller identity and selects the
   current generation. Qualification is incomplete until public routing and all
   bindings are current and no unknown effects remain.

Test the transaction synthetically before any disruptive native test. Later use a
single representative authorized outage at an integrated gate. Repeated scratch
cycles and historical surviving-standby passes do not prove this case. Workspace
trust/hot-reload/person-only consent remains a real platform gate; preserve it and
record human-assisted recovery separately from unattended proof.


Failed import/startup is intentionally not retried. A terminal failed root at
`before-import-primary` or `before-import-standby` can now use the explicit
`broker_service_continue_pair_bootstrap` operation. Obtain its immutable root hash
from `broker_service_pair_bootstrap_status`. The continuation requires that hash,
old enrollment digest, original root job ID, exact primary and experimental opt-in.
It must itself run as a new durable job.

Admission re-reads the failed parent and original completed quiesce/retire jobs,
retired native histories/owned STOP, account identities, selectors, policy/grants,
public metadata enrollment and current epochs. Every already-attempted import must
now have an independently verified native idle epoch. The original failure stays
unchanged; new observations live only in the continuation. A previously verified
import epoch must remain identical. An unattempted second actor must remain absent
and may be imported once. No attempted import, quiescence or retirement is replayed.
Continuation chains retain original attempt timestamps and exact parent links;
cancelled, running, worker-lost/unknown, later-effect or changed roots refuse.

Claims serialize continuation of an original root. An active/effectful/uncertain
owner is reattached, never replaced. A terminal failed owner can release its claim
only if `newEffectsStarted:false`, children/import intents are unchanged from the
original and no later results exist. Retain the old claim bytes before CAS to a
new owner; never delete the audit. Set the publication flag before any new child
submission or import intent. This avoids consuming the recovery path when a guard
fails before any new effects. Native qualification and automatic public-route
integration remain pending.

Synthetic transaction failure coverage exercises every before/after boundary,
failed effect, unqualified result and changed guard. Pair CAS additionally requires
original completed prepare/retire/activate child observations and exact new roles,
epochs and family. Current live entrypoint refusal was verified without creating a
bootstrap ledger or altering the live pair; see docs/resume.md for evidence.
