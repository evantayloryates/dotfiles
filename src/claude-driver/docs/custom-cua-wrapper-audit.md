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
