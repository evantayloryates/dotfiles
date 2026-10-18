# Private native helper isolation — October 18, 2026

A private helper served one real Codex typing turn, owned both resulting keyboard
filters, and exited normally after its client closed. A second default helper
and read-only client stayed alive, with no residual filters. This is a remote
diagnostic qualification of an implementation-specific startup path. It is not
yet the production UI-worker path, real Claude proof or physical-input clearance.
Local quarantine remains enabled.

## Startup trace and constraints

The signed helper remains SHA256
`f21c31c0ee5df419dbd165bf76ebd65c64d864c6fec5b6c6c3a23c42ff3d2e13`.
Static ARM64 decoding located the pipe-path key reference at `0x1000253d0`,
targeting its string at `0x1011ce300`. Independent dyld fixups resolve surrounding
selectors to NSProcessInfo.processInfo/environment; resolved imports identify
dictionary bridging, whitespace trimming and Foundation.URL(fileURLWithPath:).
The nonempty override branch precedes the default app-group container branch.
No native helper was run locally. Initial failed direct-pointer translation and
the dyld-corrected labels are retained separately.

The experiment starts the unmodified signed helper as an exact owned remote
child, with a unique socket inside a private mode-0700 test directory. It uses
the current client's `SKY_CUA_SERVICE_NATIVE_PIPE_PATH` implementation setting
on both sides. The helper receives the owned test CODEX_HOME and copied bundled
CLI in its explicit CLI path/PATH. No user credential/config copy, authentication
change, private native RPC or signature change. Public CUA app approval still
uses the existing exact human test grant.

This setting is not documented as a stable public isolation contract. Production
preparation must bind the reviewed runtime/helper, verify socket owner/type,
private parent and child identity, and fail instead of falling back to the shared
socket on uncertainty. Separate CODEX_HOME alone remains insufficient. Diagnostic
guards accept only the owned remote socket pattern, refuse symlinks and require
the current user and private directory mode.

## Preserved experiments

| Remote evidence | Outcome |
| --- | --- |
| `isolated-service-1792353281484.json` | Socket bound to owned helper 2730, but acquisition returned “codex app-server exited before returning a response”. Failed, no typing. |
| `isolated-service-1792353360024.json` | With owned home/copied CLI environment, helper 2820 served read-only acquisition beside default helper 2804, then exited normally on its client EOF. Default client stayed live. |
| `isolated-service-1792353419604.json` | Real ephemeral host typing through helper 2906 passed exact delivery, filter ownership and cleanup while default helper 2890 stayed live. |

The first failure stays failed. The later test changed the owned home/CLI
environment together; it does not isolate which variable caused that failure.

Native run: `run-1792353422299-91d58233`, actual thread
`01a15096-cd02-7392-8c29-30b12b292066`, turn
`01a15096-cd09-7e63-bb52-4808f3777721`. The deterministic localhost provider
requested one acquisition and one 50-character synthetic type operation. The
fixture independently verified count/bytes/hash once and remained unchanged.
Actual native metadata and reviewed Stop hook IDs matched.

Both active options-0/mask-7168 filters belonged to private helper 2906. That
helper exited with code 0 after its host/client closed, without a helper signal
or target-app termination. Immediate and 1.002/5.000/15.001-second inventories
retained only default helper 2890 and zero helper keyboard filters. The default
read-only client remained live. This is a changed ownership condition, not the
prior shared-helper failure relabeled as success.

After default-client release and normal fixture stop, no owned native process
remained; the original four non-helper taps, clean old remote repository0203e604,
and Switchboard/caffeinate PIDs508/510 were unchanged. Helper bytes and credential
file absence were checked. No live native handle or cleanup is pending.

Private mirror:
`.runtime/state/pressure/input-investigation-20261018/native-owner-20261018/isolation-evidence/`.
The manifest verifies31 files/346560 bytes, including failures, source snapshots,
real context, intent/hash, socket ownership, tap inventories and final readback.

## Next production boundary

The [abrupt-owner test](ui-worker-process-ownership.md) now qualifies forced CLI
loss with the default client and fixture retained. The worker's separate backend
group was also corrected and isolated-tested. Next integrate ownership into the existing
private Tier C worker: exact private helper/socket binding, observed child exit
before acknowledgement, independent tap audit, and no shared-helper fallback.
Reuse the existing bridge and leave unrelated Codex work parked. Do not enable
local UI or clear the human quarantine during preparation.

The production worker currently uses the bundled plugin's normal server config.
The diagnostic's explicit MCP environment does not prove plugin workers inherit
this override. Qualify that handoff through the actual worker/configuration path;
do not assume process environment inheritance or add a parallel bridge.

Physical typing, simultaneous active input by another caller, real Claude,
production-worker timeout teardown and unattended cold startup remain unqualified.
No production isolation, universal always-on behavior or full-goal completion
is claimed from this single owned native run.
