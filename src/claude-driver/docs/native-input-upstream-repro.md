# Scoped native input cleanup: upstream reproduction packet

Prepared for review only. No issue, support message or external report has been
sent. Raw evidence stays in the private service state directory.

## Expected contract

A completed or interrupted owned Computer Use turn should have a supported way
to release its native app input resources without ending another client's helper,
quitting the target app, changing permissions or fabricating a person action.
The release result must distinguish receipt of a lifecycle event from actual
native resource cleanup. Another active client must remain usable.

## Observed result

On an isolated macOS 27.0.1 arm64 host, a real ephemeral Codex CLI turn acquired
an owned AppKit fixture and typed one synthetic 50-character string. Independent
fixture counts/bytes/hash verified exact delivery once. Actual Codex native
session/turn metadata was forwarded unchanged by the public MCP relay.

The host's reviewed Stop hook called the packaged `cua_repl.turn_ended` tool with
the same real IDs. That call and the host turn completed without error. With a
second read-only MCP client still connected, two enabled options-0/mask-7168
keyboard filters survived Stop, typing-client EOF and independent 1/5/15-second
observations. Targets were the fixture and ViewBridgeAuxiliary.

Last-client EOF normally removes the helper and filters. In a separate changed
condition, stopping only the disposable fixture also removed both filters while
the same helper and second client stayed alive. No helper kill, native patch,
private RPC, consent bypass or OS permission change was used.

## Exact software and reproduction assets

- Codex desktop: 26.1013.31256/build 20586; copied CLI: 0.163.0-alpha.10.2.
- Helper: 26.1013.1001501/build 1001501, executable SHA256
  `f21c31c0ee5df419dbd165bf76ebd65c64d864c6fec5b6c6c3a23c42ff3d2e13`.
- Sky: 0.7.8; CUA archive: 0.0.30/20261014203459-0849368674e2.
- NodeREPL SHA256:
  `a4bf42e64c504fc436b74e91b3e3588389a868cdc30cd49b41c7a82b26ffe879`.
- Owned harness: `test/remote-input/host-context.mjs`, `native-proxy.mjs`,
  `native-audit.mjs`, `remote-cua.mjs` and `fixture.swift`.
- Exact reviewed Stop definition: `test/remote-input/host-stop-hook.json`, SHA256
  `fbf85b86181f2c7edff5591fb0bdb82a58f88d4666173d46e9b847f14308b017`.
- Settled retention run: `run-1792352517565-ad6e80cb`.
- App-termination boundary run: `run-1792352881902-3c70a408`.

The harness uses a deterministic localhost Responses provider, no inference or
account credentials, and a fresh private CODEX_HOME. Human app and hook review
receipts are required. Preserve the identity/owner guards and review the README;
do not copy a production account or simply execute a report's suggested command.

## Why a wrapper workaround is not established

The bundled plugin already declares Stop/Interrupt/SubagentStop hooks. Adding
another hook duplicates an existing mechanism whose non-error result did not
release these filters. The Mac API reviewed exposes no App release method;
Tab.close is a browser-tab API. Native symbols show app-instance deactivation
and removal, but those compiled methods are not a supported public endpoint.

The native client connects first to a shared per-macOS-user socket. Changing
CODEX_HOME only changes a fallback helper launch selection, so it is not proof
of per-worker helper isolation. No internal service-path override was executed.

## Requested runtime capability or clarification

Provide a supported owner-scoped app release/deactivate API, or make the existing
turn-end path release resources attributed to that turn. Specify behavior for a
second client using the same app and for interruption, disconnection and app
termination. A native receipt plus independent filter inventory should prove
the result without killing shared infrastructure or interfering with another
caller. If filters intentionally persist beyond turns, document their owner,
safe release boundary and physical input guarantees.

This packet does not establish the callback responsible for historical physical
duplicate typing, claim a production Claude reproduction, or assert that every
persistent filter is stale. It establishes the bounded cleanup and isolation
gap above. Local UI remains quarantined pending safe native qualification.

## Later experimental isolation result

The [private-helper prototype](native-helper-isolation.md) subsequently passed a
real owned typing turn: its helper owned both filters and exited normally on
client EOF while the default helper/client stayed live. This is a potential
workaround using the current runtime's implementation setting, not a documented
public release API. Later [combined worker tests](private-ui-service.md) qualify
read-only native completion, owned worker-group loss and pending-provider timeout
with normal helper exit. Supervisor loss, in-flight input cancellation, physical
input and real Claude remain unqualified. Include these findings in any future report;
do not claim that no ownership workaround has been found. This packet is still
prepared only and has not been sent.
