# zdr-agent

Kickoff production data that may hold client information goes through this
service, never another tool: Amplitude, BugSnag, PostHog, CloudWatch Lambda
logs, the live production database, call transcripts, and the restricted Slack
channels (#rd-bugs-and-feature-requests, #bugsby-beta, Field Notes).

Asking
- `zdr_ask` runs your question inside the harness and returns only a
  de-identified answer. Include the project, date range and filters. Answers
  can take minutes. Planning a larger piece of work is also just a question.
- The run lives in the harness, not in your tool call. After 9 minutes `zdr_ask`
  returns "Still running" with the `session_id`. That is not a failure and the
  question must not be sent again: call `zdr_read` with `wait_seconds` to
  collect the answer. A follow-up on a busy session is refused for the same
  reason.
- Follow up in the same conversation with the `session_id` from the answer.
  Sessions started in the ZDR Harness app cannot be continued or read here.
- `format: "json"` returns `{answer, figures, filters, withheld}`.
- When an answer says a field was withheld, `zdr_open` shows the full session
  on Taylor's screen. Never try to get withheld data another way.

Sessions
- `zdr_sessions` lists recent sessions with busy or idle state.
- `zdr_read` returns a session's state, question and final answer only.
  `wait_seconds` (at most 540) waits for a running one to finish.
- `zdr_abort` stops a busy session.

Harness resources
- `zdr_status`: health of the server, its data connections, the database
  tunnel and the Terra archive.
- `zdr_exports`: list exports (paths, never contents), archive or unarchive
  them. Hand a file to Taylor as its path plus `open -R "<path>"`. Never open
  or read export files yourself. Deleting exports and releasing fixtures are
  Taylor's, through the `zdr-harness` CLI.
- `zdr_terra`: Terra archive status, or `start` a catch-up run (safe to
  repeat). Query archived data through `zdr_ask`.

Not available here, on purpose: the harness's memory store (it can hold client
detail; ask instead), raw tool output, and anything from the app's analyst
agent.
