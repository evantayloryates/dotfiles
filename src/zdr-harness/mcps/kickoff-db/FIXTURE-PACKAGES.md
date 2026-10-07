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
