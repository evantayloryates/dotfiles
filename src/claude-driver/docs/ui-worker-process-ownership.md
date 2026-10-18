# UI worker process ownership — October 18, 2026

The private UI worker's backend could outlive hard worker failure because the
bridge started that backend in a second detached process group. Parent group
cleanup could not reach it. A surviving backend/MCP client can keep native input
connections open after its worker has gone; the native helper itself must not be
assumed to share either group.

The worker now opts into an inherited backend group. Its supervisor already
starts the worker in a dedicated group, which now includes backend descendants.
Ordinary bridge transports still default to detached. Inherited transport close
signals only its child, never the child's PID as a group leader. The parent also
reaps its owned worker group after exit. No shared-daemon behavior, restart or
other Codex feature changed. This is the narrow input-resource ownership fix;
broader Codex work remains parked.

## Actual worker regression

The new test runs the real worker against a synthetic JSON-RPC backend with a
live descendant and a separate unrelated sentinel. No model, CUA or native
helper is started. Before the fix, backend and worker groups differed. The
failure and identities are preserved in private `worker-process-group-before.log`.

After the fix, worker/backend/descendant groups match. Killing only that owned
group reaps backend and descendant while the sentinel stays live. A separate
actual-process case verifies ordinary transport still owns a detached group.
Existing strict archive cases preserve refusal, lost acknowledgement and the
original thread mappings.

Eleven focused checks passed across ownership, strict cleanup and input audit.
Twelve bridge daemon/close-contract checks passed, including shared-daemon upgrade
coordination. The full192-file isolated suite passed once in39.99 seconds on
source `d0d9525c504a933becff0ab24e1a37a69b3f69acadc8850d70d3fb0eda7fe776`:
`pressure/v2-2026-10-18T20-05-14-581Z.json`, with unchanged frozen identities.
Sibling bridge source hashes are recorded separately; the driver fingerprint
does not include those files.

## Abrupt native owner loss

The remote native experiment kept a default read-only client live, verified one
synthetic typing effect and two private-helper filters, then killed only the
detached fixture CLI group before its final provider response. The private helper
was outside that group and received no signal. It exited normally on connection
loss. Immediate and1/5/15-second inventories retained the default helper and zero
keyboard filters. Typed text stayed unchanged and the fixture remained alive.

Native run `run-1792353701250-421be2da`, actual thread
`01a1509b-0ea7-78c2-85aa-24ce4fad5a57`, turn
`01a1509b-0ebb-79c2-bd02-bb9277d9fe6c`. Host exit is SIGKILL;
hostTurnCompleted=false and hookDispatchVerified=false. The diagnostic passes
only the intended abrupt-owner cleanup condition. It does not relabel the host
turn as completed, require a fake Stop receipt or claim cancellation undid text.

Thirteen files/165148 bytes, exact sources, real context, intent/hash and native
inventories are mirrored under
`pressure/input-investigation-20261018/native-owner-20261018/abrupt-owner-evidence/`.
Final remote state has no owned process/helper/filter, the original four
non-helper taps, clean old repo0203e604 and Switchboard/caffeinate508/510 unchanged.
No live handle or cleanup is pending. No local CUA initialized; human quarantine
is unchanged.

## Remaining integration

Production still uses the plugin's ordinary MCP environment and shared native
helper. This group correction does not clear quarantine or establish private
helper ownership there. Next implement and qualify the private helper/socket
lifecycle and actual worker MCP handoff, failing instead of using the shared
socket on uncertainty. Include helper idle/startup failure and worker timeout.
Physical typing, real Claude and unattended cold startup remain separate gates.
