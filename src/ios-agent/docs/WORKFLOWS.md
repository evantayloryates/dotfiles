# Agent acceptance gates and paired local workflow

Status: fixed read-only verifier and the representative physical coach/client
round trip are qualified by the dated acceptance evidence below. The reusable
MCP recipe is in PAIRED-WORKFLOW.md and `ios_workflow action=plan`; it includes
connection-owned baseline capture and independent local persistence/restoration
checks. These checks do not replace either UI's rendering or cleanup gates.
New runs must attach their exact runtime identity and independent live evidence.

## Fixed assertion/wait CLI

The service launcher now exposes these gates as `ios-agent verify <gate>`;
the direct `verify.py` commands below remain equivalent. The verifier does not
acquire, release, run JavaScript, refetch queries, deliver input, run a diagnostic
probe, or change data. The `state` and native `tree` observations use the existing
single-flight broker; `tree` refreshes the driver's target snapshot but delivers
no input. Never reuse that snapshot after its normal five-second lifetime.

```sh
python3 -B /Users/taylor/dotfiles/src/ios-agent/verify.py ready \
  --lease-file '<private>/lease.json' --timeout 30 --output '<private>/ready.json'
python3 -B /Users/taylor/dotfiles/src/ios-agent/verify.py route \
  --expect ClientDashboard --lease-file '<private>/lease.json' \
  --timeout 30 --output '<private>/dashboard.json'
python3 -B /Users/taylor/dotfiles/src/ios-agent/verify.py bundle-source \
  --expect tailnet-Metro --lease-file '<private>/lease.json' \
  --timeout 30 --output '<private>/bundle.json'
python3 -B /Users/taylor/dotfiles/src/ios-agent/verify.py react-tree \
  --lease-file '<private>/lease.json' --timeout 30 --output '<private>/react.json'
python3 -B /Users/taylor/dotfiles/src/ios-agent/verify.py native-tree \
  --lease-file '<private>/lease.json' --timeout 30 --output '<private>/native.json'
python3 -B /Users/taylor/dotfiles/src/ios-agent/verify.py network \
  --lease-file '<private>/lease.json' --timeout 30 --output '<private>/network.json'
# After explicitly releasing this owner's lease:
python3 -B /Users/taylor/dotfiles/src/ios-agent/verify.py idle \
  --timeout 20 --output '<private>/idle.json'
```

Use a real `0700` private directory in place of `<private>`; receipts are created
with `0600`, never overwritten. Lease files must be `0600`, ordinary files rather
than symlinks. `--state` supports isolated test service state. Output contains
only gate status, fixed failure codes, counts, and booleans. No model tree,
component names, props, text, routes, addresses, tokens, or raw provider error
bodies are persisted. A stdout success is only a pointer to the saved receipt.

| Gate | Required observation | Does not establish |
| --- | --- | --- |
| `ready` | Ready plus registered navigation/Apollo and active domain sampled within 3s | Full screen/content correctness |
| `route` | Ready plus exact registered route matching a structural name | Correct user identity or business payload |
| `bundle-source` | Ready plus `tailnet-Metro` or `embedded` | Unique binary/JS identity; record fingerprints separately |
| `native-tree` | Nonempty, untruncated, foreground app-owned tree | System overlays, physical touch fidelity, full accessibility |
| `react-tree` | Fresh ready state, provider connected before/after actual nonempty reconstructed tree, positive component count | Full props/hooks, complete deep tree; requested depth is 8 |
| `network` | Fresh active domain and exact successful fixed GraphQL probe sampled within 3s | Continuous network connectivity; this CLI never schedules a probe |
| `host-idle` | No host lease, running frontend, or pending frontend cleanup | Phone glow or native lease cleared |
| `idle` | Host idle plus connected device reporting native lease/indicator both false | Independent visual observation or offline device cleanup |

To use `network` meaningfully, explicitly invoke the existing fixed
`diagnostics-probe` once in a **fresh lease** before waiting. The domain resets
probe state on lease start. A retained successful probe in a continuing lease
has an increasing age in the protocol; the verifier rejects observations older
than three seconds. Do not advertise continuously verified connectivity from it.

Every active gate is fenced to the starting host epoch, device boot/bundle, and
provided lease; a restart, reboot, collision/revocation, wrong result ID, or
unconfirmed terminal result fails closed. An explicit `command_in_flight`
rejection can wait before admission. An accepted command is never replayed.
Maximum gate time is 120s including IPC reads, with 250ms observation intervals.
A failed gate is not permission to retry input. Preserve unknown outcomes,
inspect state, and course correct with a new owned session only after cleanup.

The caller owns **try/finally release**. This verifier intentionally never ends
someone else's lease. After failure or timeout, release the originating lease,
then use `idle`; if the device is offline use `host-idle` as narrower evidence
and keep native cleanup unknown. If another owner has acquired control, neither
idle gate can pass; do not revoke them to obtain a green receipt.

## Source-derived coach → matching client proof

Prefer a small reversible nutrition-target round trip before broader programs,
messages, billing, or scheduling. It exercises non-admin auth, browser input,
real GraphQL persistence, native navigation/input, shared data and restoration
without external delivery. Synthetic fixture values remain private; final
receipts need only IDs, equality checks, counts and restoration status.

### 1. Establish local provenance and exclusive ownership

Read `/Users/taylor/src/github/kickoff/CLAUDE.md`, especially local database,
non-admin auth, vendor isolation and logging rules. Verify the running GraphQL
process uses this checkout's **exact local MySQL target**; a `.ts.net` phone
endpoint alone cannot prove the database is local. On this laptop use
`KICKOFF_LOCAL_DATABASE_ONLY=1` and the canonical local launcher. Reject inherited
`MODIFIED_URL` and retired remote routing markers. Never dump environment or
connection URLs into evidence.

`node/scripts/lib/dev-access-contract.cjs` supplies `parseDatabaseIdentity`,
`assertLocalIdentity`, and `databaseFingerprint`. The marker is
`_kickoff_local_development.identity`, selected with
`kickoff-local-development-v1`; its instance UUID binds the DB fingerprint.
A marker proves the local instance identity, not that every row is synthetic.
Also prove the specific coach/client/user ownership tags below. Missing marker
means stop; don't provision a marker merely to relabel unknown data as safe.

Use a serial workflow lock tied to this run and DB fingerprint. The shared
`kudos_development` can have other active workflows; never reset it as recovery.
Automated unit/E2E tests use the isolated local `kickoff_test*` environment, not
the development DB. Helpers under `next/test/e2e/` are implementation patterns;
do not run their test harness against a live development schema.

### 2. Resolve the actual paired identities

The non-admin demo coach is `insurance-dietitian@kickoff.local`:

- `node/seeds/coach/index.ts` sets `source=local-demo`, `isAdmin=0`,
  `isSuperAdmin=0`, insurance dietitian active, and creates an eight-client roster.
- The live role assertion must include all four admin flags:
  `isAdmin`, `isSuperAdmin`, `isPayrollAdmin`, `isTopLevelAdmin` are all false.
  Seed source shows only the first two explicitly; don't infer the other two.
- The coach's user must have `demoSource=local-demo`.
- Choose a client with `clients.source=local-demo`, `clients.coachId` exactly
  equal to this coach ID, and a corresponding `users.demoSource=local-demo`.
  Also verify this client's IDs in both authenticated application sessions.

**Do not pair by persona labels.** The dedicated `insurance-client` login
persona uses `demo-insurance-client-no-sync`, but the BASE client template
resolves `DEVELOPER_SUPER_ADMIN`. It is not the insurance-dietitian roster by
name alone. The eight roster entries explicitly override that coach default.

Generate the normal non-admin coach login privately with:

```sh
cd /Users/taylor/src/github/kickoff
yarn --silent dev:login --persona insurance-dietitian \
  --path /dashboard/inbox --json > '<private>/coach-login.json'
```

Set a private umask first. This command can seed a missing full demo cohort; run
only after local provenance and ownership checks, never to repair unknown rows.
Its normal URL exchanges a short token into a real session cookie. Do not paste
the URL/token into public receipts or invent credentials.

Current `dev:login` only accepts fixed personas. The separate
`node/scripts/dev-paired-login.ts` helper now verifies the local marker, all four
false coach-admin flags, ownership tags and exact relationship under a database
transaction. It uses normal `createAuthToken` credentials: single use, 15-minute
expiry. It never seeds, resets or reassigns fixtures. Credentials and the baseline
go only to a new 0600 file in an ordinary 0700 directory; a write/fsync failure
rolls minting back. `DISABLE_LOGS=true` is required. Fifteen adversarial identity
checks, six receipt/transaction lifecycle checks and 24 existing local-access
checks pass (45 total). The helper compiled; a live invalid-client invocation
refused access and left no credential file. A successful live mint independently
verified hashed storage, single use and expiry. Both issued tokens were retired
immediately and the private credential file was removed. The helper gate is separate from the later completed paired product round trip recorded below.

Build with `yarn build:scripts` inside the guarded local node runtime. Invoke
`.webpack/scripts/dev-paired-login.js --client-id <verified-tagged-client-id>
--output <private-new-file>` through `scripts/run-local-development.cjs`, with
`APP_ENV=development`, `KICKOFF_LOCAL_DATABASE_ONLY=1`,
`KICKOFF_SKIP_REMOTE_SECRETS=1`, `DB_DISABLE_SSL=true` and `DISABLE_LOGS=true`.
Use the canonical demo launcher's vendor substitutes; never print raw output or
credential files into routine evidence. Resolve the paired ID by ownership, not
persona label. The helper's coach URL exchanges its short token into the normal
browser session; its client token uses the app's normal sign-in UI. Mobile's
existing `mobile/src/components/auth/auth-token/index.js` demonstrates the
normal token sign-in operation; an installed UI route must be located from its
actual tree before using it. Some legacy navigator imports differ from current
component paths, so source names alone are not a locator or an installed proof.

### 3. Capture a conditional restoration receipt before changing data

Capture privately: database fingerprint, selected client/coach/user IDs,
`target_daily_calories` exact nullable baseline, a version column only if the actual schema has one, and the
starting app route. Choose a distinct harmless synthetic target (for example
2456 if baseline differs). Record the planned changed value and run UUID.

Restoration must preserve a concurrent writer. Prefer saving the original value
through the same authenticated product UI, then read back the exact persisted
baseline. If original value is null and UI cannot represent null, use a scoped
local restoration helper guarded by exact local identity and demo ownership,
with a compare-and-swap predicate on client ID and expected test value (and
expected version/updated timestamp when available). If it doesn't match, stop
and report a collision; never overwrite another agent's newer state. This
restores one field, not all demo fixtures. Don't use `--reset-demo`, reseed the
cohort, or delete unrelated rows for this workflow.

### 4. Browser coach mutation → persisted row → mobile read

Open the normal non-admin session at
`/dashboard/client-list/<paired-client-id>/nutrition/settings`. The existing
`next/test/e2e/tests/coach-client-nutrition-injuries.browser.test.ts` supplies a
representative real-input path: label **Target Daily Calories:** → input → fill
new value → blur. Wait for the `updateClient` response carrying **this exact
client ID and value**, not merely any response with the same operation name.
Read back the selected local row and assert new value once before any retry.
A successful HTTP status alone is insufficient.

On the paired mobile client, acquire a fresh owned lease, verify `ready`,
`react-tree` and `native-tree`. Navigate using fresh native target snapshots to
Nutrition → settings. The committed route is `NutritionSettings`
(`mobile/src/navigators/client-stack/index.js`). Wait on the fixed route gate.
`mobile/src/components/client-nutrition/nutrition-settings/queries.ts` fetches
`getNutritionSettings(clientId)` including `targetDailyCalories`. Inspect only
that component's relevant synthetic value privately and assert equality with
the persisted row. This is real GraphQL and rendering, not a semantic setter.
If cache retains the old value, use the app's normal refresh/revisit path; don't
inject Apollo payloads or call arbitrary eval to make it appear correct.

### 5. Mobile native-input mutation → persisted row → coach read (second gate)

When the first direction passes, optionally test the reverse with another
synthetic value. The actual mobile **Target Daily Caloric Intake:** field opens
an **Edit Target Calories** bottom sheet with a numeric text input and **Save**.
`mobile/src/components/client-nutrition/nutrition-settings/target-calories/index.tsx`
uses `updateClientTargetDailyCalories`; the normal handler is debounced by 200ms.
Deliver text and tap through fresh native snapshots. Do not press Save twice if
its result is uncertain: independently read the row, then wait for UI. Reload
the coach page and assert the new persisted target. Close sheet/keyboard and
restore the initial route.

### 6. Restore and cleanly relinquish the device

Restore the baseline conditionally, read it back from the local row, reload both
surfaces, and verify equality. Release the original lease in `finally`, wait for
`idle`, and verify no frontend cleanup remains. Restore the starting route and
leave network state as found; OS keyboard/system overlays need an independent
check when they matter because the native tree cannot see outside the app.

Evidence should state exact native/JS build fingerprints, DB fingerprint,
non-admin-role check, paired-identity equality, both mutation directions,
restoration result, observed route changes, native input path, lease/indicator
cleanup, and whether USB/Wi-Fi/cellular were present. A displayed build number
is not unique binary identity. Keep an older cellular result separate from the
latest installed build gate.

## Qualified scope and remaining limits

Both paired edit directions, restoration, focused replacement, remote Metro,
USB-unplugged explicit Wi-Fi Off/On, native menu dismissal, and final lease/glow
cleanup passed on the dated installed runtime. See the dated acceptance section
and receipts below. Hardware-keyboard events, composition/IME fidelity,
multi-touch, and system UI remain separate unqualified capabilities. Do not
repeat completed business mutations to diagnose a runtime issue.

## Resume qualification findings

On the installed phone the exact TargetCalories client ID and baseline matched
the guarded non-admin coach pair. A coach UI edit persisted; the original nullable
target was restored through the UI and independently read back. Temporary auth
tokens were retired and private credential files removed. That early batch did not establish changed-value equality after a black screen;
the later current paired acceptance receipt below independently closed equality.
Do not replay that edit to diagnose runtime startup.

`ready` now rejects a prelude-only response: it requires fresh domain sampling,
a registered structural navigation route and available registered Apollo client.
This still does not prove a particular business screen rendered; use a native
visible target plus component props/value assertion for each workflow.

Native action transport can complete while the device rejects a hit target. The
CLI now exits nonzero for that result, preserving its private output receipt.
Never interpret transport completion as input or business success.

Coach tab labels can be lowercase in the DOM with CSS capitalization. Tab changes
can update context before URL routing. Navigate using the rendered settings link
and wait for the actual form, rather than imposing a URL-transition gate on a
context-only tab. The helper route prefix is `client-list`, not `clients`.

## Startup recovery candidate

Remote application startup now has a single 45-second foreground watchdog.
The idle bridge publishes only whether both application adapters are registered;
it reads no routes, queries or payloads outside a lease. A missing registration
causes one bundled reload, first clearing native control and cancelling the host
lease. `state.startupRecovery` labels fallback use. Explicit semantic reload
starts a new remote attempt; automatic retries never loop. Physical fallback acceptance passed: the owned lease was retired, embedded
registered adapters, and Mirroring independently showed the dashboard/glow off. After any native restart, observe a different foreground device boot
before acquiring; a launch receipt alone does not identify the new runtime.

## Current paired acceptance receipt — 8 October

Both directions passed against the exact non-admin synthetic local pair:
coach input 2456 → guarded persisted row → native label and React client props;
phone focused replacement 2345 → one native Save → guarded row → coach reload.
Blank coach input restored the nullable baseline. Returning to normal Nutrition
refetched getClientMealLogs, then reopening goals returned null props and the
recommended 1737 Cal. No cache setter or injected GraphQL response was used.
Home and native idle were restored. A 37-commit React profile covered the actual
workflow; its 118.143s duration includes operator/inspection time and is not a
product latency measure. Slowest observed render was 58.186ms in a Debug build.

`text` defaults to insertion. For an already focused UITextInput, pass
`{"mode":"replace","text":"2345"}` to select its document and deliver normal
UIKeyInput insertion. A delivery receipt does not prove Save or persistence.
Scroll momentum may keep changing geometry after gesture end; respect
`target_geometry_changed`/occlusion rejections. Inspect the settled screen
before a new explicitly targeted action. Never replay an unknown delivery.

`profile-stop` returns the session summary. `profile-report` needs a component
ID; it is not a session-wide summary command. `profile-slow` with limit 5 returned
useful render timings without full app-state export. Keep detailed profiles
private and publish only counts/timing claims bound to the development runtime.


Scoped live recovery, 8 October: paused only the owned ios-agent worker for 35 seconds. The old lease retired, native glow/lease and provider cleanup were verified idle, and a fresh lease reached ready in 1.633 seconds with the same native boot and remote Metro. No input was submitted or replayed during the outage; no live unknown-input outcome is claimed. Actual laptop sleep, radio tailnet loss and controlled shared backend cold restart remain unqualified. Runtime-generation probe observed component refresh and Home with bundleAttempt unchanged at 1; agents must gate on committed route after source edits.
