# UI lease ownership and bounded teardown — October 18, 2026

Tier C now starts one private lease owner before helper startup. That owner
holds the inherited kernel mutex, manages the existing helper factory and UI
worker, and performs its own post-lease input audit. The caller keeps the other
side of a Node IPC lifetime channel and can reap the owner's resource group if
the owner dies. Shared Codex code, app permissions and local quarantine are
unchanged. The original bridge worker remains the executor.

## Lifetime contract

The caller acquires the existing UI lock and duplicates its descriptor into a
detached owner group. The owner verifies group leadership and descriptor identity
before native startup. Helper, worker and backend descendants stay in that group;
helper and worker retain descriptor3. Cancellation can arrive before startup.
Caller IPC EOF aborts the worker, retires owned clients, closes the helper and
audits input resources before the owner exits and releases its lock copy.

If the owner crashes, its surviving caller reaps only that tracked group before
returning failure. The caller retires an abandoned socket directory only when
its path, private uid/mode and recorded creator match this owned lease. Original
native exit fields remain unverified; emergency cleanup is a separate record.
An owner-side cleanup deadline can kill its own group after20 seconds, preserving
an emergency record. It cannot emit a successful receipt from that path.

If caller and owner both die, inherited descriptors still fence live resources.
The current test explicitly verifies refusal of a second lease, then cleans its
own fixtures. Automatic recovery of that double-loss case is still unfinished.
No universal always-on or physical-input clearance is claimed.

The owner allows a brief normal drain before sending signals. Process snapshots
record only pid/ppid/group/state/executable path, not arguments or environments.
The scanner excludes its own exact ps PID and zombies. The caller waits for
owner exit and an empty group, rather than treating an IPC return as cleanup.

## Native versus ancillary teardown

A helper forced to terminate still fails the lease. Unknown leftover executables
or SIGKILL escalation also fail. A narrowly recognized owned Git process may be
retired cooperatively after the worker and native helper have completed normally;
that ancillary shutdown is recorded separately and does not assert a successful
Git fetch. The allowed paths cover system Git and observed Homebrew Git/git-remote
executables. No Git commands or permissions are granted to the model by this rule.

Two initial native owner runs stayed failed, despite successful read-only work
and helper exit0, because group retirement was not yet characterized. Added
snapshots identified orphaned Git children. The later native normal run drained
without leftovers, so it did not by itself qualify the Git exception. Separate
actual-Git controls therefore verify cooperative retirement and reject a Git
process inheriting SIGTERM-ignore that requires SIGKILL. They read an empty
private FIFO with hash-object; no repository or network access.

## Evidence

The actual-process isolated cases cover normal completion, unknown residue,
caller loss during a running worker, caller loss before worker startup, owner
SIGKILL, cancellation, startup failure and double-owner loss. They use the real
lock/factory/worker and synthetic Node socket/backend processes. An unrelated
sentinel remains alive. Seventy-one focused checks pass. Initial scanner/setup
and teardown failures are preserved in ui-owner-first.log and related logs.
Final195-file isolated suite passes once76.621s with frozen source/suite/installed
identity: pressure/v2-2026-10-18T20-47-53-653Z.json, sourcee3c3937e. Earlier baseline
195 also passed on6c74bb46 before the ancillary controls exposed the symlink-path
gap; it is not relabeled as proof of the final path policy.

Remote native normal run owner-native-1792356105921 passed exact read-only
fixture acquisition/fresh AX state, real turn/archive, owner3988 termination and
helper3992 normal exit0. Actual thread01a150bf-c390-7d23-894d-2f8871debeda,
turn01a150bf-c713-7603-a6fb-0fcdd4f23494. No helper/filter remained while the fixture
stayed alive and empty. The existing exact human fixture grant was represented
by an isolated test app policy, without changing production Claude targets.

Remote caller-loss run owner-native-1792356135120 killed only caller4091 after
verified read-only state. Provider and fixture remained live. Owner4093 detected
EOF, closed worker/client resources and audited cleanup; helper4097 exited
normally0 without a helper signal. The caller remains SIGKILL; host completion
and archive acknowledgement remain false. Actual saved thread
01a150c0-35a4-7c62-be7d-63367806f741/turn01a150c0-370e-7b13-9e6f-3d75e1a4f910.
Both native runs use source6c74bb46, before the final Homebrew-bin path extension.
Final sourcee3c3937e changes that ancillary path policy; actual-Git controls cover
the extension. These source identities are not relabeled as identical.

Controls1792356351678/1792356352846 pass cooperative-accept and escalated-reject
respectively. Earlier control failures preserve the missing Homebrew-bin path
and the fact that SIGSTOP did not establish SIGTERM-ignore on this host.

Private mirrors under native-owner-20261018: ui-owner-evidence contains46 files/
300143 bytes; ui-owner-ancillary-evidence contains31 files/63457 bytes. Hashes,
source snapshots, real contexts, failures, native/helper rows, audits and final
readbacks are retained. Final remote state: no owned process/helper/filter,
original four non-helper taps, old repo0203e604 clean, uv/caffeinate508/510
unchanged, no auth copy or fixture stop marker. No typing, model inference,
hook override or local CUA occurred. Quarantine stays blocked/hash9808e860.

## Remaining work

Next address double-owner orphan recovery without bypassing the kernel fence.
Qualify exact resource identity before signalling anything: group ownership,
private socket/lease identity, process lifetime and descriptor identity. Stale
PIDs or old metadata alone must not authorize reaping. Include a successor lease
and unrelated processes in the tests; do not release the mutex by deleting it.
Native owner-crash recovery is currently synthetic-tested, while native caller
loss has the read-only proof above. Full computerUse focus/send behavior, actual
loaded adoption, physical input, concurrent active input, in-flight input
cancellation, cold startup and the completion audit remain separate gates.
