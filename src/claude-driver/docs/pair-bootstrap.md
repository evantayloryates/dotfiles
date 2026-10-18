# Recovery when both independent controllers are absent

The surviving-standby recovery route does not cover app quit or simultaneous loss
of both actors. `broker_service_pair_bootstrap_plan` is the read-only admission
boundary for that case. It is not yet a bootstrap executor.

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

## Executor still required

Implement one durable root with stable child IDs and before/after checkpoints:

1. Capture exact plan, enrollment digest, record/account identities, source,
   versions, grants and stable-settings baseline. Recheck before every effect.
2. Quiesce/retire only the two independently absent old generations using existing
   offline operations. Never clear a prior unrelated STOP or uncertain history.
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
   binding bytes. Qualification is incomplete until public ordinary routing uses
   the new generation, and no unknown effects remain.

Test the transaction synthetically before any disruptive native test. Later use a
single representative authorized outage at an integrated gate. Repeated scratch
cycles and historical surviving-standby passes do not prove this case. Workspace
trust/hot-reload/person-only consent remains a real platform gate; preserve it and
record human-assisted recovery separately from unattended proof.
