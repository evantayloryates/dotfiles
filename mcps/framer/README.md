# Shared Framer MCP

`src/mcp.mjs` (started by `mcps/_shared/bin/run framer`) is a zero-dependency MCP stdio adapter. A single
per-user LaunchAgent broker starts at login and restarts if it exits. Both
Codex and Claude connect to its 0600 Unix socket, so their sessions and
verified learnings use the same state. The broker pins the official Framer
Agent CLI to `@framer/agent@0.0.47` in `runtime/package-lock.json`; it does
not run `setup` or write skills. Reinstall with
`npm ci --prefix mcps/framer/src/runtime --ignore-scripts --no-audit --no-fund`.

Install the broker with `python3 mcps/framer/src/install.py`, then apply
the fleet registrations (see `mcps/README.md`).

The tools require an explicit project ID and branch ID for any code execution.
Use `framer_projects`, `framer_branches`, then `framer_select_branch` when the
requested branch is not active. `framer_exec` checks the active branch inside
the same CLI invocation as the code. It never switches branches implicitly.
Prefer Framer Agent APIs for layout edits, read back changes, and publish only
when the user authorized publishing. The CLI stores project credentials; this
broker does not read or persist them.

`framer_learning` records verified, short, non-secret gotchas in
`~/Library/Application Support/taylor-framer/learning.json`. The tracked
`LEARNINGS.md` seeds the shared knowledge from the former skills. Keep
project-specific context in the Framer-generated project inventory and read
the relevant task-map entries before complex design work.

The socket and state directory are accessible only to Taylor's user account.
No TCP listener is exposed. Inspect service health with
`launchctl print gui/$(id -u)/com.taylor.framer-broker` and `framer_status`.
