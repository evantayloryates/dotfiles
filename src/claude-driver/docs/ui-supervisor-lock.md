# UI resources retain kernel ownership — October 18, 2026

Supervisor loss could release the UI mutex while its owned helper and detached
worker remained alive. A second request could then enter over those resources.
This gap was independently reproduced with the actual lock, helper factory and
UI worker, using only synthetic Node socket/backend processes. No local CUA or
input was initialized.

## Before and after

Before the fix, killing only the synthetic supervisor with SIGKILL let another
withLock callback enter in both cases:

- Helper ready, before worker startup: helper12071 still alive; contender ACQUIRED.
- Running worker: helper12083/worker12086 still alive; contender ACQUIRED.

The unrelated sentinel stayed alive. Only task-created process groups were
cleaned after observation. The assertions and identities are preserved in private
`native-owner-20261018/supervisor-lock-before-qualified.log`. Earlier fixture
syntax/setup failures are retained separately; they are not evidence of this gap.

The existing kernel lock now exposes its borrowed descriptor only when a trusted
withLock caller explicitly requests it. Other callbacks keep their old signature
and release behavior. Tier C duplicates that same open-file description into
both the owned helper and worker as descriptor3. The mutex inode is never unlinked
or replaced. Parent death/close alone therefore cannot unlock a live retained
descriptor. The directory reaper cannot bypass the kernel mutex.

Helper startup verifies descriptor3's device/inode through scoped lsof metadata;
missing retention refuses the lease. The worker verifies the inherited file's
identity before loading its backend. Its receipt carries that identity, which
the supervisor checks. Invalid descriptors refuse before runtime/backend startup.
No native binary, signature, app permission or shared Codex code changed.

After the fix, the same supervisor-SIGKILL regression reports lock_timeout while
owned resources remain alive in both phases. After those exact fixture resources
are cleaned, a fresh callback acquires successfully. The sentinel remains alive.
This qualifies fencing against overlap, not automatic orphan cleanup.

## Native descriptor boundary

Remote service-lifecycle-1792355409074 ran the actual updated helper factory and
public read-only CUA acquisition against the signed copied runtime. Helper3704
retained descriptor3, verified device16777234/inode949804. The parent deliberately
closed its descriptor while the helper/client stayed live. An independent
contender timed out. After client exit0 and helper normal exit0, another contender
acquired. The fixture stayed alive and empty until its normal final stop.

No typing, helper signal, hook override, account authentication or saved native
permission change. This boundary closes the parent descriptor without killing
the native orchestrator; actual SIGKILL is covered by the synthetic process rig,
not relabeled as this native test. The previously qualified combined worker
native runs retain their earlier5fea8859 source identities.

Eight remote files/40687 bytes are mirrored/hash-verified in
`native-owner-20261018/inherited-lock-evidence/`. Final remote inventory: no owned
process/helper/filter, original four non-helper taps, old repo0203e604 clean,
uv/caffeinate508/510 unchanged, no fixture stop marker or copied auth files.
Local quarantine stays blocked/hash9808e860. Source and sibling hashes are in
`supervisor-lock-source.json`. Current source8dfd7c77 includes this fencing;
full194-file isolated suite passes once in71.139s on frozen source/suite/installed
identity: pressure/v2-2026-10-18T20-31-54-446Z.json. Seventeen final focused
kernel/private-helper/supervisor checks pass; six strict-cleanup/group checks
also passed before the final two admission cases. The new actual-worker inherited
receipt has isolated proof; previous combined native worker runs retain their
earlier source and are not relabeled as current native adoption.

## Next ownership step

Automatic cleanup after supervisor loss remains unfinished. A retained orphan
may keep the mutex unavailable; do not call that universal recovery or readiness.
The next fix must provide an owned lifetime channel/reaper that is established
before helper startup, retains kernel ownership throughout cleanup, and observes
termination of only its own resources. Account for loss of the cleanup owner too;
do not solve parent death by moving the same gap into an unchecked child.

First reuse the synthetic rig to qualify supervisor loss with the provider kept
alive, normal cancellation, startup failure and cleanup-owner failure. Then use
one changed-condition remote read-only gate. Do not weaken the retained-descriptor
fence, kill shared helpers, clear quarantine or repeat native typing per edit.
Physical input, simultaneous active input, in-flight native input cancellation,
real Claude, loaded adoption, cold startup and the full goal audit remain open.
