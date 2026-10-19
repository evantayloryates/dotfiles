# Changelog

## 2026-10-18.002

- Adapter 0.20.5. Automatic repairs now run end to end in a worktree:
  `report_bug` still starts a repair by default. The Codex worker fixes and
  commits in `~/src/github/worktrees/dotfiles-smart-record-<ticket>`. The
  supervisor then merges into master, removes the worktree and branch,
  publishes, re-runs the tests and the worker's smoke checks on master,
  rebuilds the engine when its sources changed and smoke-tests the live
  service before Ready for use.
- The report now reaches the worker as `incident.json`; the prompt is fixed
  text. The worker no longer pushes or installs anything itself.
- Every finished attempt sends a macOS notification that opens the ticket's
  `trace.html`. A failed post-merge check files a follow-on ticket
  (`parent_ticket`, at most two generations).
- `test/paired-map.test.mjs` reads the expected adapter version from
  `server.mjs` instead of a stale `0.19.1`.

## 2026-10-18.001

- Moved into the MCP fleet as `mcps/smart-record` (formerly `src/smart-record`).
  Server, CLI, engine and widget sources, builders, repair service and cursor
  renderer are in `src/`; the qualification kit (formerly `qualification/`) is
  `test/`; the long-form agent docs are in `docs/`; the human CLI is
  `bin/smart-record`. The MCP launcher `bin/smart-record-mcp` is now
  `src/launch`, and the server imports the fleet kernel and
  `mcps/codex-bridge/src/lib` directly.
- Claude Code and Codex start it with `mcps/_shared/bin/run smart-record`
  (registration name, tools and Codex `tool_timeout_sec = 3700` unchanged);
  `smart-record install` registers or repoints that form.
- The engine bundle, widget bundle and their LaunchAgents
  (`com.taylor.smart-record`, `com.taylor.smart-record.widget-host`) still
  run from `data/smart-record/`; the engine plist stays in `src/launchd/`.
  Path changes in `src/build.py` change the engine source hash, so the engine
  was rebuilt from the new location with unchanged Swift sources.
- `src/smart-record/` keeps compatibility links for running MCP servers,
  Claude desktop and older docs.
