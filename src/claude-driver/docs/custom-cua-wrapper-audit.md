# Custom CUA registration and failure attribution — October 18, 2026

Taylor uses a custom NodeREPL MCP registration and disabled the old Computer Use
MCP entry. This read-only audit distinguishes that deployment from the isolated
native tests. No Computer Use instance, helper, input operation or config change
was started for this audit.

## Current saved deployment

- `~/.codex/config.toml` sets `mcp_servers.computer-use.enabled=false`.
- Its separate `node_repl` server runs the bundled cua_node NodeREPL directly.
  Trusted Sky service is `@oai/sky/service`; trusted browser service is a cached
  browser plugin script. This is a custom registration over packaged runtime
  components, not a separately implemented keyboard engine.
- Both `unified-computer-use@openai-bundled` and `computer-use@openai-bundled`
  have saved `enabled=true`. The unified plugin contributes `cua_repl` and
  Stop/Interrupt/SubagentStop hooks to `cua_repl.turn_ended`. The older
  computer-use plugin manifest is a skill/interface declaration, so its enabled
  flag alone does not imply another MCP connection.
- The top-level notify command separately invokes SkyComputerUseClient
  `turn-ended`. Its timing/effect relative to unified hooks is not established
  by configuration alone. Do not remove either lifecycle route speculatively.
- This chat exposes both `mcp__node_repl` and `mcp__cua_repl` tool namespaces.
  Tool availability does not prove either has acquired an app or that two native
  connections/filters exist. The project config supplies no relevant MCP/plugin
  override. A complete effective-runtime roster has not been independently read.

The custom registration and unified plugin select the same helper app and
`@oai/sky` Mac client. Neither supplies a native pipe override. Reviewed client
source first tries the shared per-user `computeruse.sock`, then ensures/launches
the service when unavailable. Disabling the legacy MCP entry therefore does not
disable every route to this native engine. No stale/duplicate client or broken
hook is inferred from this static graph.

## What the retained reproduction excludes

The manifest hash for run1792358685306/report.json verifies. Its actual worker
roster admitted exactly one non-plugin `cua_repl` server with js/js_reset/
turn_ended and no other servers. It used an isolated test configuration, without
Taylor's custom NodeREPL registration, custom browser service or local notify
configuration. Packaged CUA/NodeREPL/Sky and the reviewed signed helper were used.
Thus Taylor's particular custom registration is not necessary for that failure.

However, our driver intentionally gave each lease a private helper, and the
external-client experiment used distinct mutexes/two independently owned helpers.
Ending one helper while the other typed produced4162 instead of4160 characters.
That is not the ordinary shared-helper deployment. Our orchestration may expose
or amplify the native boundary; it has not been eliminated as a contributor.
The one-client passing control and same-mutex passing serialization retain their
narrow scopes. No exact cause of the historical physical-typing failure follows.

## Corrected next investigation

Treat this as an unresolved integration/lifecycle failure along the native path,
not an established upstream-only defect. Keep local quarantine enabled and all
failed artifacts. Do not modify signed binaries, global plugins, notify or auth.

First trace effective server and cleanup ownership with metadata/source evidence.
Then prepare one isolated comparison of the exact custom NodeREPL setup and the
packaged CUA route on Theo Air, using one helper and changing only one lifecycle
variable. Establish the baseline and cleanup observations before considering an
input test. No unchanged two-private-helper input probe is justified by this
audit. A native maintainer fix remains one possible resolution; a bridge lifecycle
correction or supported dependency-avoidance path remains in scope if proven.

Private evidence: pressure/input-investigation-20261018/native-owner-20261018/
custom-wrapper-audit-20261018.json records selected nonsecret config, source
hashes, retained roster/effect proof and the unverified hypotheses. Global config
SHA13ad57b1/project config89c16836 and the native engine remain unchanged.

## Input-free lifecycle entry-point comparison

Remote wrapper-lifecycle-1792364475276 compares the actual reviewed NodeREPL
executable directly with the actual packaged CUA launcher. Both use an identical
recording trusted service in place of Sky/browser, an empty bootstrap banner,
an absent helper startup sentinel and an unused private socket. No Computer Use
API, app, model/provider, credential, approval or keyboard input is used.

Each route exposes js/js_add_node_module_dir/js_reset/turn_ended. A service RPC
registers one turn-end handler; one explicit synthetic Stop notification invokes
it exactly once with matching contract-only session/turn IDs, and a later RPC
reads the in-memory receipt. Both processes exit normally0 without forced
cleanup; owned native helper inventory is empty before and after. This confirms
callback-delivery parity for a supplied notification and preservation of the
trusted-service override by the packaged launcher. It does not test native
cleanup, exact custom/browser bootstrap, real host routing or duplicate events.

The initial attempt1792364447005 remains failed: its recording service tried to
write a log and both runtimes returned EPERM. Neither acquired Sky or started a
helper; both exited0. The corrected recorder keeps its state in memory and
returns it over RPC. No sandbox/permission change was used to pass the check.
Each attempt retains its exact harness and recording-service sources.

Private wrapper-lifecycle-evidence/manifest.json verifies eight report/source
files,32182 bytes. Final independent process readback finds no owned test group
or copied native helper and preserves uv508/caffeinate510. The first combined
artifact/repository-readback command timed out; no repo state is inferred from
that timeout. A bounded eight-file retrieval and separate process inventory
succeeded without rerunning either comparison. Current production fingerprint,
all195 top-level suite files/all199 evidence hashes and installed identity still
match the frozen passing suite; nested diagnostics do not relabel native proof.

This narrows the next question: the direct custom NodeREPL accepts turn_ended,
but the saved plugin hook names cua_repl. Whether the actual host also notifies
the direct server through another path is still unverified. Top-level native
notify must not be treated as equivalent to NodeREPL callback dispatch. The next
changed-condition gate is an actual-host, input-free routing trace with both
recording endpoints and the already reviewed scoped Stop hook; retain real host
metadata and reject native capabilities. Do not add global hooks or change
plugin toggles based only on this transport comparison.

## Actual host routes Stop by server name

The next input-free gate uses the actual copied Codex0.163.0-alpha.10.2 host,
a deterministic localhost Responses provider, two recording endpoints and the
exact previously human-reviewed Stop -> cua_repl.turn_ended hook. Both endpoints
use real NodeREPL entrypoints with Sky/browser replaced by the recording service
and empty bootstrap. No inference, account token, native app/input, saved trust
change or native permission is involved. The one-invocation review override is
bound to the unchanged hook SHAfbf85b86 and existing remote review receipt.

Run1792364763693-a7ef690e admits both MCPs and registers the probe through each.
Thread01a15143-da76-73f1-b596-d1fab170a143/turn
01a15143-da7e-7423-b768-cb5e821ad125 are supplied by the real host, forwarded
unchanged and matched against the Stop arguments. Each JS call succeeds; only
cua_repl receives Stop once and its result succeeds. node_repl receives no Stop.
There is no observed automatic broadcast to both servers in this configuration.

Countercheck1792364832692-b897f64c swaps only the executable mapping: packaged
CUA under node_repl, direct NodeREPL under cua_repl. Stop still goes only to
cua_repl, now reaching the direct executable. Actual thread
01a15144-e7fb-7843-a8d5-86f4189d1436/turn
01a15144-e803-7b22-8b44-77ad2d24737b match both calls and the successful hook.
This demonstrates name-bound lifecycle ownership for the matched hook; it does
not establish a particular executable incapable of receiving cleanup.

Original overall reports remain FAILED. First4692488-3417b499 admitted neither
server: the fixture's child guard required an SSH marker filtered from MCP child
environment. Parent SSH admission and exact child host/user/owner/run guards are
now separate; no trust or native permission was weakened. Second4763693 lacks
normal proxy-exit callbacks because host shutdown ended those processes first.
Swapped4832692 additionally observed ancillary Git descendants immediately after
host exit. A later independent inventory shows all three owned groups and copied
helpers absent without signals; no missing normal-exit receipt is invented.
Separate routing-analysis.json derives routing qualification from retained calls,
results and actual IDs while retaining those failed cleanup/admission verdicts.

Private wrapper-host-routing-evidence/manifest.json verifies25 files/112910 bytes,
including exact source/config/hook snapshots, original reports, host events and
both MCP traces. Final uv508/caffeinate510 survive. No test has been replayed just
to produce a green overall result. Local config/source/quarantine are unchanged.

The demonstrated integration risk is that the existing plugin hook targets the
named cua_repl server while custom UI work can run through a separate node_repl
server. The native notify command's effect and the live desktop's effective
dispatch still need their own evidence. This is not proof that the historical
physical-key failure came from a missed callback; the native Sky service has no
literal JS turn-end registration in the earlier bounded source review.

Next prepare a single-endpoint custom-services candidate under the expected
lifecycle name in the isolated rig, and trace native notify ownership without
executing it. Do not rename live servers, remove hooks, disable plugins or
declare native safety from this recording-only gate. Consolidating lifecycle
ownership is an in-scope candidate, not a shipped global configuration change or
a fix for the independent-private-helper native delivery failure.

## Single-endpoint candidate and actual Sky setup boundary

Run1792365062060-96028a29 passes the recording-only single-endpoint gate. Only
cua_repl is configured, using the actual packaged launcher and a custom trusted
service map containing the recorder. The exact reviewed Stop hook is unchanged.
Actual thread01a15148-67f2-7ac3-bb21-29a3d998f133/turn
01a15148-67f9-72c1-bf24-e8a72b828049 match the host call, Stop arguments and one
recorded callback. A fixture-only RPC reads callback state after Stop and before
forwarding its original reply; this uses the real captured IDs unchanged and
never invokes Sky. The callback receipt, not merely hook success, qualifies.

One provider probe plus final response completes without inference or account
auth. Host exit0 and independently empty owned group qualify retirement; missing
normal proxy-close callbacks remain separately recorded. Bounded observations
allow up to2s for normal ancillary process retirement and never signal it away.
The candidate is a tested lifecycle shape, not a live config patch: exact browser
bootstrap, native filtering and production desktop plugin merging are untested.

Pure-JS setup contract1792365109042 then imports the actual copied Sky service
SHA5b2fa2f0 with recording addTurnEndedHandler and denied native/network/startup
capabilities. Two setup calls return the11 Mac methods; zero JS turn-end handler
registrations, native connections, launches or network attempts occur. No actual
NodeREPL or app acquisition is performed by this setup-only contract. It agrees
with the earlier literal source review but says nothing conclusive about later
native/Rust ownership or an acquired app's cleanup. Do not convert the recorder's
working callback into a claim that Sky implements the same native release.

Static inspection of local native client SHA4861d29e and signed helperf21c31c0
finds ComputerUseIPCCodexTurnEndedRequest(threadID, optional turnID), a native
receiver and an onCodexTurnEnded callback. A separate lock-screen coordinator
also has a turn-end method. Neither binary was executed; bounded receiver
disassembly does not establish app/filter release semantics or private-socket
binding. Native notify remains a distinct unqualified path. Do not invoke a
private IPC method or assume it dispatches NodeREPL's in-memory callbacks.

Private wrapper-single-endpoint-evidence/manifest.json verifies10 files/47607
bytes for the single-endpoint and Sky setup gates, including exact sources,
configs/hook, host and MCP events. Final groups/helpers are empty without signals;
uv508/caffeinate510 survive. Local native-turn-ended-*-symbols.json and bounded
handler-disassembly evidence retain the static findings. No local CUA/global
config/auth/permission/quarantine changes occurred; prior failed reports remain.

Next use a harmless recording substitute for the configured native notify command
in the isolated host. Capture its actual payload, IDs and ordering relative to
the JS Stop callback without executing SkyComputerUseClient. Then assess the
bridge's actual app-server/worker lifecycle against that contract. This changes
the tested routing condition without another native input experiment, and avoids
assuming the existing native notification compensates for a separate MCP server.

## Configured notifier delivery and private-worker binding

The next gate substitutes a harmless localhost recorder for the top-level native
notify command. It captures the actual command argument and selected environment;
it never invokes SkyComputerUseClient, starts a helper, acquires an app or injects
input. The deterministic provider makes no inference/authenticated request.

- CLI exec1792365356395-fbf95009 passes. One recording MCP probe, one reviewed
  JS Stop callback and one native-notifier substitute receipt carry the actual
  thread01a1514c-e5b0-7fe0-b472-80ccc6b26ba6 and turn
  01a1514c-e5b8-72d2-a38d-056e523bd661. Host exits0 and the owned group is empty.
  The HTTP receipt arrived237ms after the JS hook call in this run; this is a
  receipt timestamp comparison, not an execution-order guarantee.
- Raw app-server1792365458358-f9230ac5 delivers one substitute receipt matching
  actual thread01a1514e-7400-7a73-ba67-5b7f23028705/turn
  01a1514e-7409-7980-95d0-7dfa0841e4d0 after a completed harmless probe. Its
  reviewed JS Stop hook is untrusted and does not dispatch; no trust override
  was used. Native notify delivery and JS callback dispatch are separate paths.
  The original overall report stays FAILED: the fixture incorrectly attempted
  archive on an ephemeral thread with no rollout, then terminated its owned
  host in finally. Missing common-branch exit/events files are not invented.
  Current fixture source avoids ephemeral archive and saves output in finally;
  that corrected app-server branch has not been rerun or declared passing.
- Actual unchanged tierc-worker runworker-handoff-dIfJQq returns exit0,
  PRIVATE_WORKER_HANDOFF_OK and archive acknowledgement. Its sole harmless MCP
  effect and notifier receipt match actual thread
  01a15151-5446-7c61-9d80-1dee3af87da1/turn
  01a15151-5471-7f52-b816-241301848a6b. Parent waits for a missing notifier only
  after normal worker completion, so it does not extend worker close timing.
  Original overall report stays FAILED because the immediate retirement check
  saw ancillary Git/Node descendants. Independent later readback finds the group
  and notifier absent without a parent cleanup signal. This is not a fabricated
  normal-exit receipt or a rerun to turn the report green.

All three payloads contain type=agent-turn-complete, thread-id and turn-id plus
client/cwd/input-messages/last-assistant-message. Only synthetic fixture content
was used. The actual worker's MCP receives its private socket and disabled helper
app in SKY_CUA_SERVICE_NATIVE_PIPE_PATH/SKY_CUA_SERVICE_PATH. The notifier child
receives CODEX_HOME but neither native pipe nor helper-app override. This proves
an environment-binding difference. It does NOT establish which endpoint the
signed notifier selects, whether it supports either variable, or native release.

Private wrapper-notify-evidence/manifest.json verifies14 files/83992bytes;
worker-notify-evidence/manifest.json verifies7 files/56017bytes, including exact
fixture/recorder sources. Eight staged production modules match current local
bytes; this is not a whole import-closure assertion. Derived
notify-routing-analysis.json preserves original failures and separately qualifies
notifier receipts. Independent final inventories find no owned group, notifier
or copied helper; uv508/caffeinate510 remain. Local UI/config/quarantine and
production runtime remain unchanged.

The older filter-retention runs used JS Stop alone; they did not test Taylor's
complete configured native notify path. They remain valid bounded observations
but do not establish that ordinary native turn-end cleanup fails. Do not describe
app-server as dropping configured notify, or equate successful notifier delivery
with cleanup of a particular helper.

NEXT: qualify supported native notifier endpoint selection and ownership without
executing it against shared/unowned services. Only after exact confinement is
established, prepare one changed-condition native lifecycle comparison on the
owned remote fixture using ordinary shared-helper topology. Keep local quarantine
enabled, avoid simultaneous independent input and preserve all earlier failures.
No live server rename/plugin/notify change or upstream-only attribution follows.
