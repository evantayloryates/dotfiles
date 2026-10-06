# Automatic broker repairs

Taylor authorizes automatic diagnosis, implementation, synthetic pressure tests,
metadata-only smoke tests, safe activation or ready-to-load staging, relevant
agent-documentation updates, git commit/push, and self-archiving after settlement.
Do not ask for another click or send an approval notification for a verified fix.
This does not authorize approving Touch ID/macOS consent, weakening 1Password
permissions, interrupting active commands, or bypassing a quarantined UI.

The alert automatically dispatches diagnosis; it does not request an extra auth
wake. Clicking the notification independently opens 1Password and persists a
keepalive wake. Do not create another auth retry loop in the repair chat.

## Scope and continuity

Keep broker workflow development in the existing maintenance chat. Generated
incidents use `⚙️ fix-1p-broker/<name>` and this directory's matching `<name>`
folder. Reuse an unsettled incident, never reopen a settled incident for a new
episode. Preserve uncertain dispatch receipts for reconciliation; never blindly
replay them or create competing chats. Claude fallback stays subject to quarantine.

Names use America/New_York, including DST, the actual lowercase month (`sept`
for September), two-digit day and a 12-hour number with `a`/`p`. Try the floored
hour first. If occupied and strictly past the half hour, try the rounded-up real
hour (including its date/DST change). Otherwise try the original minute as
`5.17p`. Folder reservation is atomic. If that minute is occupied too, fail
without overwriting or inventing a suffix; a later alert/click can try again.
The full UTC date/year is preserved in incident.json. Existing chat names and
folders reserve a name, even after archive. Do not rename the maintenance chat.

## Evidence and settlement

Store supporting items in the incident's `artifacts/`: sanitized test results,
source/deployed hashes, metadata status, small diagrams or reproduction fixtures.
Never store secrets, raw logs, environment dumps, full vault/account responses,
or sensitive source material. The committed reports are sanitized evidence.

Update README.md and agent-contract.md when behavior or agent guidance changed;
run sync-agent-guidance.py after changing the shared contract. Record what was
reviewed/changed. A settled incident has one of these outcomes:

- `no_change`: a verified conclusion establishes no code change is warranted.
- `applied`: a warranted fix is tested, safely applied and read back as running.
- `staged`: a warranted fix is tested and fully ready for the next service load.
  State the exact safe activation command/trigger and what is still running.
  Do not interrupt active work or restart the broker merely to finish a report.

Unresolved diagnosis, failed verification, or incomplete preparation is not
settled. Do not archive in those cases. Human authentication can remain required
without turning an ordinary app lock into a software fault; say so explicitly.

For a controlled healthy qualification, `authorization_or_unknown` alone is not
failure evidence. Reconcile it with fresh account statuses, deployed hashes and
bounded metadata-only checks; use `no_change` when those establish a healthy
service. Do not manufacture a fault, restart or auth wake to complete the record.

Write `report.json` in the incident directory with these fields (all strings
must be substantive and evidence-backed):

```json
{
  "outcome": "no_change",
  "headline": "Plain-language outcome",
  "summary": "What the user experienced and what this means now",
  "cause": "Technical cause, with uncertainty stated",
  "resolution": "What changed or why none was warranted",
  "verification": "Tests/readbacks, results and evidence filenames",
  "activation": "Running versus staged, and exact next-load trigger if needed",
  "limitations": "Remaining limits or required human action, or None",
  "docs": "Agent documents reviewed and updated, with paths",
  "docsReviewed": true,
  "verified": true,
  "readyForNextLoad": false,
  "artifacts": ["artifacts/verification.json"]
}
```

Use `readyForNextLoad:true` for `staged`. Run:

```sh
node /Users/taylor/dotfiles/src/onepassword/autofix.mjs settle /Users/taylor/dotfiles/src/onepassword/autofixes/<name>
```

The helper checks the declared outcome and supporting files, writes an accessible
standalone summary.html for human and technical readers, a compact summary.md
for agents, and settled.json with evidence hashes. It validates structure, not
the truth of claims: the agent must actually perform and inspect verification.
Review both reports for accuracy and layout before archiving.

Finally commit all changes and push origin/master per repository AGENTS, verify
remote/clean status, then self-archive this generated Codex incident with native
`set_thread_archived(archived:true)` (omit threadId to target this chat). Do not
ask for approval. Use Claude's authorized archive operation only for a Claude
fallback session and only outside quarantine. Report an archive failure accurately
and preserve evidence; never claim success from a settlement marker alone.
