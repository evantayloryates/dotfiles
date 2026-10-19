# Input keeper lifetime candidate

`lifetime.mjs` is an isolated integration candidate, not imported by the shipped
MCP server, CLI, Tier C owner or worker. It does not load or start Computer Use.
Trusted adapters supply resource/client handles and independent observations;
tool arguments, diagnostic report text and saved PIDs are never adapters.

The intended resident driver owner has one coordinator across its harness
clients. A separate kernel guard serializes coordinator creation. Its journal
retains a generation UUID, runtime epoch, exact resource/socket identity and the
last32 sanitized lease records plus a total count. Neither the keeper nor its
children receive the per-lease UI-lock descriptor. Each admitted lease registers
its live owner and up to two live guardians holding the same lock device/inode.
Resource identity and runtime epoch are rechecked before and after client start.
The keeper group must differ from every lease owner's/guardian's group.

Client retirement precedes independent receiving settlement. That observation
must identify one registered, still-live lock holder; a bare boolean or former
owner PID does not qualify. The original owner must also remain verified for a
completed operation. Cancellation/owner loss stays cancelled/unknown and never
authorizes replay. Normal release retains the helper for a later lease. Final
shutdown requires no active lease, exact resource identity and independently
verified normal client/helper retirement. Forced shutdown cannot pass.

Failed admission, runtime/resource drift or uncertain retirement writes a
durable fence. A new coordinator cannot adopt its saved helper PID or overwrite
the unresolved generation. An exact active token may reconcile remaining client
resources; this preserves the failure fence. No automatic native restart,
unknown-operation replay or production quarantine bypass is provided. A new
generation is admitted only after a recorded normal close. The coordinator guard
is released after the durable fence; the unresolved journal then refuses a new
generation without trusting a stale PID. The live object's busy flag serializes
its remaining reconciliation calls.

`test/remote-input/keeper-lifetime.test.mjs` uses actual disposable subprocesses,
Unix socket clients, IPC, process groups and the existing Python/kernel flock
implementation. It verifies normal reuse and cross-constructor exclusion,
cancellation through delayed settlement, owner SIGKILL with a registered survivor,
runtime drift, partial admission/failed retirement, helper loss, admission-time
cancellation and loss of every registered lock holder. Eight checks pass in
7.798s. These socket probes are not native input or physical-key evidence.
Negative tests deliberately leave the candidate fenced, then retire only their
own synthetic processes in test cleanup. That cleanup is not a graceful native
keeper receipt. The original six-check log predates the stricter guardian
contract and has no frozen source snapshot; it is not final-source proof.

Remaining integration work is material: connect the resident control candidate
to MCP/CLI callers; implement the trusted per-lease adapters;
keep a minimal public-MCP native connection alive across zero active leases;
verify its exact helper/socket/runtime ownership and absence of inherited UI
locks; bind client retirement and receiving observations to the existing checked
owner/watchdog; and reconcile native filter inventory without ignoring foreign
or unexplained filters. Qualify the adapter first with a remote read-only native
lifetime gate, then one strategic input/failure gate. The earlier default-socket
shared-helper handoff qualifies its recorded topology, not a new private adapter.
Production changes, physical-input clearance and the full goal remain pending.

## Read-only native resource adapter

`native-resource.mjs` and `resource-host.mjs` are restricted to the existing exact
Theo Air owner. The parent keeps the tracked child handle and bounded IPC;
fixed start/probe/close methods do not accept tasks, arbitrary JS, consent or
native RPC. Startup refuses preexisting helpers, uses the reviewed production
helper factory and signature/hash inspection, and opens one public MCP using
only `await cua.getState()`. Every permission request is refused. Native inventory
text is reduced to a hash/byte count, never saved as app/window content. Helper
and MCP share the resource host group, outside UI lease groups, with no passed
UI-lock descriptor. Descriptor and socket ownership are independently inspected.

Read-only gate1792368194128-6b4d073a passes: one exact helper/socket persists
through1/5s idle observations with a connected Unix endpoint; the UI lock can be
acquired after its parent releases it while the keeper stays live. Final
MCP/helper/host exits0 normally, socket/group absent, no native helper/filter.
No app acquisition/input, host/model, native notifier or permission relay ran.
This qualifies resource lifetime only. It does not implement native lease
admission, receiving settlement, cross-harness residency or owner-loss recovery.

First1792368103491-87146149 remains failed: self-inclusion of the short-lived ps
inspector makes lsof/retirement fail after successful inventory. Helper exit0
is recorded; normal full client/host retirement is unqualified. Its exact sole
remaining owned controller was signalled only after independent native absence
and source/parent verification. `process-observation.mjs` fixes exact-inspector
and zombie exclusion; three contracts cover that boundary and descriptor field
identity. Changed-set lsof observation retries are bounded and stable errors
still refuse. Producer snapshots and original failures stay intact. A startup
timeout retains the same handle; it never authorizes a second helper launch.
Controller-channel loss remains an unqualified failure path, not automatic
cleanup/recovery proof. The shipped call sites remain unchanged and quarantined.

## Resident control candidate

`resident.mjs` hosts the lifetime coordinator independently of bootstrap/control
connections. Its private state directory holds a per-generation control key,
registration and durable mutation records. A separate private short control
directory may hold the Unix socket; clients supply and verify that exact path
and socket device/inode. No path from a request or stale PID authorizes adoption.
The kernel generation guard still serializes construction. Only fixed metadata
status/acquire/release/shutdown operations exist; adapters are linked code.
Frames/connections are bounded and keys are never logged or returned.

Each mutation records its ID/fingerprint before invocation. Reconnect with that
exact identity returns pending/completed evidence without calling an adapter
again. Different arguments under an existing ID refuse. Durable per-request
files are retained for deduplication; bounding a recent view must not evict the
only idempotency evidence. A pending record after owner loss stays unresolved.
`inspectKeeperRequest` reads its exact generation and cannot resume the action.
Bootstrap/client EOF does not shut down an otherwise live resident. Shutdown is
explicit and requires the existing independent resource retirement contract.

Six resident process gates plus eight lifetime gates pass9.127s. They use real
processes, sockets and kernel ownership observations with synthetic resources;
the transport fixture's leases have no real UI worker/input. First14-check source
snapshots are retained separately before short-control-path support; final
sources/logs qualify the final candidate. A fresh read-only native composition
also passes: resident8722 and helper8729 persist through bootstrap EOF and two
independent Node client processes, then normal explicit shutdown. Native lease
methods are deliberately refusing in that composition. This is not actual
harness adoption, native input, controller-loss recovery or production wiring.
