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

Before native startup, the owner also establishes a checked live watchdog in
that same group, with another copy of the inherited mutex and a separate Node
IPC channel. It verifies its current process group, creator relationship and
lock device/inode before acknowledging readiness. A refused or dead watchdog
prevents startup or aborts the lease. No saved PID list authorizes recovery.

If caller and owner both die, creator-channel EOF makes the surviving watchdog
retire only peers in its own verified group, remove the validated abandoned
socket and independently audit input resources. It retains the mutex through
that work and writes ui-owner-orphan.json before exiting. The original operation
stays failed/unknown, with normal native exit explicitly unverified; it is never
replayed. Normal disarm requires all peers except the owner to have left.

The synthetic rig covers individual controller loss, all three pairwise losses,
invalid watchdog identity, ordinary cancellation and startup failure. A distinct
successor lease executes only after orphan retirement, preserving the original
failed evidence. Loss of all three control processes is still only fenced by
surviving resources. No universal always-on or physical-input clearance is claimed.

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

## Checked watchdog qualification

Source182ed05d014324dafdf933a3b132ec0d8423f8c70d5ea502ce511dd76e7221f6
adds the watchdog above. Seventy-five focused checks and the final195-file
isolated suite pass once68.519s, source/suite/installed identity frozen:
pressure/v2-2026-10-18T20-58-45-590Z.json. The first focused
run retained a test assertion failure: a killed caller cannot write a result
file. Its actual double-owner cleanup and successor had already passed; the
corrected assertion and additional invalid-identity case pass independently.

Remote normal owner-native-1792357050383 passes fresh exact fixture acquisition,
real turn/archive, helper4375 normal exit0, watchdog4372 disarm/exit0 and empty
group4369. Thread01a150ce-2d15-77f3-8959-1e19fd7a67b1,
turn01a150ce-309c-7953-9ded-2203a5f82c83.

Remote double-loss owner-native-1792357057583 first verifies the current group
and watchdog readiness after fresh read-only acquisition. Caller4471 is stopped,
owner4473 killed, then caller4471 killed so its reciprocal cleanup cannot win.
Watchdog4476 automatically retires remaining peers, removes the owned socket,
passes the input audit and exits. A separate process acquires the same mutex.
Host completion/archive remain false and native exit remains unverified.
Thread01a150ce-4920-7201-8253-267ec42bc19a,
turn01a150ce-4cbf-7b12-88ac-3306fb9ee554. No typing/model inference, hook override,
permission/auth change or local CUA. Both fixtures stay empty and stop normally.
Private watchdog-evidence mirror contains26 files/226292 bytes with hashes,
exact source snapshots and saved contexts. Final remote has no owned processes,
helper/filter/stop marker; original four taps, uv508/caffeinate510 and clean old
repo0203e604 are preserved. Local quarantine remains blocked/hash9808e860.

## Active native input on the owner/watchdog path

The production source remains182ed05d; only the nested remote fixture changes.
Normal input run1792357253765 delivers64 characters exactly once and observes
both active keyboard filters owned by helper4626, including the secondary
frontmost target. Actual turn/archive, helper exit0 and watchdog disarm/exit0
succeed. Input hash remains unchanged at1/5 seconds with no helper/filter.

Cancellation run1792357268408 submits4096 characters once. While the native tool
result is outstanding, the fixture independently shows97 characters matching
the requested prefix and both filters belong to helper4739. A test-only signal
adapter triggers the caller's actual AbortController. Cleanup returns cancelled,
code1, no host completion/archive, normal helper exit0 and watchdog disarm0.
The final109-character prefix remains stable at1/5 seconds; cancellation neither
rolls it back nor authorizes replay. The test refuses to call this an in-flight
pass if partial input/filter/pending-result admission was not observed.

Actual normal thread01a150d1-4783-7c90-a7bf-3428ce163ea7/turn
01a150d1-4b0e-7a42-9573-6ab960f7e43a; cancelled thread
01a150d1-80af-7443-bf6f-3b3295fc975d/turn01a150d1-8430-73d3-8f2c-ffbe61b86e11.
Exact fixture harness snapshots f6668c8c/6f38c56e remain distinct; a later logging
title correction does not relabel them. Private input-owner-evidence contains30
files/266665 bytes. No real inference, new hook override, permissions/auth change
or local CUA. Final remote owns no process/helper/filter; original services/taps
remain. Quarantine stays blocked. Reuse the unchanged full195-file68.519s proof.

## Concurrent caller qualification

Run1792357456810 submits a second real caller while the first holds the real UI
mutex. Separate homes/backends/providers preserve both operations' evidence.
Caller4951 remains queued before and after the first64-character native effect,
then enters after900ms through the same device/inode. Before second native entry,
first group/socket is absent and helper4878/watchdog4875 have closed normally.
Second helper4970/watchdog4967 also close normally after exact append. Both
turn/archive acknowledgements pass;128 exact ordered characters remain stable
at1/5 seconds with no helper/filter. Fixture source2d3cda3b and both actual
contexts/timelines are retained in concurrent-owner-evidence29 files/297535 bytes.
Production source182ed05d and the frozen full195-file result remain unchanged.

Threads01a150d4-60fd-7ca0-8f5e-d68ce92b8829 and
01a150d4-6dce-7f31-a692-44c4703ebad2; turns
01a150d4-647d-7530-baa8-db158d48dd19 and01a150d4-6f2f-7a22-8f6c-c4e835f0c50c.
This verifies driver serialization. It does not prove simultaneous independent
native input outside the mutex, physical-key safety or real Claude behavior.
Read-only default local runtime inspection matches the six reviewed hashes and
helper signature; no local helper was started. Actual MCP remainsfcf4/source182e
and requires refresh before final adoption; no restart/recovery was triggered.

## Remaining work

Full computerUse focus/send behavior, actual
loaded adoption, physical input, independent concurrent native input, cold startup and the completion audit remain separate gates.
