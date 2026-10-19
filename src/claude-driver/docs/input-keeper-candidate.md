# Persistent input keeper candidate — October 18, 2026

The passing shared-helper native handoff motivates a driver-owned lifetime
correction. The current shipped factory still starts one private native helper
per lease and remains quarantined. The new isolated
`candidates/input-keeper/lifetime.mjs` defines the ownership contract without
changing those shipped call sites or the broader Codex bridge.

The keeper must sit outside lease cleanup groups and must not hold their UI
mutex indefinitely. Each lease's owner/checked watchdog retains that mutex
through actual client retirement and independent receiving settlement. A keeper
retained between leases must be checked by exact live resource/socket identity,
not adopted from a PID file. Unknown input, cancellation and owner loss are never
replayed. Drift or uncertain cleanup fences later admissions durably.

Eight actual-process synthetic checks pass in7.798s. One helper spans two normal
client groups with the same identity; a second constructor cannot acquire the
keeper guard. During delayed settlement a lock contender remains blocked, and
helper shutdown/new admission refuse. An owner killed with SIGKILL can retire
its client only while a registered surviving lock holder is verified. Losing
every registered holder refuses completion even after client EOF. Runtime drift,
partial client creation, failed retirement, admission cancellation and helper
death retain a durable fence without replay/replacement. Stale tokens cannot
retire a newer lease. An unrelated sentinel survives each case. These are real
kernel/socket/process observations with synthetic resources, not native CUA or
physical-input proof. Negative-case test cleanup is separate from a successful
keeper close.

The initial six-check log predates the explicit guardian identity contract and
lacks a frozen source snapshot; preserve it without relabelling it as final
proof. The final eight-check source/dependency manifest and log are retained in
service-private native-owner-20261018/keeper-lifetime-contract-evidence.json.

NEXT: implement the bounded native resource adapter and select a single resident
driver owner/control channel for cross-harness callers. Reuse reviewed runtime
inspection, public MCP, kernel locks and current owner/watchdog rather than
creating another general-purpose bridge. Prove a minimal read-only keeper
connection holds the exact owned helper through an idle gap and normal client
retirement on Theo Air before using it for input. Keep local quarantine enabled;
do not adopt/control a preexisting helper, change native auth or replay the old
two-private-helper input test. Exact source/runtime binding and the full
completion audit remain required before the goal can finish.

## Minimal native resource lifetime qualified

Remote read-only gate1792368194128-6b4d073a uses the candidate's bounded
start/probe/close adapter, existing reviewed helper factory and public MCP
inventory only. Helper8627/group8624 and socket device/inode persist at1/5s with
one connected Unix endpoint. No UI-lock descriptor appears in the resource
group, and an independent process acquires that lock after parent release while
the helper stays alive. MCP/helper/host exit0 normally, socket/group absent;
final native helpers/filters absent and original uv508/caffeinate510 preserved.
No native fixture/app acquisition, input, permission relay, actual model host,
notifier or inference is involved. Inventory text is hashed rather than retained.

First1792368103491-87146149 stays failed. Its successful inventory and recorded
normal native helper exit are narrower proof; scanner self-inclusion caused
descriptor/peer-retirement refusal. Sole remaining owned host8563 received a
verified scoped SIGTERM after native absence; no normal host/client receipt is
invented. Exact-inspector/zombie exclusion and bounded changed-set retries fix
the observation boundary; three process/descriptor checks pass. The next native
gate changes that condition, rather than replaying input. Thirty exact files/
137343bytes and both original verdicts are retained in the private manifest and
keeper-native-analysis.json. Current resource-host0e56f1ae/gate61ad7c9b remain
distinct from initial00d5a25c/137f8974 producer snapshots.

Next establish one resident driver owner per state directory with a private
local control channel, reusing resource IPC and the generation/kernel guard.
Per-harness MCP processes and bounded durable-job workers have the wrong
lifetime to own a cross-harness keeper. Connect the existing checked UI
owner/watchdog and independent receiving verification before native lease/input
qualification. Controller loss and per-lease native adapters are still pending;
this read-only resource pass does not qualify them. Production stays unchanged.

## Resident control and independent native clients

The new isolated resident control candidate is implemented. One process owns the
coordinator independently of MCP/CLI client connections. Per-generation private
keys, exact socket identity, epoch/generation matching and a separate kernel
guard bind control calls. Long durable paths use an independently verified short
Unix control directory. Only metadata status/acquire/release/shutdown operations
exist. Request-ID/fingerprint intent is durable before adapter invocation, so a
lost reply can be queried without replay. No report text, task, shell command,
adapter module name or arbitrary native request is executable through control.

Fourteen process checks pass9.127s: six transport/reconnect/uncertainty/refusal
gates and the eight lifetime gates. In the lost-reply case, the second connection
observes pending, then receives the original result after the barrier releases;
the client-start count remains one. Killing the resident retains that pending
intent and refuses a replacement. A stale completed release can be read back
without closing a successor. The first14-check pass/producers remain frozen
separately from the later short-control-path extension. Synthetic cleanup signals
are distinct from successful native retirement.

Native inventory-only run1792368681373-0c114a6a passes on resident72795ca5 and
lifetime6eff7ec9. Resident8722 owns resource-host8726/helper8729 after bootstrap
IPC EOF. Independent Node processes8773/8780 each return the same live helper and
generation, exit0, and leave the keeper live. Exact shutdown request ID is
durably completed; resident/MCP/helper exit0, groups/socket absent. Only the
task-created empty short control directory is removed. Final native helper/
filter inventory is empty and uv508/caffeinate510 survive.19 files/85080bytes
with exact producers and nonsecret registration/ledger are mirrored; control
keys are excluded. No app acquisition, input, permission relay, model or notifier.

This does not qualify actual coding-harness adoption or real native lease
behavior. The native composition refuses all lease methods. Bind the current
checked UI owner/watchdog and worker under the same mutex next, keeping the
keeper outside lease cleanup groups and independent receiving verification in
the release path. Exact owned-filter admission must not ignore foreign or
unexplained filters. Native controller-loss/orphan reconciliation and physical
input remain unqualified; do not ship the new route or clear quarantine yet.
