# Actual host turn-end qualification — October 18, 2026

The reviewed Stop hook executes, but it does **not** release the observed native
keyboard filters while a second client remains connected. Do not add another
copy of that hook or treat its success response as cleanup proof. Local UI
recovery remains quarantined. This is a diagnostic finding, not a shipped native
fix or a reproduction of physical duplicate typing.

## Existing foundation

The bundled unified Computer Use plugin already routes Stop, Interrupt and
SubagentStop to `cua_repl.turn_ended`. Reviewed manifest SHA256:
`b6e408092c96217651da2000cdf940d10c8f89b27ffeb0a687e27356640b2fc3`.
The packaged NodeREPL dispatches turn-end handlers best-effort. A literal search
found no `addTurnEndedHandler` registration in the 63 Sky and 307 CUA JavaScript
files inspected. The browser-desktop package was absent. This search alone says
nothing conclusive about the Rust supervisor or native ownership.

Official [hooks documentation](https://learn.chatgpt.com/docs/hooks) describes
hook trust and a one-invocation review override, plus native session/turn
variables. Taylor explicitly approved the exact isolated Stop hook in
`test/remote-input/host-stop-hook.json`; its file SHA256 is
`fbf85b86181f2c7edff5591fb0bdb82a58f88d4666173d46e9b847f14308b017`.
No saved trust entry or configuration outside the private test homes was changed.
Do not reuse this approval for another hook definition or a general-purpose agent.

## Test boundary

Tests run only on Theo Air, in the previously owned private remote workspace.
The copied signed helper remains SHA256 `f21c31c0ee5df419dbd165bf76ebd65c64d864c6fec5b6c6c3a23c42ff3d2e13`.
The actual bundled CLI is `0.163.0-alpha.10.2`; NodeREPL SHA256 is
`a4bf42e64c504fc436b74e91b3e3588389a868cdc30cd49b41c7a82b26ffe879`.

The real CLI/app-server uses fresh private CODEX_HOME directories and an
ephemeral thread. A deterministic localhost Responses provider supplies fixed
output, with no inference, account token or Authorization header. This uses the
documented [custom-provider authentication boundary](https://learn.chatgpt.com/docs/auth)
and [Responses function-call format](https://developers.openai.com/api/reference/resources/responses/methods/create).
The provider can request only the two predefined fixture operations; it never
generates arbitrary code or calls another tool.

A public MCP relay forwards host metadata unchanged to the unmodified packaged
CUA launcher. Its exact fixture acquisition, one synthetic type operation and
Stop call are bound to the same actual native session/turn. The relay accepts
only the existing human test grant for the exact fixture app, low risk and
get_app_state/type_text. Unknown approvals and native privacy prompts fail closed.
No private disposal RPC, fabricated turn metadata, helper patch or helper kill.

## Results

All run names below are beneath the remote workspace's `host-context-20261018/`.

| Run | Result |
| --- | --- |
| `run-1792352049935-2e2df863` and `run-1792352180212-e516605c` | Real app-server turns completed; observer hooks were untrusted and no hook dispatch was observed. |
| `run-1792352228919-376cec40` | Actual CUA MCP catalogue exposed js/js_reset under mcp__cua_repl, without starting the native helper. No CUA operation. |
| `run-1792352273667-633ebec2` | The approved root-level override with app-server still produced no hook event. Preserve as failed hook qualification; do not infer supported flag propagation from CLI exit 0. |
| `run-1792352385189-d749e9f6` | `codex exec --dangerously-bypass-hook-trust` dispatched the harmless observer hook with real IDs. No native input. |
| `run-1792352466782-94517e66` | Actual host typing and Stop dispatch succeeded; filters remained after Stop and host EOF while another read-only client stayed connected. Cleanup result failed. |
| `run-1792352517565-ad6e80cb` | Added independent 1/5/15-second settling observations. Same retention, exact one-attempt text/hash and successful Stop result. Cleanup result failed. |

The settled run's actual thread was `01a15088-fedf-7002-8de1-49b7765c3f27`;
turn `01a15088-fee6-7491-aac3-0464bed9c04c`. The host supplied those IDs in
`x-codex-turn-metadata` for both native operations; the same IDs arrived in the
Stop hook. The CLI JSON independently identifies the thread; its turn ID comes
from the native metadata/hook, not a separately exposed CLI turn-start field.

Helper PID 2429 created two enabled options-0/mask-7168 keyboard filters,
targeting the owned fixture PID 2412 and ViewBridgeAuxiliary PID 431. They were
present before Stop, after its non-error result, after host EOF and at the
independent 1.002/5.002/15.001-second boundaries. The second client stayed alive
through those observations. The fixture independently verified exactly 50
characters/bytes and the intended hash, unchanged during the settling window.
The host itself completed successfully; the diagnostic correctly returned
`ok:false` for failed native cleanup.

Releasing the second client normally removed helper and filters. Its EOF report
passed, and the fixture stopped through its own stop file. Final inventory has
no owned CLI/MCP/helper/fixture process and the original four non-helper taps.
Switchboard/caffeinate PIDs 508/510 and the old remote repository are unchanged.
No credentials copied; no local CUA initialized. A final signature check first
used the wrong Contents directory and failed; the retained correction verifies
the exact app bundle successfully, with unchanged executable hash.

## Durable evidence and next step

Private mirror:
`.runtime/state/pressure/input-investigation-20261018/host-turn-end-20261018/`.
It includes static inspection, exact hook source, per-run harness snapshots,
actual context and hook receipts, fixture intent/hash, tap inventories and failed
outcomes. `remote-evidence/manifest.json` verifies 42 files (392773 bytes);
`signature-correction.json` preserves the corrected signature target separately.
The settled orchestration records both clients alive around the test and their
normal cleanup. No live handle or human prompt remains pending.

This removes missing host metadata and missing Stop dispatch as explanations for
this test's retention. It does not identify the historical duplicate-key callback
or prove that a dedicated helper can be isolated safely. Next inspect the native
per-app owner/reference lifetime and the supported helper-instance boundary,
before proposing an ownership fix or a dedicated-worker architecture. Any later
native test needs a changed, reviewable hypothesis. Physical typing and real
Claude qualification remain separate gates. Do not repeat this unchanged test,
disable local quarantine, kill shared helpers or claim the full goal complete.
