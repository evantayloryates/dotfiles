# Isolated native input investigation

These assets are diagnostic fixtures, outside the shipped driver and the normal
isolated test suite. They do not qualify Claude recovery or physical typing.
The local desktop remains quarantined.

`worker-handoff.mjs <owned evidence parent>` runs the actual private worker and
bundled app-server against a harmless MCP fixture and deterministic localhost
provider. It never starts CUA or a helper. Its effect proof reads only the scoped
socket/startup/home/surface environment; a completed turn without that effect
fails. Each run keeps its own failure report. No hook review override is used.

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

`owner-native.mjs normal|caller-loss|double-owner-loss|type-normal|cancel-input` exercises the new lease owner, actual
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
