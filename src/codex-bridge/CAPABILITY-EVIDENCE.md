# Shared computer-use capability evidence

Native agents and bridge consumers share one local store. This module lives
next to the existing service but does not depend on delegation, app grants,
the app-server, a model turn or native UI. The recorder can consume these
facts and receipts without duplicating app knowledge in its own memory.

Default: `/Users/taylor/.local/state/codex-bridge/capability-evidence/`.
`CODEX_BRIDGE_STATE_DIR` redirects state for isolated qualification. Entries
are immutable JSON files: private directories, 0600 files, canonical content
hashes, fsynced temporary files, atomic no-replace publication. Independent
writers append without a shared read-modify-write index. Failed publication
leaves no visible partial entry. Power-loss recovery is not qualified.

## Access

| MCP tool | Contract |
| --- | --- |
| `computer_use_observe` | Append a reported capability observation. Exact app/OS/provider/display/surface/capture scope, evidence references, limits, observation time and expiry are required. |
| `computer_use_facts` | Read one exact entity key, at most 100 entries. Different versions do not inherit results; future observations are withheld and expired observations are omitted by default. Conflicts are preserved. |
| `computer_use_receipt` | Append an agent-declared contextual action block with intended target, recorder host-clock bounds, result and evidence references. |
| `computer_use_receipts` | Read at most 100 receipts for one explicit session. |

New MCP processes advertise these tools. Existing connected clients may need
reconnection for discovery; this change does not restart their transport.
Native Codex consumers use the evidence tools or standalone CLI directly,
never delegate a model turn to operate themselves.

```sh
node /Users/taylor/src/github/dotfiles/src/codex-bridge/evidence.mjs fact /absolute/observation.json
node /Users/taylor/src/github/dotfiles/src/codex-bridge/evidence.mjs facts /absolute/entity.json
node /Users/taylor/src/github/dotfiles/src/codex-bridge/evidence.mjs receipt /absolute/receipt.json
node /Users/taylor/src/github/dotfiles/src/codex-bridge/evidence.mjs receipts SESSION_ID
```

Use `facts ENTITY.json --expired` to inspect stale observations explicitly.
The schema and runtime validation are in `lib/evidence-tools.mjs` and
`lib/capability-evidence.mjs`. Unknown fields and malformed queries are
rejected even though the small shared MCP server does not validate schemas.
Evidence paths are local references; the service does not fetch their content.
Avoid literal keystrokes, transcripts or arbitrary tool arguments in entries.

Entity dimensions: `bundle_id`, `app_version`, `app_build`, `os_build`,
`provider`, `provider_version`, `surface`, `capture_mode`, `display_profile`.
Use a precise capture-mode value including relevant options. Unknown version
facts must remain explicitly unknown and must not become reusable guarantees.

Receipt bounds are unsigned decimal strings, preserving nanoseconds above
JavaScript's integer precision. Only the recorder's `CLOCK_UPTIME_RAW` domain
is accepted here; callers must sample that qualified clock, not label wall
time or another clock as equivalent. `intent` supports rich context blocks.
A receipt is `caller_claimed`, with ownership explicitly unverified. Combine
it with destination evidence, app/window lifetimes and captured pixels.
Matching time, focus or source PID does not establish exclusive agent identity.
A missing end bound or interrupted action should not be fabricated as success.

## Learning and delivery limits

October 8 seeded two bounded observations (helper exclusion and visible
Chrome native menu) plus the existing declared qualification action block,
then independently read all three back. Observation times use evidence-file
mtime; app/provider versions were reconciled after those same-day tests.
Expiry is seven days. This is explicit evidence accumulation, not automatic
success grading or model training. Capture strategy selection and canaries
must continue to qualify changed versions and uncertain surfaces.

Automatic supported-call receipts, concurrent-user attribution, outcome
observation and historical workflow success auditing remain open. This
module does not intercept native CUA or infer ownership from bridge logs.

## Qualification

```sh
node --test /Users/taylor/src/github/dotfiles/src/codex-bridge/scripts/evidence.test.mjs /Users/taylor/src/github/dotfiles/src/codex-bridge/scripts/evidence-mcp.test.mjs
```

Seven tests cover strict validation, exact-version/expiry/conflict behavior,
session isolation, exact nanoseconds, idempotency with reordered fields,
failed publication, corruption detection, four concurrent writers, MCP
readback/error shapes and target schema discovery. Protocol tests forbid all
child spawning and network connections inside server processes. They do not
invoke bridge status/preflight or delegated computer use.
