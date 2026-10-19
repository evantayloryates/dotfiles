# db-sca-prod

Read-only Postgres MCP over an SSH tunnel to the SCA prod Aurora **reader**. `src/launch` opens
the tunnel, reads the connection settings and password from dotfiles `.env`,
then `exec`s the upstream `@modelcontextprotocol/server-postgres`.

The launcher is not a server: it open the tunnel, read the DB password from
`.env` at launch, then `exec` the upstream
`@modelcontextprotocol/server-postgres`. Reads are enforced at three layers — a
read-only `fivetran` role, `default_transaction_read_only=on`, and (for SCA) a
physical replica that rejects writes outright.

**Prerequisites**, neither of which is in this repo (it is public):

1. `~/.ssh/spbk-ops.pem`, the bastion key. Without it they fail at the tunnel
   step with `Cannot reach SSH tunnel on 127.0.0.1:<port>`.
2. These keys in `dotfiles/.env` — bastion/RDS endpoints, db names and roles are
   read from there at startup via [`../../src/lib/read-env.sh`](../../src/lib/read-env.sh),
   which names the keys it wants rather than sourcing the whole file, so the
   `exec`d server never inherits unrelated secrets:

   ```
   SPBK_BASTION_HOST            SPBK_BASTION_USER
   AMPLIFY_PROD_DB_HOST         AMPLIFY_PROD_DB_NAME         AMPLIFY_PROD_DB_USER
   SCA_PROD_DB_HOST             SCA_PROD_DB_NAME             SCA_PROD_DB_USER
   READ_ONLY_FIVETRAN_PROD_DB_PASSWORD
   SCA_READ_ONLY_FIVETRAN_PROD_DB_PASSWORD
   ```

   A missing key fails loudly at launch rather than surfacing as a confusing
   connection error.

They resolve `npx` through [`../../src/lib/resolve-binary.sh`](../../src/lib/resolve-binary.sh)
rather than trusting `PATH`: an MCP server spawned by a GUI app inherits a
minimal environment, and a bare `npx` is not reliably resolvable there. The
resolver takes `NPX_PATH` (set in [`../../src/exports/binaries.sh`](../../src/exports/binaries.sh))
when present, otherwise probes a central list of bin directories.


Registered in Codex only, disabled. Scheduled for `mcps/.archive/`.
