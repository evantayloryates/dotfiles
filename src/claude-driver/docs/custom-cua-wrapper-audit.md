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
