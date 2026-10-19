# Changelog

## 2026-10-18.001

- Moved into the MCP fleet as `mcps/claude-driver` (formerly `src/claude-driver`).
  Code is in `src/` (server, CLI, `lib/`, `scripts/`, `candidates/`,
  `broker-template/`, `launch`), docs and tests (with the scenarios in
  `test/scenarios`) at the top level, the human CLI in `bin/`. Claude Code and
  Codex start it with `mcps/_shared/bin/run claude-driver`; the registration
  name and tools are unchanged, and `claude-driver install` now registers that
  command everywhere. The lifecycle LaunchAgent runs
  `src/scripts/lifecycle-monitor.mjs` from here.
- State did not move. `src/claude-driver/.runtime/` (state, sealed releases,
  probe folders used as session working directories, broker and controller
  state) stays at its path: `STATE_DIR` is compared by string to recorded
  service state and every path component is checked for symlinks, so moving it
  would fail closed until every service is re-enrolled. Moving it to
  `~/.local/state/mcps/claude-driver` is separate work.
- `src/claude-driver/` keeps compatibility links (`bin/claude-driver`,
  `bin/claude-driver-mcp`, `server.mjs`, `cli.mjs`, `lib`, `scripts`,
  `candidates`, `broker-template`, `docs`, `README.md`) for running servers,
  Cursor and OpenCode registrations and sessions that call the old CLI path.
- Sealed releases still contain `docs/`: staging copies it from beside `src/`.
- The source fingerprint changed (import paths only), so running servers report
  `runtime_stale` until they reconnect.
