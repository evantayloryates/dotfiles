# kickoff-stage-db

Read-only access to Kickoff's **staging** database (`kudos_staging`) for
Claude Code, Codex and the shell. **Not production.**

Staging is a production copy restored about 2025-02-26, plus everything
staging has done since: QA accounts, test sign-ups and the migrations deployed
from `develop`. Kickoff's CEO cleared it for use outside the ZDR harness on
2026-10-06. A count-only check that day, compared against production through
the ZDR harness, found staging holds almost none of the insurance business:
its insurance clients are nearly all staging test sign-ups.

Which database answers what:

| Question | Where |
|---|---|
| Schema, migrations, indexes and plans at real volume; staging QA state; joins and definitions before writing code | **this server** |
| Production-shaped counts, distributions, joins | Kickoff Sanitized DB (`kickoff_database_query`) |
| Live production rows, free text, transcripts | `zdr_ask` (the ZDR harness) |
| Tests, migrations, seeds, a running app | local MySQL only, never this |

The skills `taylor-graphql` (global) and `taylor-graphql-kickoff` (in
`~/.claude/skills`, linked into Codex and Cursor) teach agents when and how to
use it.

## Tools

| Tool | What it does |
|---|---|
| `stage_guide` | What staging holds, the routing above, core tables, definitions and limits |
| `stage_tables` | Tables with approximate rows; `like` on the name, `column_like` finds tables having a column |
| `stage_describe` | Columns, indexes and foreign keys for up to 10 tables; `column_like` trims wide tables |
| `stage_query` | One read statement with `?` placeholders (`params`); `output_path` streams the full result to a file |
| `stage_status` | VPN state, user, read-only check, latency, newest migration |

Answers are compact: a column list, then one JSON array per row. Defaults are
100 rows (`limit` up to 1000), 500 characters per cell (`max_cell_chars` up to
5000), about 100 KB per answer, and 30 s per statement (`timeout_seconds` up to
120). Beyond that, `output_path` (an absolute `.csv`, `.tsv` or `.jsonl`
path) streams up to 5,000,000 rows to a file. The file is mode 600, is written
atomically, and its path is refused inside a git work tree unless git ignores
it. The answer is the count, the columns and three sample rows. A slow query
gets a one-line plan note after the fact. A timeout explains which full scan
caused it.

The same operations run from a shell:

```sh
kickoff-stage-db status
kickoff-stage-db query "SELECT status, COUNT(*) FROM clients GROUP BY status"
kickoff-stage-db query "SELECT id, coach_id FROM clients WHERE signed_up >= ?" --param 2026-01-01 --out ~/Downloads/c.csv
kickoff-stage-db describe clients --column-like %insurance%
```

## Walls

1. **The credential.** MySQL user `kickoff_stage_ro`, created 2026-10-06 with
   the staging master user. It has `SELECT, SHOW VIEW ON kudos_staging.*` only,
   `REQUIRE SSL` and 12 connections at most. Verified that day: temporary
   tables, `UPDATE`, `mysql.user` and `INTO OUTFILE` are all refused.
2. **The session.** `transaction_read_only = ON`, plus `MAX_EXECUTION_TIME`
   per statement.
3. **This server.**
   - One statement per call.
   - Only `SELECT`/`WITH`/`SHOW`/`EXPLAIN`/`DESCRIBE`/`TABLE`/`VALUES`.
   - Writes hidden behind `WITH`, locking reads, `SLEEP`, `BENCHMARK`, `GET_LOCK`, `LOAD_FILE` and executable comments are refused by name.
   - Comments are stripped by a quote-aware scanner, so what runs is what was checked. Optimizer hints are dropped, because they can lift time limits.
   - Rows stream and are cut off at the cap.
   - The server refuses a URL whose database is not a staging one, or that names production.
4. **Logs** hold a 12-character hash and the statement's shape, with literals
   replaced by `?`.

## Network: the VPN, sleep, reboots

Staging is private, and this Mac reaches it over Tunnelblick configuration
`taylor-vpn`. That is a split tunnel routing only the staging VPC, so other
traffic is unaffected. The server makes the VPN a non-event:

- After 30 quiet seconds it checks the VPN before connecting, which costs
  about 0.1 s. If the VPN is down it connects it, launching Tunnelblick if
  needed (after a reboot, for example), instead of waiting out an 8 s
  connect timeout.
- A pooled connection that has sat idle for 15 s is pinged before use. A
  socket left over from a sleep or a VPN drop is replaced, not hung on.
- While a statement is silent, the server checks the VPN every 3 s. If the
  tunnel closes, it reconnects and runs the statement once more (reads are
  safe to repeat).
- Silence while the route is healthy means a slow statement, not a dead
  socket. The server kills the statement on the server and says so; it never
  reruns it.

Measured 2026-10-06:

| Case | Recovery |
|---|---|
| VPN disconnected between calls | about 16 s |
| Tunnelblick quit, then a fresh server | about 13 s |
| VPN dropped mid-query | about 16 s, correct answer |

Most of that time is Tunnelblick's own connect, about 5.6 s.

Set `KICKOFF_STAGE_DB_VPN_AUTOCONNECT=0` in dotfiles `.env` to turn
auto-connect off, or set `KICKOFF_STAGE_DB_VPN` to use another configuration
name. If macOS has not let the calling app control Tunnelblick, the error
names the Automation setting.

## Setup

Most of this is already done on Taylor's Mac.

1. `npm i --prefix ~/.local/share/kickoff-stage-db mysql2@3.24.4`
2. `KICKOFF_STAGE_DB_URL` in dotfiles `.env`. The source of truth is
   1Password: personal account, Kickoff vault, "Kickoff Stage DB (read-only
   MCP)", field `KICKOFF_STAGE_DB_URL`.
3. Register it:

   ```sh
   claude mcp add kickoff-stage-db -s user -- /Users/taylor/dotfiles/src/mcps/kickoff-stage-db-mcp
   ```

   Codex (`~/.codex/config.toml`):

   ```toml
   [mcp_servers.kickoff-stage-db]
   command = "/Users/taylor/dotfiles/src/mcps/kickoff-stage-db-mcp"
   startup_timeout_sec = 20.0
   tool_timeout_sec = 330.0
   ```

4. Add the CLI to the shell:

   ```sh
   ln -s /Users/taylor/dotfiles/src/mcps/kickoff-stage-db-mcp ~/.local/bin/kickoff-stage-db
   ```

The launcher reads only its three keys from `.env` and starts node with a
clean environment. A missing URL reaches the agent as a tool error that names
the fix, rather than a server that silently fails to start. **Never debug it
with `bash -x`**: xtrace prints the URL, password included.

## Rotating the password

As the user itself (no admin needed): `ALTER USER USER() IDENTIFIED BY '<new>'`.
Then:

1. Update the 1Password item's `password` and `KICKOFF_STAGE_DB_URL` fields
   with `op item edit --template` so the value stays out of argv.
2. Update dotfiles `.env` with `src/zdr-harness/set-env-value.py`.

Last rotated 2026-10-06. If staging is rebuilt from a new snapshot, the user is
gone (or carries production's grants table) and must be created again; the
error says the password was rejected.

## Tests

```sh
node --test src/mcps/kickoff-stage-db/test/unit.test.mjs   # statement checks, formats (offline)
node src/mcps/kickoff-stage-db/test/online.mjs             # live: 19 cases through the launcher over MCP stdio
node src/mcps/kickoff-stage-db/test/online.mjs --vpn       # + disconnects the VPN and quits Tunnelblick to prove recovery
```
