# Data Loader package staging

Harness-only tool: `kickoffdb_fixture_package`. No registration in Codex,
Claude Code or other non-ZDR clients. No additional credentials.

1. `create {references:[{table,field,targetTable,nullable?}]}` returns package_id.
2. `put_bundle {package_id,bundle:{bundleId,tables:{table:[{id,...}]}}}` saves
   one complete transformed customer, up to 8 MB. Repeat for ten customers.
   Keep identifiers and content fictionalized coherently inside ZDR. Review
   every source field, including nested identifiers; the tool does not do this.
3. `put_report {package_id,report,content:{...}}` for each of `schema`,
   `transformation`, `loss`, `categories`, `parity`, `privacy` (up to 2 MB each).
   Reports remain sensitive and must include actual limitations and unresolved
   checks. Do not write a raw-to-fictional identity mapping into a release report.
4. `finalize {package_id}` revalidates ten bundles and declared references,
   writes manifest.json with per-file SHA-256 and row counts, and returns its
   hash plus protected path. It always reports released:false and
   privacyCertified:false. That is packaging evidence only.
5. `status {package_id}` returns counts and state without contents. State
   survives MCP restarts. Exact write retries are idempotent; changed files
   require a new package. The package falls under database export retention.

Foreign reference paths support nested objects and array wildcards:
`payload.people.*.clientId`. Missing declared fields fail even when nullable;
nullable permits explicit null. Undeclared references are not checked.

Staging writes are confined to `~/.zdr-harness/exports/fixture-packages/fp_<random>/`
(or the harness's existing protected EXPORT_DIR). Files are mode 600 and
package directories 700. No caller-selected paths, traversal, symlinks,
external network, shell execution or service mutations. Errors contain fixed
codes rather than input data. No automatic reader or exporter outside ZDR.

This unblocks assembling a reviewable package, not HIPAA clearance. Qualified
independent review must cover **all** bundle and report bytes bound to the
manifest hash, source fidelity, rare combinations, chronology, dates and free
text. After clearance and Taylor's transfer authorization, transfer only those
reviewed bytes to `/Users/taylor/Desktop/zdr-dump`.
Never copy the staging tree or raw mappings by default. Do not read staged
customer content in Codex to perform that review.

Existing query truncation limits remain: inspect response truncation and page
SQL reads. Preserve absent/null/zero semantics, actual source row counts and
all historical calls needed for ordinals in parity reports. A declared FK pass
is not evidence that the chosen schema declares all joins or retains sources.

Offline validation (invented data only):

```sh
node --test src/zdr-harness/mcps/kickoff-db/test/fixture-package.test.mjs
```

## Governed release

`release {package_id}` has no path or approval arguments. It requires an
independent operator-written receipt at
`~/.zdr-harness/exports/fixture-approvals/<package_id>.json`, outside the tool's
write scope. The receipt must bind the current manifest hash, every bundle
and report, actual qualified clearance and explicit transfer authorization:

```json
{
  "manifestSha256": "<hash returned by finalize>",
  "destination": "/Users/taylor/Desktop/zdr-dump",
  "method": "qualified-independent-review",
  "clearanceReference": "<real clearance record>",
  "allPackageBytesCleared": true,
  "transferAuthorized": true
}
```

Do not create this receipt based on model assertions alone. It is an operator
attestation of an actual review, not cryptographic proof of that review. The
ZDR model cannot create it using this tool. `release` verifies every file hash
and declared join, snapshots the bytes, copies only manifest/customers/reports
and a release receipt into a new package directory under the fixed destination,
reads back hashes, then atomically renames the directory into place. Existing
releases are never overwritten. No raw contract, source files or mappings are
copied. A missing receipt fails closed. This capability does not itself grant
permission to release any customer data.

## Full preparation workflow

- `fixture_context`: fixed pinned contract, source-shape JSON, GraphQL schema,
  call ordinal/loader source, briefing facts and meal helpers. Page at 16000
  characters maximum. Source hashes identify the snapshot; these are not live
  production schemas. Regenerate with `node build-fixture-context.mjs` from
  the canonical local source paths after reviewed source changes. Generated
  helper modules strip TypeScript only; narrow date-fns/Ramda shims reproduce
  the operations used by the selected pure helpers without dependency on the
  app runtime. No caller-supplied code or file paths are executed/read.
- `fixture_call_number`: exact pinned session grouping and target rules. The
  production mode uses the original loader's filters and parameterized client
  scope, verifies target ownership and fails above 10000 history rows. It
  handles UTC MySQL date strings explicitly. Explicit at is mandatory;
  coach_id is mandatory without a target booking. `rows` plus optional `call`
  computes transformed-history ordinals without database access. Positive
  safe-integer IDs are required to preserve the original helper's type model.
- `fixture_facts`: pure client-local whole-day windows (IANA DST or offset
  hours), Terra start-time local day/reference-date fallback, and original
  manual/auto macro merge. It preserves null and zero behavior from source.
- `fixture_source_page`: read-only SELECT guarded by existing SQL restrictions,
  saved only in protected exports/fixture-source-pages. At most 50 returned
  rows and 2 MB; binary fields and oversized pages fail closed. Cells are not
  clipped. Capture returns count, opaque page_id, hasMore and sensitive:true;
  read pages full JSON text. Use narrow source scopes, deterministic ORDER BY
  and keyset pagination. hasMore reflects the submitted SELECT, so an inner
  LIMIT can still hide additional source records: record source totals and
  use cursors correctly. No model-side regex classification or raw bridge output.

Package operations added for long tasks:

- `list`, `checkpoint {content}`, `resume`: private durable working state;
  checkpoint can retain source IDs and mappings **only inside ZDR**. Release
  never copies checkpoints, chunks, contracts or source pages.
- `add_rows {bundle_id,table,chunk_id,rows}` saves an immutable, exact-retry-safe
  table chunk (1000 rows/2 MB maximum). `seal_bundle {bundle_id}` assembles in
  table/chunk lexical order, validates declared joins and enforces the 8 MB
  final customer limit. Seal only after all tables/references are present.
  Additional chunks for a sealed customer fail. Use fixed-width chunk IDs.
- `put_catalog {bundle}` saves shared catalog tables. References use
  targetScope:"catalog"; other references resolve within each customer.
  Catalog is hashed in the final manifest, reviewed and copied during release.
- `read_bundle`, `read_report`, `read_catalog`, `read_chunk`: sensitive paged
  staged content, available only to the ZDR agents. Never echo through bridge.

The direct analyst now has 240 steps (bridge agent retains 60), with automatic
compaction. More steps are not a guarantee that a rich ten-customer extraction
fits one run; checkpoint every batch and resume the same package as needed.
Privacy/source-parity assertions remain review tasks, not automatic certification.

Pinned reference snapshots and generated helper code live at
`~/.zdr-harness/fixture-context/` (700 directory, 600 files), **outside Git**.
The dotfiles repository is public. Do not publish company source or private
contracts there. `build-fixture-context.mjs` reads only the enumerated local
reference paths and generates hash-bound helpers in that private directory.
After rebuilding references, restart the idle harness to load the helper pins.
Missing references fail these new computations closed; existing database
tools remain available. Reference-dependent offline tests skip on machines
without the private snapshots; package/source-page tests remain standalone.
These reference files contain source definitions, not client exports; database
export pruning does not delete them.

## One-item supplements

`create {references,baseline_package_id}` creates a separate package requiring
exactly one customer. The baseline must be a primary ten-customer package.
Primary contracts, sealed bundles, reports and manifests remain immutable.
Supplement finalization requires the finalized baseline and binds its package
ID and manifest SHA-256 into the supplement manifest. Bundle IDs cannot collide.
Use copied reviewed shared catalogs or bundle-local references: loading order is
released primary first, then released supplement; never merge manifests by hand.

The supplement still requires all six reports and its own independent clearance.
Its approval receipt additionally requires `baselineManifestSha256` matching the
bound baseline and `jointPackageContextCleared:true`, based on actual qualified
review of the added customer and combined context. Release requires the baseline
already released at the fixed destination with the matching manifest hash.
One-item support does not relax the ten-customer primary rule or privacy gate.
