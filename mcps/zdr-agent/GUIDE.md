# zdr-agent

Kickoff production data that may hold client information goes through this
service, never another tool: Amplitude, BugSnag, PostHog, CloudWatch Lambda
logs, the live production database, call transcripts, and the restricted Slack
channels (#rd-bugs-and-feature-requests, #bugsby-beta).

- `zdr_ask` runs your question inside the ZDR harness and returns only a
  de-identified answer. Include the project, date range and filters. Answers
  can take minutes.
- Follow up in the same conversation by passing the `session_id` from the
  answer. Sessions started in the ZDR Harness app cannot be continued here.
- `format: "json"` returns `{answer, figures, filters, withheld}` when you need
  numbers to compute with.
- When an answer says a field was withheld, call `zdr_open` to show the full
  session on Taylor's screen. Do not try to get the withheld data another way.
- `zdr_sessions` lists recent sessions.

If the harness is unreachable, the error names the command to check it
(`zdr-harness status`).
