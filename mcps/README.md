# MCP fleet

Every MCP server we run lives here, one folder per server, named by its id.

## Layout

```
mcps/
  _shared/      fleet kernel: protocol server, service runtime, launcher, schema
  _template/    copy this to start a new service
  .archive/     retired services
  <mcp-id>/     one service
```

An id is lowercase kebab-case and starts and ends with a letter or digit, so it
never collides with `_shared`-style utility folders or `.archive`. Name ids from
broad to narrow: `db-kickoff-stage`, `notion-kickoff`.

## Inside a service folder

| Item | Purpose |
|---|---|
| `mcp.json` | Required. Everything the outside world needs: env sources, profiles, harness registrations, daemons, dependencies. Schema: `_shared/mcp.schema.json`. |
| `README.md` | Required. For people. |
| `GUIDE.md` | For agents; served by the `<prefix>guide` tool. |
| `CHANGELOG.md` | Release notes, one `## YYYY-MM-DD.NNN` heading per release, newest first. The source of truth for the version; served by `<prefix>whats_new`. |
| `tools/` | One file per tool, named after the tool, exporting `{ name, description, inputSchema, handler }`. |
| `src/` | Everything specific to this service. Shared helpers go in `src/_shared/`. |
| `migrations/` | `<version>.mjs` per release that moves state forward. |
| `test/` | Tests, with `test/bench/` (benchmarks) and `test/replay/` (recorded calls). |
| `docs/`, `bin/` | Optional: long-form material, and CLIs for people. |
| `package.json` | Only for npm dependencies. |
| `dist/<version>/` | Git-ignored sealed releases. |

Nothing about a service lives outside its folder. Runtime state lives in
`~/.local/state/mcps/<mcp-id>/`, never in the repo.

## Running

Every registration starts a service the same way:

```sh
mcps/_shared/bin/run <mcp-id> [profile]
```

The launcher reads only the env keys `mcp.json` declares, from the sources it
names, then serves `tools/` (or the service's own `entry`).

## Status

Migration from `src/mcps/` and the per-project folders is in progress; see the
CHANGELOG of each service. Migrated: `zdr-agent`.
