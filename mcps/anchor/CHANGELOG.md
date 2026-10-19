# Changelog

## 2026-10-19.002

First release: anchor is in real use, registered in Claude Code and Codex
beside the fleet (direct registrations unchanged; anchor becomes the single
front door in a later pass).

- Services: db-kickoff-stage, bulk-classify (sensitive) and notion-kickoff
  (13 read operations), as gateways on stable releases.
- Updates reach a running daemon without restarts: it drains and restarts
  itself when the code on disk changes; open chats follow on their next call.
- Signals: one event stream, a per-service snapshot and
  `anchor:signals {since}` for digests and dashboards.
- Release settings: silent notification alerts; the sandboxed headless fixer
  on the subscription behind the code review gate; gateway services get
  tickets and alerts, never fixers.

## 2026-10-19.001

- Moved into the fleet from the scratch lab (`tmp/anchor-lab`), where it was
  built and tested by the anchor fleet framework grind plan
  (`~/src/docs/plans/anchor-fleet-framework/plan.md`). Not registered in any
  harness. Findings from that work: `docs/FINDINGS.md`.
