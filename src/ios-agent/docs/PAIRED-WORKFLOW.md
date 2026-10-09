# Coach/client nutrition round trip — MCP recipe v1

This workflow is ready for synthetic local development. It combines the dated
physical product round trip with new read-only exact-pair persistence checks.
It does not automate product handlers or claim that a database check verifies
either screen. Call `ios_workflow {"action":"plan"}` for the complete ordered
recipe and limitations; this document is available at
`ios-agent://paired-workflow`.

## Start and verify

1. `ios_doctor {}` diagnoses host prerequisites without acquiring the phone.
   If recovery is needed, end your phone lease first, then explicitly call
   `ios_stack_ensure {"timeout":60}`. It never stops/replaces existing workers,
   resets data or changes the selected Docker context. A refused or uncertain
   result means inspect current state; never repeatedly launch it.
   Ownership is rechecked immediately before each worker launch. If another
   owner arrives between launches, further startup is refused; already-started
   workers are preserved. These checks are not an atomic maintenance lock with
   device acquisition.
2. `ios_workflow {"action":"capture"}` resolves a verified non-admin synthetic
   coach and matching client. Optional `clientId` selects a specific tagged
   client. It returns `baselineId` and structural pair IDs. `ios_read` with that
   ID reads the original synthetic target from the private baseline artifact.
   No credential is created. Baselines belong to this MCP connection.
3. Authenticate the coach browser and phone normally using the existing guarded
   helper in WORKFLOWS.md. Verify that both authenticated identities match the
   captured pair. Never infer pairing from persona names. Keep credential files
   private and retire them; this tool does not expose auth tokens.
4. Make one distinct coach UI edit; then call `ios_workflow` with `action=assert`,
   `stage=coach-write`, `baselineId`, and `expected` (the exact synthetic value).
   The receipt revalidates local identity, synthetic tags, all four false admin
   flags and pair membership before comparing the exact persisted row.
5. Acquire the phone once with `ios_begin`; use fresh tree targets and normal
   native input. Independently verify `NutritionSettings` route and the correct
   component/client/value through React inspection. Do not inject cached data.
6. Make one native field replacement and Save. Assert `stage=client-write` and
   the new expected value; reload the coach browser and check its rendered value.
7. Before restoring, assert `stage=pre-restore` with the last test value. Stop on
   a collision. Restore via normal UI, including a blank coach field for null.
   `action=restore-check` compares the original nullable value against a fresh
   row in the same database/pair. Revisit both UIs and verify their rendering.
8. Restore route/network state. `ios_end` in finally must pass native/host idle.
   Record all independent gates; do not call the whole workflow complete from
   persistence receipts alone.

The pre-restore read is not an atomic compare-and-swap. Shared mutations require
an owned fixture/workflow window; if another writer changes it, stop and use the
separately guarded CAS restoration path only when authorized. The MCP never
writes a baseline back, mints tokens, seeds or resets. Lost outcomes are observed,
not replayed. A new connection must capture its own baseline before any edits.

## Evidence scope

The original physical round trip and nullable restoration are recorded in
WORKFLOWS.md. New MCP readbacks independently establish exact local persistence;
they do not prove phone input, browser rendering, auth identity or whole-workflow
cleanup. Each remains an explicit acceptance gate. The host recovery launcher
has warm live proof and adversarial cold-start tests; a shared-stack destructive
restart is neither required nor performed by this recipe.
