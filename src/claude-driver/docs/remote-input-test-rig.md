# Theo Air native input test rig — October 18, 2026

Taylor supplied the remote connection from Codex chat “theo”
(`01a1178d-fc2e-78f0-b55a-3690b5706ed3`) and explicitly authorized using it for
the native input investigation. The goal was resumed through Play/Resume and is
active. The full Claude-driver goal remains incomplete.

## Environment and isolation

SSH alias `theo-air-ts` resolves to Theo Air's existing tailnet connection,
using user `theo` and its existing key. Tests require strict known-host checking,
batch authentication, no agent/X11 forwarding and no inherited forwards. No new
SSH trust, login, credentials or account permissions were installed.

Verified host: `theo-air`, macOS 27.0.1, arm64, console user `theo`, 8 GB RAM.
The existing repository is clean at
`0203e6047bc0f9eca1451473ea19e19aabb74bd6`; it was not updated or modified.
The Switchboard agent PID 508 and caffeinate PID 510 were preserved, with their
launchd status unchanged. No voice logs, recordings or environment files were
read. Claude and the Codex desktop app are absent on this host.

All test assets are under
`/Users/theo/.local/state/claude-driver/input-teardown-20261018`, mode 700,
with a current-chat ownership marker. Only public software was copied: the
packaged CUA runtime, Codex CLI app and signed Computer Use helper. No auth,
sessions, configuration or account files were copied. Final checks found no
Codex/Claude credential files at the checked host/test-home paths.

The remote helper's strict signature verification passed. Its binary SHA256
matches the local reviewed helper:
`f21c31c0ee5df419dbd165bf76ebd65c64d864c6fec5b6c6c3a23c42ff3d2e13`.
Node, NodeREPL and CLI binary hashes also match their local public copies.
Runtime packages: CUA REPL 0.1.0, Sky 0.7.8; CLI
`0.163.0-alpha.10.2`. These labels identify the diagnostic runtime, not a new
Claude-driver deployment.

## Test method and approval

The [test assets](../test/remote-input/README.md) use the unmodified public
`@oai/cua-repl` MCP launcher with only its computer surface enabled. The NodeREPL
module search/trust roots are restricted to the copied runtime packages, and
`CODEX_CLI_PATH` names the copied CLI. No review-disable flags, fabricated
runtime globals, private native IPC calls, model turns or helper kills were used.

The disposable AppKit fixture has bundle ID
`dev.taylor.claudedriver.inputfixture`, an unmistakable window/editor name,
and its own count/byte/hash output. It reads no other app's text and installs
no global input hooks. Every synthetic send was attempted once; the fixture's
independent metadata verified exactly 54 characters/bytes and the expected hash.

The standalone MCP client initially lacked module-path configuration and form
elicitation support. Those failed attempts are retained. A standard MCP form
relay then delivered the exact per-app request to Taylor in this Codex chat.
Taylor explicitly selected “Allow for this test.” The bounded test grant covers
only this fixture's low-risk state/type operations; it is not an automatic or
persistent approval for other apps or native permission prompts.

The first approved acquisition returned “permissions pending.” Narrow read-only
system TCC metadata showed Accessibility and Screen Recording allowed; user TCC
metadata was unavailable and no elevation was attempted. A fresh acquisition
then succeeded. The test did not edit either permission or answer an OS prompt.
Permission metadata alone was not treated as a successful app acquisition.

## Native observations

| Case | After acquisition | After typing | After JS reset | After typing client EOF |
| --- | --- | --- | --- | --- |
| Read-only lifecycle | Helper alive, no active keyboard filters | No typing | Helper alive, no filters | Helper exited, no filters |
| Sole typing client | No active keyboard filters | Two filters, exact text once | Same two filters | Helper exited, filters removed |
| Shared helper, second read-only client held | No active keyboard filters | Two filters, exact text once | Same two filters | Helper and filters remained while the other client stayed connected |

The shared case was first observed immediately after EOF, then repeated with a
changed timing condition: independent inventories at 1.29, 5.29 and 15.29 seconds
after the typing client exited. Both active filters remained throughout, with
the second client independently still alive. They were mask 7168/options 0,
owned by helper PID 1857 and targeting fixture PID 1867 and ViewBridgeAuxiliary
PID 431. The extra target was identified using only exact-PID process metadata.

After releasing the second client's owned control, its MCP exited normally.
The helper then exited and both filters disappeared. The typing case correctly
returned failure while filters remained; successful synthetic delivery did not
turn that cleanup failure into a pass. No helper was killed to obtain cleanup.

This establishes a current-binary, shared-client filter-retention condition on
the isolated fixture. It does **not** reproduce physical duplicate typing or
prove that production Codex host cleanup behaves identically. These standalone
clients carried no actual Codex turn metadata and did not exercise the native
host's turn-end contract. The target was AppKit, not Claude. Preserve these
limits when deciding how to fix or qualify UI recovery.

## Evidence, cleanup and next step

Private evidence is mirrored, with the original 39 manifest entries and all 43
entries in the supplemental final manifest verified, under
`.runtime/state/pressure/input-investigation-20261018/remote-theo-air-20261018/`.
The original remote directory retains the same files. Key records:

- `teardown-1792351308823.json`: read-only lifecycle baseline.
- `typing-1792351366213.json`: sole-client input/reset/EOF and exact hash proof.
- `shared-client-lifetime.json`: initial shared-client observation.
- `shared-client-settled-1792351495.json`, `typing-1792351498993.json`: bounded
  shared-client retention failure and last-client cleanup.
- `source-406d038d380f45cf190c58b1ab1f041f4c43f43fd639f580fbac54d3c132467b.mjs`:
  the exact shared-experiment harness. Other runs retain their own source hashes;
  later report-bookkeeping edits do not relabel those native observations.
- `final-readback.json`, `evidence-manifest.json`: process/tap/worker/repository
  cleanup, credential-file absence and immutable artifact hashes.
- `final-protocol-check.json`, `evidence-manifest-v2.json`: final diagnostic-client
  catalogue pass and supplemental hashes after hardening error reporting. The
  final client refuses this desktop before launch; its native observations still
  retain their earlier exact source snapshots.

All owned MCP clients, CLI processes, helper and fixture are stopped. The fixture
used its own stop-file control; the owned stop file was removed afterward.
The remote returned to its original four non-helper taps. Test binaries and
evidence remain for reuse; the existing repository/voice worker remain intact.
The local desktop's quarantine hash remains
`9808e8603c4b4c4f1178e688a885e9cba4605f3bd2d7ee1ad5dce092a3c13f37`, blocked.
No local CUA, keyboard input, helper restart or quarantine release occurred.

Next, establish how the actual host associates native input ownership with a
real owned turn and which documented scoped teardown releases it while another
client stays live. Inspect the public `turn_ended` contract and its actual Mac
registration before proposing a hook or another native test; do not fabricate
native context or use private disposal endpoints. Real Claude and physical-key
qualification remain separate. The safe input-free ordinary profile remains in
place; this finding does not solve unattended cold startup.
