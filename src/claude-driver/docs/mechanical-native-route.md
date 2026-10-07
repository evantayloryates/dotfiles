# Deterministic native execution candidate

October 7, 2026, 04:44 Eastern. Native diagnostic read proof, not a public transport.
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
4. **SDK emission and journal persistence differ.** The installed SDK emission
   filter sends SessionStart/Setup hook responses by default; Stop/FileChanged
   need the separate all-events mode. Whether this exact native process enables
   that mode has not been verified. Actual native Stop probes subsequently proved
   that CLI journal `attachment` records preserve genuine hook-success results
   independently of this SDK filter. FileChanged journal persistence is still
   unqualified. Existing assistant tool-use/checkpoint
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

## Actual native read proof

Three bounded temporary Stop probes targeted only the exact existing owned
fixture/broker in the same PID/start epoch. One short no-tools broker turn
triggered each event; fixed hooks selected the MCP tools directly. Core hooks
were preserved and settings/policy restored byte-for-byte. Native versions,
peer nonce, command witness, causal terminal chain and real hook-result
attachments were independently bound. No generic mutation hooks were installed.

- The initial export report `native-hook-export-2026-10-07T08-30-00-721Z.json`
  remains failed because observation omitted metadata attachment ancestry.
  Independent reconciliation `native-hook-export-reconciliation-2026-10-07.json`
  proves the actual native export succeeded and records the captured archive
  hash, with no raw transcript text. The earlier guessed-filename comparison
  was invalid; preserve both original artifacts. Source a66eaecf.
- `native-hook-export-2026-10-07T08-35-35-106Z.json` passed one direct
  get_session read on c74317f0, with actual archived/unpinned fixture metadata.
- `native-hook-export-2026-10-07T08-37-41-302Z.json` passed two distinct
  get_session reads on bbb33c19. About3.6s from probe start included1.5s settings
  wait. Both native results and distinct target identities were verified. One
  model turn triggered the batch; tool execution and collection had no inference.

Both batch attachments share native `toolUseID`: this is the Stop event ID,
now named `hookEventId`, not a unique operation slot. Receipt identity uses each
attachment UUID. Historical reports' `hookRunId` label remains historical data.
The private collector accepts only fixed diagnostic read tools; public causal
observation emits only attachment IDs/parents, never command/stdout/content.
Native hook-error attachments can occur before invocation and do not alone
establish that a tool ran.

Ordinary requests refuse a pending diagnostic before publication. Abandoned
expired probe settings can restore only under the broker lock in their exact
idle intact epoch, without STOP/arm/quiet owner and with matching current bytes.
These recovery boundaries have isolated tests, not live crash/kill injection.
Final5be50395 passed the full isolated suite in
`v2-2026-10-07T08-44-38-415Z.json`; later host guards do not relabel older native
passes as current-source native proof. No temporary probe remains installed.

## Next native proof

The next event-only activation probe must be read-only and target only the exact existing
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
