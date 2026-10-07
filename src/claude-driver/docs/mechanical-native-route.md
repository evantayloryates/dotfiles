# Deterministic native execution candidate

October 7, 2026, 04:21 Eastern. Candidate research, not a deployed transport.
The broker remains on its existing sealed dependencies and admission hooks.

## What the installed engine actually does

`node src/claude-driver/scripts/hook-contract-v2.mjs` extracts bounded source
windows from the installed Claude CLI and executes its exact MCP hook runner,
input interpolation, file-watcher lifecycle and SDK emission functions with
synthetic dependencies. The installed 2.1.289 contract passed 18 cases in
`<state>/pressure/hook-contract-2026-10-07T08-22-12-618Z.json`. This performed no
desktop IPC, live MCP calls, inference, native writes or settings changes.

The runner calls a connected server's tool directly. There is no model deciding
which tool to select inside that function. It returns actual tool text, charges
connection wait against the execution budget, and reports disconnected, withheld,
deadline, cancellation and tool-error conditions. Its exact input interpolation
recurses through strings, arrays and objects. Connection classification, signal
helper, cgroup release and account-memory policy remain synthetic dependencies.

Four constraints change the deployment strategy:

1. **Activation requires evidence.** The installed watcher initializes once.
   When its initial hook snapshot has no FileChanged/CwdChanged hooks, adding
   settings later neither subscribes it to settings changes nor creates a
   watcher. Calling initialize again while initialized returns immediately.
   An explicit watch-path update can create a watcher. If it already subscribed,
   a settings-change callback disposes it; updates after disposal do nothing
   until a later initialize. Tests exercise this lifecycle, not a live reload.
2. **Observational events do not wait for connection.** FileChanged with a
   pending MCP server returns an error without invoking or waiting. A configured
   hook is not evidence that CCD's internal session server is connected in this
   event context.
3. **No durable duplicate suppression.** Two identical runner invocations make
   two tool calls, and two watcher notifications produce two event invocations.
   A file change is not an exactly-once request transport. Hook order cannot
   substitute for an admission gate.
4. **The usual journal is not a hook receipt channel.** The installed SDK emission
   filter sends SessionStart/Setup hook responses by default; Stop/FileChanged
   need the separate all-events mode. Whether this exact native process enables
   that mode has not been verified. Existing assistant tool-use/checkpoint
   correlation does not collect direct hook calls. A command observer marker
   proves that command ran, not that an adjacent MCP hook succeeded.

The extracted runner contains no call to the existing service PreToolUse
admission implementation. That is a local source observation, not proof that
the entire native host lacks permission checks. Do not route mutations through
it until the actual host path enforces request ownership, expiry, cancellation,
STOP and duplicate admission, and produces a correlated native result.

The installed script-hook implementation explicitly throws that script hooks
are unavailable. Do not propose a script-hook dynamic dispatcher for this build.
The inspected desktop CCD proxy creates in-process SDK servers; the inspected
peer inbox does not route generic SDK control requests. Neither observation
establishes that every possible app API has been exhaustively ruled out.
`desktop-native-route-source-2026-10-07.json` records app versions and the two
inspected chunk hashes; `peer-contract-2026-10-07T08-22-12-959Z.json` preserves
the installed peer dispatch tests.

## Next native proof

The first native probe must be read-only and target only the exact existing
owned broker or fixture. It must have a nonce, a finite deadline, exact PID/start
and CLI-version binding, and durable sanitized evidence. Preserve Stop and
PreToolUse settings and policy hashes. Restore any temporary service settings
byte-for-byte only after checking current ownership; do not overwrite another
writer or a newly armed request.

Establish these separately:

- A real initializer or watch-path update registered the trigger in this native
  epoch. Merely writing settings/trigger files cannot count as activation.
- The event had connected CCD MCP clients and called the intended read tool.
- A genuine native result, including error when applicable, was captured and
  correlated to this probe. A callback marker or unchanged session readback is
  insufficient. Never manufacture an assistant-tool receipt for a hook call.
- Repeated trigger events, disconnection, deadline, cancellation and settings
  restoration preserve the claimed semantics before permitting any mutations.

Do not restart Claude, reset/compact the context, alter permissions/model/auth,
inject keys, create chats or enable broad SDK logging to manufacture the event.
Natural lifecycle events may supply activation, but must be observed. Until an
activation/result channel is proved, an inert live FileChanged installation
would add uncertainty without improving the bridge.

Source extraction is shared with the existing peer contract through
`lib/installed-source.mjs`: bounded small modules or unique marker windows,
source hashes and offsets, regular-file checks, and refusal on ambiguous/missing
markers or binary changes during reading. The corresponding test exercises
chunk-boundary extraction, large-module window fallback and drift refusal.
These are version-specific diagnostics, never supported runtime APIs.

The [official hooks reference](https://code.claude.com/docs/en/hooks#mcp-tool-hook-fields)
describes direct MCP hooks and connection availability. Its
[FileChanged section](https://code.claude.com/docs/en/hooks#filechanged) describes
watch seeding, literal paths and output limits. Installed source/actual native
evidence must decide what this desktop build supports.
