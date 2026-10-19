# Private UI input service — October 18, 2026

Tier C now prepares one owned native helper and socket for each UI lease. The
global UI quarantine remains enabled. This is preparation for a safer recovery
path, not clearance for local input or proof of universal unattended startup.

The later isolated shared-helper handoff candidate passes on the reviewed
runtime: normal first-client EOF during second-client input preserves the same
helper and delivers exactly4160 characters, stable at1/5s. This avoids the
per-lease helper teardown boundary that failed with two private helpers. It is
not wired into this production factory. A keeper must live outside per-lease
cleanup groups and must not inherit their UI-lock descriptor; leases must still
retain the kernel mutex through independent receiving settlement and client
retirement. Cancellation, caller/owner loss, runtime drift and physical-input
safety require their own qualification. See [wrapper audit](custom-cua-wrapper-audit.md).

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
- **Combined actual native worker:** worker-native-1792355030848 used the actual
  worker/backend/MCP launcher and production helper factory together. The existing
  human read-only fixture grant was validated before writing an isolated test
  bridge policy; production Claude targets and saved native approvals stayed
  unchanged. Exact fresh AX fixture state, completed turn, archive acknowledgement
  and helper3401 normal exit0 passed. No helper/filter remained while the fixture
  stayed alive and empty. Initial run1792354975435 remains failed: Codex omitted
  one initial text item, so the AX fixture markers were absent despite tool
  completion/approval. A fresh documented getAXState read changed that condition.
  No final-text or send-return inference was used to pass it.
- **Combined worker loss:** worker-native-1792355053893 verified the same read-only
  fixture, checked worker group3497 separate from helper group3481, then killed
  only the worker group. Helper3490 received no signal and exited normally0.
  Host completion and archive acknowledgement remain false. Actual rollout
  metadata supplies thread01a150af-b56e-7ff2-b424-46dd0cb9ae6a and
  turn01a150af-b8f4-7b81-9812-0f2d3fee815b; missing worker output is not invented.
- **Combined normal timeout:** worker-native-1792355070158 held only the fixture
  provider's final response after verified acquisition. The actual worker's
  normal30-second deadline reported timeout, interrupted/archived the thread and
  disconnected clients. Helper3577 exited normally0; no helper/filter remained
  while the fixture stayed alive/empty. Timeout remains timeout. This is a
  pending-provider timeout after read-only acquisition, not in-flight input.
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

The combined runs and exact earlier harness snapshots are mirrored with hashes
in `combined-worker-evidence/manifest.json`:15 files/129650 bytes. Actual completed
thread01a150af-5b6b-76c2-b131-26574d1eea06/turn01a150af-5ee3-77b3-b42e-ccde21ffb9b2;
timeout thread01a150af-f4f7-7a91-933b-d4146ec433d0/turn01a150af-f87a-7950-9739-afc5d6813489.
Final remote inventory again has no owned processes/filter, original four taps,
clean old repo0203e604, uv/caffeinate508/510 unchanged, no fixture stop marker and
no copied auth files. Production source5fea8859 and all staged bridge dependencies
match; the passing193-file suite is reused rather than repeated for nested
diagnostic assets/docs. Service candidate memory26a47ff5 records these limits.

## Remaining boundaries

The combined gate qualifies the worker/backend/MCP/helper composition through a
test orchestrator using the production factory and worker. It does not invoke
the full computerUse supervisor, production Claude targeting/focus/send gates or
physical typing. Simultaneous active input, supervisor SIGKILL, in-flight native
input cancellation, real Claude and loaded harness adoption remain unqualified.
The prior abrupt native CLI-owner proof remains separately recorded. A normal
JavaScript exit handler cannot guarantee cleanup after supervisor SIGKILL.

The later [supervisor lock correction](ui-supervisor-lock.md) reproduces that
gap in an owned synthetic rig, then makes the helper and worker retain the
kernel lock. The [lease owner](ui-lease-owner.md) now handles caller EOF before
startup and while running, and its caller can reap its group after owner failure.
Native caller-loss read-only cleanup passes. Double-owner orphan recovery is
still unfinished and retains the fence. Archive alone does not cover owner loss.
Preserve quarantine and separate physical-input/person gates. No typing repeats.
Cold startup and the full completion audit remain open. Broad Codex bridge
changes and 1Password work stay parked.
