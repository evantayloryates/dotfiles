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

Remaining integration work is material: select the single resident owner/control
transport for all MCP/CLI clients; implement bounded trusted native adapters;
keep a minimal public-MCP native connection alive across zero active leases;
verify its exact helper/socket/runtime ownership and absence of inherited UI
locks; bind client retirement and receiving observations to the existing checked
owner/watchdog; and reconcile native filter inventory without ignoring foreign
or unexplained filters. Qualify the adapter first with a remote read-only native
lifetime gate, then one strategic input/failure gate. The earlier default-socket
shared-helper handoff qualifies its recorded topology, not a new private adapter.
Production changes, physical-input clearance and the full goal remain pending.
