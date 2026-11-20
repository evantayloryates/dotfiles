# Changelog

## 2026-11-20.001

- Per-account operation. Each call resolves the Claude account it acts for
  (`src/lib/account.mjs`): the op's new `account` argument, env
  `CLAUDE_DRIVER_ACCOUNT`, the store holding the calling desktop session's
  record, else the store with the most recently modified session record.
  `driver_status` and `pool_status` report `account` (with `source`) and
  per-account state (`accounts`, `otherAccounts`, `legacyStateOwner`).
- Scoped to the resolved account: `list_sessions`, session lookups (another
  store's id is refused with `other_account`), sidebar groups, the bypass pool
  (`registry.pools.<accountId>`; claims double-check the member's store), the
  broker (`not_configured_for_account` with the occupant when the broker
  directory belongs to another account) and the ordinary-chat controller
  enrollment (`accounts/<accountId>/session-management-controller.json` for an
  account the legacy file does not belong to). Durable jobs pin the
  submitter's account into the worker's env. No-project scratch folders go in
  the resolved account's scratch tree.
- Migration in place: `accounts/migration.json` names the legacy owner from
  where the broker, controller and pool sessions' records live
  (`1beae0d1-…/cdda5ba2-…` on this Mac); `registry.pool` folded into
  `registry.pools.1beae0d1-…` (pre-migration copy at
  `accounts/registry.pre-account-migration.json`); the broker row retained at
  `accounts/1beae0d1-…/broker.json`. Legacy files are not moved or deleted.
- Running servers report `runtime_stale` and refuse writes until they
  reconnect; their read-only ops keep the old, unscoped behavior.
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
