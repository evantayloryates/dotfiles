# Isolated native input investigation

These assets are diagnostic fixtures, outside the shipped driver and the normal
isolated test suite. They do not qualify Claude recovery or physical typing.
The local desktop remains quarantined.

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
