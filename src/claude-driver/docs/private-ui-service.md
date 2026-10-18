# Private UI input service — October 18, 2026

Tier C now prepares one owned native helper and socket for each UI lease. The
global UI quarantine remains enabled. This is preparation for a safer recovery
path, not clearance for local input or proof of universal unattended startup.

## Ownership and failure behavior

`lib/private-input-service.mjs` hashes six reviewed critical files: bundled Node,
node_repl, CUA launcher, native-pipe client, bundled CLI and signed helper binary.
It verifies the helper app signature. A changed component refuses the lease
pending isolated qualification; this is not a whole-SDK integrity assertion.

The supervisor retains the exact helper child handle. Its short Unix socket lives
in a fresh current-user mode-0700 directory. Startup verifies socket type, uid,
parent and exact helper PID through lsof. The existing bridge worker/backend/MCP
group remains separately owned by the supervisor. Shared helpers and unrelated
processes are never cleanup targets.

The worker uses public thread/start configuration to disable both bundled CUA
plugins for this thread and install one explicit `cua_repl` server. Its MCP
environment names the owned socket and a deliberately absent sibling startup
app. That sentinel makes failed private acquisition refuse shared startup on the
reviewed runtime. No global plugin/config, saved trust or native permission is
changed. Public MCP status must report the sole connected non-plugin server,
only js/js_reset/turn_ended tools, and no other active MCP before a model turn.

The scoped server's tool approval mode is `approve`, matching Taylor's existing
authorization for these mechanical leases. This admits the three tool entrypoints;
native per-app elicitation, workspace trust, hot-reload consent, sandbox, and the
bridge's app/command policy remain separate gates. Official setting reference:
[Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference).
No hook-trust override is added to production.

Worker archive acknowledgement remains distinct from input cleanup. The supervisor
waits for the owned helper's normal exit before returning a successful UI receipt,
and audits native input resources after success, cancellation and startup failure.
A bounded fallback may signal only that exact owned child; forced termination
still fails the lease. Evidence records runtime hashes, socket/PID, exit status,
forced cleanup and stderr byte count. It does not capture native stderr or secrets.
Roster refusal retains bounded names/status/tool names, not tool descriptions.

## Qualified gates and preserved failures

- **No shared startup:** remote disabled-startup-1792354150573 returned the expected
  startup refusal, client exit1, zero helper processes and zero typed characters.
  Acquisition remains failed; the refusal boundary passed.
- **Actual worker/config handoff:** local worker-handoff-qUPVwK used the real
  worker, bundled app-server and a harmless MCP fixture. The MCP independently
  read the exact socket/sentinel/home/surface environment. Roster admission,
  one tool invocation, real turn completion and archive acknowledgement passed.
  There was no CUA/helper, inference or account credential use. Earlier
  worker-handoff-7KiEx1/xJDtAC preserve the fixture's missing JSON-RPC envelope;
  XGdOJW preserves the subsequent outer tool-approval refusal. Its final text
  alone did not pass the test because the MCP effect was absent.
- **Production factory/native lifecycle:** remote service-lifecycle-1792354767849
  ran the actual helper factory and public MCP configuration builder against the
  signed copied runtime. Helper3236 owned `/private/tmp/claude-driver-cua-501-PKeYGe/s`,
  read-only fixture acquisition passed, client exit0 preceded helper normal exit0,
  and the fixture stayed alive and empty until final cleanup. No typing, helper
  signal, target quit to obtain cleanup, host turn or hook override was used.
- **Isolated regression checks:** private socket ownership, component drift,
  quarantine, cancellation, spawn failure, forced-cleanup failure, exclusive MCP
  roster, strict archive handling and process-group ownership are covered. The
  unrelated sentinel process survives cleanup. Full suite evidence is recorded
  in resume.md after the final source run.

Private evidence root:
`.runtime/state/pressure/input-investigation-20261018/native-owner-20261018/`.
Nine remote files/76326 bytes were mirrored with hashes in
`production-service-evidence/manifest.json`. Final remote readback has no owned
native processes or filters, the original four non-helper taps, clean old repo
0203e604 and original uv/caffeinate PIDs508/510. The attempted guessed launchctl
labels returned113; those label checks are unavailable, not service-state proof.
No user/test auth files were present. Local quarantine hash remains9808e860.

## Remaining boundaries

These gates qualify the actual worker/config seam and actual factory/native seam
separately. They do not yet qualify their complete combined native worker path,
physical keyboard behavior, simultaneous active input, supervisor SIGKILL,
production native timeout/cancellation, real Claude or loaded harness adoption.
The prior abrupt native CLI-owner proof remains separately recorded. A normal
JavaScript exit handler cannot guarantee cleanup after supervisor SIGKILL.

Next use one isolated remote combined worker/helper read-only gate with the
existing exact fixture authorization. Keep its test-only app policy explicit;
do not broaden production targets, fake Claude identity, forge native approval
or clear local quarantine. Then qualify native timeout/cancellation before
considering physical-input/person gates. Do not repeat typing per interim edit.
Cold startup and the full completion audit remain open. Broad Codex bridge
changes and 1Password work stay parked.
