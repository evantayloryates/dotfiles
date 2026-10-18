# Duplicate input investigation — October 18, 2026

Taylor authorized investigation of the duplicate-typing defect with UI automation
still disabled on this desktop. The initial investigation below was offline.
Taylor then provided Theo Air as an isolated remote target; the new remote
native findings are documented in [the test-rig report](remote-input-test-rig.md).
No local Computer Use runtime, input injection, helper retirement or quarantine
release occurred.

## What the evidence establishes

The October 6 incident recorded two enabled active keyboard filters (mask 7168,
options 0), owned by SkyComputerUseService PID 39019 and targeting Claude PID
1891. They persisted across JavaScript reset. Retiring that helper removed the
filters; Taylor subsequently confirmed physical input recovery. These observations
support a stale-filter hypothesis. They do not expose the native callback that
duplicated an individual key or paste, or prove a complete causal chain.

Original private evidence is retained in
`pressure/input-incident-2026-10-06/summary.json` and its named tap inventories.
The original helper binary hash was not preserved; do not claim the current
binary is the same or that an upstream update fixed the defect.

The current read-only audit found zero active helper keyboard filters targeting
Claude. It uses CGGetEventTapList and process metadata only: no event callback,
keyboard capture, application observation or CUA connection. Its narrow result
does not establish global input health, physical-key behavior or cleanup after
a future lease.

## Current installed boundary

The desktop is `/Applications/ChatGPT.app`, version 26.1013.31256, build 20586.
The installed helper is 26.1013.1001501/build 1001501. Its executable SHA256 is
`f21c31c0ee5df419dbd165bf76ebd65c64d864c6fec5b6c6c3a23c42ff3d2e13`,
matching the copy bundled with the current runtime. Sky package version is 0.7.8;
CUA runtime archive is `0.0.30/20261014203459-0849368674e2`.

Static inspection of the shipped macOS client shows requests to a shared native
service. The observed helper PID 70326 is parented by desktop PID 69938, outside
the private Tier C worker's process group. Killing that worker group therefore
does not itself prove helper retirement. Do not terminate the shared helper to
make cleanup pass.

The reviewed client exposes app start, state, action and policy requests. Its
native transport has connection-error handling, but no public scoped filter
disposal method was found in the reviewed client/adapter files. Closing a client
pipe, resetting JS or acknowledging thread archive is not independently observed
filter removal. Native server cleanup remains unqualified. These files were read
as text only; no private native endpoint was invoked.

The official [troubleshooting page](https://learn.chatgpt.com/docs/reference/troubleshooting)
was checked; it supplied no duplicate-key or scoped-filter teardown resolution.
The local incident evidence and exact installed source hashes are the basis of
this investigation, rather than a claim of a documented upstream fix.

## Native cleanup path and subscription boundary

Further static inspection of the same hashed helper found compiled
`AccessibilitySupport.EventTap.startMonitoring`, `stopMonitoring` and destructor
symbols. Exact symbol addresses from nm and bounded ARM64 disassembly show a
conditional call to CFMachPortInvalidate plus stored-reference release in the
stop/destructor paths. The imported CFMachPortInvalidate stub was independently
resolved from the Mach-O indirect-symbol table. This establishes that native
cleanup code exists. It does not show whether connection loss, JS reset or thread
archive reaches that code, or establish the callback/reference ownership that
caused the historical incident. No native method was invoked or patched.

The next causal question is which owner keeps each per-app filter alive and
whether that owner's teardown actually runs. Symbol names or destructor code
alone cannot answer it. Do not convert this into a claim that the historical
helper is fixed: its binary identity was not retained.

The official [app-server lifecycle contract](https://learn.chatgpt.com/docs/app-server#unsubscribe-from-a-loaded-thread)
also rules out unsubscribe as an immediate-cleanup substitute. After its last
subscriber leaves, an inactive thread can remain loaded for 30 minutes before
`thread/closed`; the [SessionEnd documentation](https://learn.chatgpt.com/docs/hooks#sessionend)
likewise says unsubscribe does not end a session immediately. Archive log
persistence, thread unload and native filter release must remain distinct
observations. No hook, new RPC, subscriber change or live app-server operation
was installed or invoked for this finding.

Private evidence: `native-symbols-v2.json`, `eventtap-stop-addressed.txt`,
`eventtap-deinit-addressed.txt`, and `eventtap-cleanup-imports.txt` under the
existing input-investigation directory. The first symbol-display artifact had
truncated labels; v2 explicitly supersedes it. Initial name-based disassembly
lookups failed and remain preserved; only the address-bounded evidence is used.

Taylor supplied the existing remote-Mac setup in chat “theo” and explicitly
authorized its use. The current desktop remains excluded. Remote preparation,
native acquisition, synthetic typing and the shared-client retention experiment
are now recorded separately; they do not rewrite the historical offline proof.

## Reproduced local cleanup defect and correction

The private worker previously tested an English closeSession response with
`includes(' archived.')`. The bridge catches archive errors and includes their
text in that response. An archive refusal containing `synthetic archived. cleanup
refusal` therefore made the actual worker report cleanup success and exit 0.
An isolated fake JSON-RPC backend reproduced this without a model, native helper
or real thread. The failing assertion and log are preserved in
`pressure/input-investigation-20261018/cleanup-regression.json` and
`ambiguous-archive-response.log`.

The worker now requests an explicit strict close receipt from the existing bridge.
Only an acknowledged archive RPC plus mapping removal produces that receipt.
Refusal or lost acknowledgement retains the exact original thread mapping,
reports the archive outcome as unverified, and fails the lease. A disconnected
backend cannot silently skip cleanup. No automatic archive retry or new thread
is introduced. The existing public string close contract is preserved for other
callers. This narrow input-cleanup correction does not resume other parked
Codex-bridge work.

The receipt explicitly says native input release was not assessed. The parent
still performs its independent post-lease filter audit and retains quarantine
on leaks or unavailable observations. The correction prevents false cleanup
claims; it is not proof that native filters are disposed or that the historical
physical duplication defect is repaired.

Focused verification covers success, ordinary refusal, a misleading refusal
containing the success phrase, lost acknowledgement, retained original handles,
legacy close behavior, filter detection and quarantine preservation. Twelve
isolated checks passed. The failing pre-fix case remains preserved separately.
One final complete 191-file isolated suite also passed in 44.9 seconds on source
`5d15b13f439b81452637d44e9b43d93b311c53add202fdf894d77a2a206aa9ac`:
`pressure/v2-2026-10-18T18-58-16-228Z.json`. Runtime/suite/installed Claude
identity remained unchanged during the run. The reviewed bridge and shipped
runtime file hashes were also independently unchanged in final-readback.json;
the Claude runtime fingerprint does not include the sibling bridge source.

The final read-only audit again found zero targeted filters and verified the
existing quarantine file hash unchanged. The loaded MCP still runs fcf484e3,
so it correctly reports restartRequired for the new cleanup build. No native
service renewal or further app restart was requested. Fresh harness/native
evidence remains on its recorded earlier sources; do not relabel it as 5d15.

## Remaining proof before UI recovery can be considered

The native server's scoped filter lifetime still needs direct evidence. A future
authorized native test must bind the exact helper binary/epoch, Claude target,
client/thread identity and tap inventory before acquisition, after reset and
after confirmed thread cleanup, including failure/cancellation. It must verify
the human keyboard independently; synthetic text or archive acknowledgement is
insufficient. The isolated remote fixture now demonstrates that active keyboard
filters can outlive the typing MCP client while another client keeps the helper
alive, including a 15-second settling window. Last-client EOF removed the helper
and filters without a kill. These standalone MCP clients had no actual Codex
turn metadata, and the target was a custom AppKit fixture rather than Claude.
Native host turn-end cleanup, the real Claude target and physical-key behavior
remain separate qualification steps. This desktop stays quarantined.

Until such evidence exists, preserve the working input-free ordinary service,
do not claim unattended all-processes-absent startup, and do not repeat the old
import-only outage test. No native/UI suite was rerun for this correction.

Private current-source identities, quarantine hash and evidence limits are in
`pressure/input-investigation-20261018/investigation.json`.
