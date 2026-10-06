# Claude-driver v2 qualification

V2 is available through the CLI and fresh MCP processes. Native broker controls
passed scoped live qualification on Claude desktop 2.19675.0 / CLI 2.1.286.
Comprehensive qualification remains unfinished: physical typing recovery is
unconfirmed, so automated input, UI recovery and full probes stay quarantined.
This chat's connected MCP still serves legacy `706a338`; use the current CLI
or a fresh connection and verify `apiVersion:2` and `runtimeBuild`.

| Requirement / boundary | Verified evidence | Remaining verification |
|---|---|---|
| Shared CLI/MCP API | Same operation layer; actual Claude Haiku and Codex gpt-6.1-sol headless models each passed all ten filtered fixture checks | Cursor CLI needs human login; actual native desktop callers' handback |
| Fast durable ownership | Latest native submission returned in 3 ms; idempotent reattach produced one job and one recipient reply; real launcher disconnect/reattach/cancel tests | Long-lived production usage; submission latency is separate from recipient latency |
| Cancellation and dispatch | Native cancellation while recipient control lock held dispatched nothing; offline expiry, duplicate pickup/checkpoint and cancellation races | Live app crash/worker loss during native effects |
| Receipts and reconciliation | Exact checkpoint/arguments/tool-result correlation; late receipts reconcile read-only without resend; batched checks regression | Version drift and native journal rotation/restart |
| Steering | Busy tool-free streaming recipient stayed busy after queued delivery; stop verified, replacement reply observed, old completion absent | Active tool-work interruption; native stop preserves existing queued work |
| Concurrent ownership | Three native controls verified; offline independent clients serialize stop/replacement; 12 registry writers and 8 pool claimants retain ownership | Longer sustained native load |
| Recipient identity | Titles/self bind once; read-only late receipt and idempotent reattachment survive rename; original caller self-protection retained | Native cross-harness caller handback |
| Incremental observation | UTF-8/partial records, bounded reads, malformed cursors, transcript identity and pending first-transcript tests | Live rotation/restart; see pool evidence below for fresh-context first reply |
| Pool creation and recycling | Canonical folder aliases, pool-only refusal before fallback, uncertain claims stay reserved; approved-member live lifecycle separately reported | Arbitrary-folder/import creation and permission cards remain outside current scope |
| Service memory | Metadata-only automatic records, private storage, candidates distinguished from evidence, bounded reverse reads, runtime fingerprints | Continued usage and evidence-based promotion |
| Human usability | Prior supported renderer reload and synthetic abc readback; current turn used inventory/reset only | Physical keyboard recovery and duplication root cause |
| Recovery and focus | Quarantine gates before navigation/bootstrap/probes; offline recovery ownership/cooldown/focus tests | Controlled native broker death/restart, focus restoration, import and version drift |

Final deterministic report: `<state>/pressure/v2-2026-10-06T21-31-42-006Z.json`:
59 tests in each of five fresh processes, 295 passed, unchanged runtime/suite
fingerprints. It includes the actual launcher, separate MCP clients, detached
workers and synthetic stores; no desktop operations occur in this tier.

Final native report:
`<state>/pressure/live-v2-2026-10-06T21-31-36-385Z.json`, eight required checks
passed with unchanged source fingerprint, archived scratch fixture cleanup.
Native submission was 3 ms; recipient delivery/reply took 12.548 s. Three
serialized concurrent controls plus unpin took 51.112 s; interrupt/replacement
under concurrent pool load took 41.623 s. These observations show current model
relay latency, not a guaranteed response time. The weak permission-waiting
fixture's earlier six-check pass is explicitly superseded in findings.

Final actual model-driven filtered API reports:
`harness-v2-claude-2026-10-06T21-31-49-397Z.json` (26.902 s) and
`harness-v2-codex-2026-10-06T21-31-50-579Z.json` (24.716 s), both under
`<state>/pressure/`. All ten checks passed: successful required MCP replies,
two identical submissions creating one completed worker, matching recipient,
events cursor and shared candidate memory, unchanged source/global configs.
These are separate from native controls: the filter refuses desktop actions.

Final approved-pool report:
`<state>/pressure/native-pool-v2-2026-10-06T21-32-38-401Z.json`: all three
checks passed on the same source. It claimed an already-approved, cleared
dotfiles member via the symlink folder, observed `POOL_NATIVE_OK` from the
pre-message pending cursor after create returned, restored its original model
and effort, then verified self-clear and archived/parked availability. No
permission raise or task-file/git operation was performed by that fixture.
The earlier receipt-mismatch failure remains retained and reconciled.

`driver_status.nativeQualification` checks the latest native result against
the current source fingerprint and app/CLI versions; source presence or old
reports do not establish current activation. Shared reports and memory live
in `~/.local/state/claude-driver/`; prompts/raw journal data remain private.
Interrupted, preflight-failed and superseded evidence is retained in
`pressure/native-boundary-audit-2026-10-06.json` and is never counted as passing.

Native scoped reproduction uses the existing owned scratch fixture only:

```sh
node src/claude-driver/scripts/live-v2.mjs --live --broker-only \
  --restore-fixture --session local_43202206-acf4-4d89-93e2-8822dc96ca49
```

This refuses a dead/outdated broker, wrong fixture or unblocked UI incident
guard, and never creates/imports/opens sessions, automates input, restarts the
app, or raises permissions. General Codex bridge fixes remain parked.

After physical recovery is confirmed, resume full probe/import/focus and
controlled broker recovery qualification. Avoid restarting the app while
unrelated Claude work is active. Reconcile uncertain effects before replay.
