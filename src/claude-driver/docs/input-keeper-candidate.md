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
