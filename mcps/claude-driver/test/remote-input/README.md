# Isolated native input investigation

These assets are diagnostic fixtures, outside the shipped driver and the normal
isolated test suite. They do not qualify Claude recovery or physical typing.
The local desktop remains quarantined.

`keeper-resident.test.mjs` uses the linked synthetic
`keeper-resident-fixture.mjs` to qualify independent clients, durable mutation
deduplication after a lost reply, stale-token refusal, epoch/private-key/auth
refusals, live drift and killed-resident pending-intent fencing. These are real
process/socket/kernel observations with no native UI worker/input. Negative
cleanup is explicitly task-owned synthetic retirement, not native success.

`keeper-native-resident.mjs` launches only the exact owned remote
`keeper-native-resident-owner.mjs` composition. A private short control directory
and long durable evidence directory are separate. The resident uses the reviewed
native inventory adapter, closes bootstrap IPC, serves two independent Node
status clients and remains live after their EOFs. Exact request-ID shutdown must
complete durably before native groups/socket retirement. No app acquisition,
input, native permission relay, host model or notifier is used. Native lease
adapters deliberately refuse; this is not actual harness/lease adoption. Control
keys stay private and are excluded from evidence mirrors.

`keeper-lifetime.test.mjs` and `keeper-fixture.mjs` exercise the isolated
`candidates/input-keeper/lifetime.mjs` contract with actual owned subprocesses,
Unix sockets and kernel locks only. No CUA, native helper, app or input is used.
See [candidate contract](../../src/candidates/input-keeper/README.md) for the eight
gates and unimplemented native/resident integration. Negative cases preserve
durable failure fences and clean up only their own synthetic children; those
signals never count as a passing native close.

`keeper-native.mjs` tests the remote-only native resource candidate through
fixed start/probe/close IPC. It uses public `cua.getState()` inventory only,
refuses all permission requests and never acquires an app, injects input or
starts a model host/notifier. Exact private helper/socket identity must persist
across idle observations, independently lack the UI-lock descriptor, then
retire normally with its MCP/resource host. A timeout keeps the same handle
and forbids duplicate startup. Preserve original failures and scoped controller
retirement separately. `keeper-observation.test.mjs` covers the exact ps-inspector
exclusion and descriptor identity used by this candidate; no native runtime runs
in those three checks. None of this changes the shipped owner/factory routing.

`shared-helper-candidate.mjs` is restricted to the existing Theo Air fixture
owner and reviewed runtime/human grants. It requires an absent default socket
and empty native baseline, starts one exact owned helper, and retains two public
MCP clients outside their real ephemeral host groups. No private pipe override
is used. One fixed64-character input precedes one fixed4096-character input;
the first MCP closes normally only after independent partial receiving evidence
and a pending second tool call. The helper must remain unchanged across that
handoff and the idle gap. Real host metadata is forwarded unchanged through the
guarded relay; the approved Stop and guarded native notifier are separate routes.
The final state must match exactly at1/5s, and all owned processes must retire
normally. No preexisting helper/socket is adopted, removed or signalled. It is a
diagnostic lifetime candidate, not a production keeper or physical-input gate.

`receiving-state.mjs` extracts owner-native's existing bounded observer: exact
fixture PID, character/UTF8 counts and hash stable100ms within5s. Tool return
does not prove the receiving queue has drained. Read errors reset stability;
process replacement refuses immediately. Five pure contracts cover delayed
settlement, transient exact state followed by duplication, process replacement,
read-error stability and UTF8 mismatch. No observer action issues/retries input.
Historical source/report snapshots and original failed verdicts stay unchanged.

`native-notifier-help.mjs` is a remote-only help inspection under a deny-by-default
sandbox: no mach/network/write/fork capabilities or helper startup are granted.
It checks exact host/user/chat/runtime identity and requires no native baseline
process. Preserve failures; it does not deliver a native notification. The first
attempt aborted in dyld startup before help output and is not a normal-runtime
crash qualification. `notifier-candidates.swift` separately enumerates only the
native service bundle's running PID and bundle/executable paths, without app
acquisition, helper connection or input. This is future test-admission evidence,
not actual notifier selection or resource-release proof.

`notifier-lifecycle.mjs` admits one exact owned running helper and independently
verifies its private socket owner before relaying a configured notification to
the reviewed public native client. The actual ephemeral host uses a deterministic
localhost provider and the unchanged reviewed Stop hook. A parent-owned public
MCP remains alive across host completion, making filter cleanup distinguishable
from last-client EOF. Real host metadata is forwarded unchanged. The notifier's
CODEX_HOME is explicitly bound to the owned helper installation; no native pipe
override is presumed to bind it. This controlled integration gate does not
reproduce the live desktop's complete plugin/config merge.

Default mode acquires only the exact human-authorized disposable fixture.
`--type-once` adds one fixed64-character synthetic message, admitted only against
the fresh empty fixture, verifies exact receiving bytes/hash and never retries
input. It records filter state before/after JS Stop/native notify and at bounded
settled observations while the helper and MCP stay alive. Command success and
actual cleanup are separate verdicts; a read-only run with no filters cannot
qualify release. Preserve failed reports and normal/forced retirement separately.
No local CUA, permissions, shared helper control or concurrent input is involved.
`--shared-socket` uses a freshly owned helper at the ordinary per-user socket,
only when that socket and all native service processes are absent beforehand.
It neither adopts nor removes a preexisting endpoint. MCP uses the default pipe
with no private override; exact running-app and socket-owner admission still
precedes the public native notifier. The owned helper must exit normally after
the parent MCP closes. This mode changes the transport/lifetime adapter from the
production private-helper factory; keep that difference in comparison results.
`notifierCommandQualified` means exact payload/owned admission/command completion,
not an authenticated receiving-side native receipt. Original earlier reports use
the broader field name notificationQualified; derived analysis preserves this
narrow meaning and every failed release verdict. No rerun follows a field rename.

`wrapper-lifecycle.mjs` compares the reviewed direct NodeREPL and packaged CUA
entrypoints with a recording trusted service, empty bootstrap and disabled native
startup. A supplied synthetic turn-end notification must reach one callback.
`wrapper-host-routing.mjs` uses the actual ephemeral host and deterministic local
provider with the exact previously reviewed Stop hook. Its two-endpoint mode
traces name-bound routing; `--swap-entrypoints` changes executable mapping only.
`--single-endpoint` configures only cua_repl and reads its recording callback
state after the real Stop hook using the actual unchanged host IDs. These modes
never load Sky/browser, acquire apps, inject input or change saved hook trust.
Original admission/retirement failures remain separate from derived routing proof.

`--single-endpoint --record-notify` replaces the configured native notify command
with this fixture's scoped localhost `--notify-probe` recorder. It captures the
actual appended payload, IDs, PID and selected home/pipe/app environment; it never
executes the signed native notifier. Optional `--app-server-host` observes actual
raw app-server completion with normal hook trust, without the CLI exec override.
Ephemeral diagnostic threads have no persisted rollout and are not archived.
Prior failed archive/retirement reports stay unchanged; a recorder receipt proves
delivery, not native helper selection or resource cleanup.

`sky-setup-contract.mjs` imports the actual reviewed Sky JavaScript service on
the remote host, calls setup only and traps native pipe, launch and network
capabilities. It observes JavaScript handler registration, not an acquired app's
native/Rust lifetime. It never starts an actual NodeREPL/native helper or changes
permissions. See [custom wrapper audit](../../docs/custom-cua-wrapper-audit.md)
for exact results and remaining native-notify boundaries.

`worker-handoff.mjs <owned evidence parent>` runs the actual private worker and
bundled app-server against a harmless MCP fixture and deterministic localhost
provider. It never starts CUA or a helper. Its effect proof reads only the scoped
socket/startup/home/surface environment; a completed turn without that effect
fails. Each run keeps its own failure report. No hook review override is used.
Its remote-only `--record-notify --notify-recorder <hashed recorder source>` mode
uses the same harmless recorder with the actual unchanged worker. The parent
waits for the notification after worker completion; it does not delay worker
closure. Compare actual MCP metadata and the notifier environment, preserving
immediate-retirement failures and independent later process readbacks separately.
The source/hash/owner guards reject other hosts or unreviewed recorder/CLI bytes.

`service-lifecycle.mjs` is restricted to the exact Theo Air test owner. It runs
the production helper factory with the signed copied runtime, then performs one
public read-only fixture acquisition using the existing exact human app grant.
It observes normal client/helper exit and independent tap inventories. The
orchestrator removes its own fixture stop marker only after fixture exit. This
is a factory/native seam gate, not an actual worker or typing test. See
[production preparation](../../docs/private-ui-service.md) for boundaries.
Its `--inherited-lock` mode passes the actual borrowed kernel lock to the helper,
closes the parent descriptor while the native client remains live, independently
checks contender refusal, then checks acquisition after normal helper exit. No
native supervisor kill or helper signal is used by that boundary test.

`worker-native.mjs normal|abort-after-acquire|timeout-after-acquire` combines the
actual worker/backend/MCP with that production helper factory, only on Theo Air.
It validates the existing exact human fixture grant before creating a test-only
app policy; no production target/persisted permission is changed. A deterministic
localhost provider requests acquisition and a fresh AX read, verifies the exact
empty/live fixture, then completes, kills only the verified owned worker group,
or holds the provider response for the normal30-second worker timeout. No typing,
model inference or hook override. Actual timeout/SIGKILL/archive outcomes stay
distinct from native cleanup. The native helper is outside the killed group and
must exit normally without a signal. Each new run preserves its harness source;
earlier pre-snapshot source hashes are recovered from owned orchestration assets.
Supervisor SIGKILL and in-flight input cancellation are not covered by these modes.

`owner-native.mjs normal|caller-loss|double-owner-loss|type-normal|cancel-input|concurrent-input|external-input|external-paste|type-long` exercises the new lease owner, actual
worker/backend/MCP/helper, inherited lock receipt and owner-side native audit.
The provider/fixture outlive the caller-loss test. It validates exact fresh AX
state before killing only the caller, then observes owner/group/helper exit.
The test owner entry explicitly selects the already staged signed runtime and
owned helper home; no user config/auth copy or native hook override is used.
Double-loss verifies live group/watchdog identity, kills the caller and owner,
then requires audited watchdog retirement and successor mutex acquisition.
`type-normal` submits one64-character fixture input and verifies exact effect,
owned active filters, normal helper/watchdog close and stable1/5-second state.
`cancel-input` submits one4096-character synthetic input and signals the caller's
AbortController only after observing a pending tool result, a partial prefix
and two filters owned by the private helper. It does not retry. Cleanup requires
a normal helper exit, normal watchdog disarm, no residual resources, and stable
prefix/hash after1/5 seconds. A result arriving before partial-effect admission
is inconclusive/failed, never reclassified as in-flight cancellation. This is
cancellation of outstanding native input, not rollback or physical-key proof.
`concurrent-input` submits a second caller while the first owns the same kernel
UI mutex. The callers share only that lock state; each has separate home/backend,
provider sequence, owner/helper/watchdog and evidence. The second must be alive
and waiting both before and after the first input effect, then enter only after
first group/socket retirement with the exact same mutex device/inode. Both
64-character inputs must appear once in order as128 exact characters, with two
own filters during each input and normal helper/watchdog cleanup. Final state
must remain stable at1/5 seconds. This qualifies concurrent driver requests,
not simultaneously injecting clients outside the driver's lock or physical keys.
`external-input` deliberately gives the second owned client a separate test-only
lock state. After the first64-character effect, the second starts4096 characters
with both native helpers live. Only verified partial input/four owned filters
releases the first provider response; first cleanup must preserve the second's
active helper/filters. Both exact effects and settling are still required.
`external-paste` runs the primary click/paste/text-format route using the exact
editor index from fresh AX state. It refuses input unless the fixture is active,
its key window and Paste menu are present, and the responder is the editor. Both
routes read back AX and wait at most5s for100ms of exact hash/count stability;
this only observes the one attempt. A failed first effect prevents submission of
the second input. Reports distinguish planned and submitted input calls.
Both native routes have retained independent-client delivery failures; normal tool/helper
exit does not turn those into passes. `type-long` is a one-client4096-character
control. Neither mode enables local UI or changes saved app permissions.

The AppKit fixture registers a real Edit/Paste command and activates its key
window; an empty bare NSApplication without that menu was not a valid paste
comparison. Readiness fields are observations, not inferred from a click return.
Secondary ViewBridge targets are retained; `native-audit.mjs` records each owned
filter target's scoped PID/executable metadata rather than inferring foreground.

The fixture can receive a run-owned `CLAUDE_DRIVER_FIXTURE_EVENT_LOG` path. It
records only delivered editor events: source/timestamp/keycode, hashes, counts
and repeat flags. It has no global event monitor and stores no raw characters.
Current logging buffers at most50000 rows and flushes on termination, reporting
dropped rows. The earlier synchronous logger is preserved with its failed run:
it delayed receiver delivery beyond helper exit. Do not call that an input-loss
proof or treat helper exit as a target event-queue barrier.

`owner-ancillary.mjs cooperative|escalated` is non-UI: real kernel/owner/worker/Git
with a synthetic socket/backend. Git hash-object waits on an empty private FIFO,
with no network or repository access. Cooperative Git retirement may be accepted
after normal fake-helper exit; SIGTERM-ignore/SIGKILL must fail the lease. These
controls do not substitute for native cleanup or physical-key evidence.

`host-context.mjs` adds actual ephemeral Codex host turns through a deterministic
localhost Responses fixture, without inference or account credentials. Default
app-server mode preserves normal hook trust. `--exec-entry --review-receipt`
requires Taylor's explicit receipt for the exact `host-stop-hook.json` file and
uses the documented one-invocation hook-review override. It never changes saved
trust. `hook-observer.mjs` first verifies harmless real hook dispatch.
`--catalogue-native` only inventories the actual CUA tools, with no trust override
or CUA call. `--native-turn` requires the reviewed exec entry, an empty live owned
fixture and one clean held helper. It performs one acquisition and one synthetic
type operation, then observes actual Stop dispatch, EOF and 1/5/15-second settling.
`native-proxy.mjs` forwards public MCP metadata unchanged, binds operations to one
actual native turn and relays only the existing explicit fixture app grant.
`native-audit.mjs` only inventories tap/process and own fixture metadata.
Keep the second client alive until settling ends; release it in finally and stop
the fixture through its own stop file. Native retention must return failure even
when delivery and the host turn succeed. No arbitrary provider-generated code,
real model call, private native endpoint or shared-helper termination is used.
See [actual-host findings](../../docs/host-turn-end-qualification.md) before
running another experiment; current evidence already reproduces retention with
real metadata and a successful Stop hook.

The authorized remote host is `theo-air-ts` (console user `theo`). All test files
live in `/Users/theo/.local/state/claude-driver/input-teardown-20261018`, with an
`owner.json` marker binding the current Claude-driver Codex chat. Preserve the
remote Switchboard agent and caffeinate services, existing repository and auth.
Use the existing SSH identity and strict known-host verification; do not grant
TCC, change account access or copy credentials.

`fixture.swift` builds an AppKit text window with bundle identifier
`dev.taylor.claudedriver.inputfixture`. It observes only its own synthetic text,
writing count/byte/hash metadata beside the bundle. It has no global keyboard
hook or network client. An adjacent task-owned `stop` file terminates only this
fixture. Do not create that file until any pending human prompt is settled.

`remote-cua.mjs` is a minimal standard MCP client for the unmodified packaged
`@oai/cua-repl` launcher. It refuses other hosts, homes and workspaces before
spawning anything. Preserve its relative import of the existing
`src/codex-bridge/lib/jsonrpc.mjs` when staging it remotely. No Codex model turn
is launched. Only the copied public runtime module directory is configured as a
trusted code root. No review-disable flags, fake runtime globals, private native
RPCs or auth copies are used. The remote signed helper binary must match the
reviewed binary; record its SHA256 and verify its signature before acquisition.

Phases are `catalogue` (initialize/list tools), `acquire` (one documented
`cua.getApp` call), `teardown` (acquire, audit, `js_reset`, audit, MCP EOF, audit),
and `typing` (the same lifecycle with one synthetic `typeText` plus fresh AX
observation before reset). `hold` acquires without typing and writes a uniquely
named `.ready.json` containing its owned release-control path; it stays connected
until that file receives `{ "threadId": "01a112b1-fbf6-7cb0-8228-ce3e6cb6112d", "release": true }`
or its 90-second deadline expires. Use it as the second client when checking
whether filters outlive the typing client. Always release it in a `finally`
block and retain independent tap snapshots while it is still alive, including a
bounded settling window. Never kill the helper to force a passing result.
Read the returned tool documentation before
acquisition, then read its initial API/state before implementing another UI call.
The exact fixture title/editor and live process are checked before typing.
Typing requires an empty owned fixture, records intent before submission and
never retries. Independent fixture count/hash metadata must match exactly once
after typing and remain unchanged after EOF. The initial catalogue was
independently checked not to start a native helper.

Without `--relay-approval`, the client refuses all server requests. With it,
standard MCP form requests are written as uniquely named `.pending.json` files
and held for at most five minutes. A separate explicit human answer must be
relayed to the exact request hash in its `.response.json`; acceptance is never
inferred from elapsed time, standing authority or a default option.
`--human-approval` may reuse that actual human receipt for the identical prompt
during the same active test. The typing phase also recognizes Taylor's explicit
app-level approval for this test: it verifies the original request hash, exact
fixture app, unchanged approval prompt/low risk, and only `get_app_state` or
`type_text`. Broader apps, permission prompts and other operations cannot use
that grant. The relay does not request persistent approval or manufacture a
persisted-state response, and it does not answer macOS privacy prompts.
Never manufacture a human receipt to unblock a test.

Each invocation preserves its own harness source hash/file and writes a private
immutable report, including failed startup,
approval and acquisition outcomes. MCP EOF/exit is recorded separately from
native input cleanup, which remains explicitly unassessed. A bounded fallback
may terminate only the client-owned MCP process group; never kill a shared
helper to make cleanup pass. Audit native tap/process metadata before/after
each changed-condition experiment and preserve failures. Use the fixture's own
metadata for any later synthetic-text verification; physical-key behavior and
the real Claude target require separate evidence.

`--isolated-pipe` accepts only the owned `isolate/run-<milliseconds>.sock` pattern.
The socket must already exist with the current user's identity, a private parent
and no symlinks. The client never starts, kills or repairs a shared helper. The
owned orchestrator starts the signed helper with that socket plus the owned
CODEX_HOME/bundled CLI path, independently verifies its PID/socket, and observes
normal exit. The host harness forwards the socket through its scoped public MCP
relay, preserving native context and ordinary app approvals. Its native baseline
then requires two clean helpers; after its client ends only the held default
helper may remain. See [isolation evidence](../../docs/native-helper-isolation.md)
for retained failures and remaining gates. The actual typing run uses the final
guarded source preserved in its report; earlier standalone read-only runs retain
their own pre-hardening source hashes.

`--no-shared-startup` requires that isolated socket and a missing owned sentinel
app. The intentionally unavailable-socket probe verifies acquisition refuses
without launching any helper. It does not turn the failed acquisition into a
successful operation.

`host-context.mjs --abort-after-typing` requires the reviewed native/private-pipe
case. After independent typed-effect and active-filter verification, it kills
only its own detached CLI group before the final provider response. The native
helper is an externally owned orchestrator child outside that group. The report
keeps SIGKILL, absent turn completion and absent Stop dispatch explicit, and
passes only the intended cleanup/resource condition. It uses actual native tool
metadata for the turn ID. This never rolls back typed text or retries it. See
[worker ownership](../../docs/ui-worker-process-ownership.md) for exact evidence
and the distinction from production worker qualification.
