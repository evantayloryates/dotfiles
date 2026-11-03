# Changelog

## 2026-11-02.001

- `zdr_ask` no longer fails at 5 minutes. It sends the question with the
  harness's async endpoint and polls with short requests, so a long run cannot
  hit fetch's response-headers limit, which was being reported as "not
  reachable".
- After 9 minutes `zdr_ask` returns "Still running" with the `session_id`
  instead of an error. Collect the answer with `zdr_read`.
- `zdr_read` takes `wait_seconds` and reports `state`. It no longer passes
  narration from a running session off as the final answer.
- A follow-up on a busy session is refused rather than queued.

## 2026-10-18.002

- `zdr_read`: the question and final de-identified answer of a past session.
- `zdr_abort`: stop a busy session.
- `zdr_status`: server, connections, database tunnel and Terra archive health.
- `zdr_exports`: list exports with paths (never contents), archive, unarchive.
- `zdr_terra`: Terra archive status, or start a catch-up run.
- `zdr_sessions` now shows busy or idle and the owning agent.

## 2026-10-18.001

- Renamed from zdr-ask and moved into the MCP fleet. Tool names are unchanged
  (`zdr_ask`, `zdr_open`, `zdr_sessions`); the server is now registered as
  `zdr-agent`.
- Added `zdr_guide` and `zdr_whats_new`.
