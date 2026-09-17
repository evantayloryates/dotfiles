# Custom MCP servers

Home for small, self-authored MCP servers that live with my dotfiles so they're
versioned, portable, and available on any machine that clones this repo.

Each subdirectory is one server. They're intentionally **zero-dependency** where
possible (a single script run by an already-installed runtime like Node), so no
`npm install` / build step is needed after cloning — clone dotfiles and register.

Secrets are **not** stored here. Servers read tokens from the environment
(populated by `~/dotfiles/.env`), so nothing sensitive is committed.

| Server | Purpose |
|--------|---------|
| `amplify-prod-postgres-mcp` | Read-only Postgres MCP over an SSH tunnel to the amplify prod primary. |
| `sca-prod-postgres-mcp` | Read-only Postgres MCP over an SSH tunnel to the SCA prod Aurora **reader**. |

Both are launchers, not servers: they open the tunnel, read the DB password from
`.env` at launch, then `exec` the upstream
`@modelcontextprotocol/server-postgres`. Reads are enforced at three layers — a
read-only `fivetran` role, `default_transaction_read_only=on`, and (for SCA) a
physical replica that rejects writes outright.

**Prerequisites**, neither of which is in this repo (it is public):

1. `~/.ssh/spbk-ops.pem`, the bastion key. Without it they fail at the tunnel
   step with `Cannot reach SSH tunnel on 127.0.0.1:<port>`.
2. These keys in `dotfiles/.env` — bastion/RDS endpoints, db names and roles are
   read from there at startup via [`../lib/read-env.sh`](../lib/read-env.sh),
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

They resolve `npx` through [`../lib/resolve-binary.sh`](../lib/resolve-binary.sh)
rather than trusting `PATH`: an MCP server spawned by a GUI app inherits a
minimal environment, and a bare `npx` is not reliably resolvable there. The
resolver takes `NPX_PATH` (set in [`../exports/binaries.sh`](../exports/binaries.sh))
when present, otherwise probes a central list of bin directories.

Register a server with Claude Code (user scope, stdio):

```sh
claude mcp add <name> -s user -- node /Users/taylor/dotfiles/src/mcps/<name>/<entry>.mjs
```

The two Postgres launchers above are registered as:

```sh
claude mcp add amplify-prod-readonly-db -s user --env PGSSLMODE=no-verify \
  -- /bin/bash /Users/taylor/dotfiles/src/mcps/amplify-prod-postgres-mcp
```

## zdr-ask

`zdr-ask-mcp` launches the zero-dependency `zdr-ask/index.mjs` stdio server. It
gives Claude Code and Codex two tools, `zdr_ask` and `zdr_sessions`, that talk to
the local Kickoff ZDR harness on `127.0.0.1:4096`. The harness runs the Amplitude
and BugSnag tool calls on a zero-data-retention OpenAI key and returns only its
final answer, so raw data never enters the calling agent's context. It reads only
`ZDR_HARNESS_PASSWORD`, from `~/.zdr-harness/.env` (not dotfiles `.env`, which is
bridged to every GUI app). See [`../zdr-harness/README.md`](../zdr-harness/README.md).

```sh
claude mcp add zdr-ask -s user -- /Users/taylor/dotfiles/src/mcps/zdr-ask-mcp
codex mcp add zdr-ask -- /Users/taylor/dotfiles/src/mcps/zdr-ask-mcp
```

## Removed

- **`holistics/`** — removed 2026-07-09. Was a zero-dependency wrapper over the
  Holistics v2 REST API (`X-Holistics-Key`, metadata-only: datasets, dashboards).
  **Superseded by Holistics' official hosted MCP**, which — contrary to an earlier
  assumption — works over OAuth even on our legacy `secure.holistics.io` tenant,
  and is strictly more capable (executes AQL/queries, returns rows, and sees the
  4.0-gen reporting layer the v2 REST API can't). Add it directly — no custom
  code, no API key needed. Already registered at **user scope** as `holistics`:

  ```sh
  claude mcp add --transport http holistics \
    https://mcp-apac.holistics.io/reporting/spaceback.com/mcp -s user
  ```

  It runs a one-time browser OAuth flow on first use after launch (dynamic
  client registration + PKCE). Don't rebuild the REST wrapper.

## Kickoff Cloudinary

`kickoff-cloudinary-mcp` launches Cloudinary's official
`@cloudinary/asset-management-mcp@0.11.0` over stdio. It reads only these keys
from the ignored dotfiles `.env`:

- `KICKOFF_CLOUDINARY_TOKEN`: the API **secret**, despite the token name.
- `KICKOFF_CLOUDINARY_API_KEY`: its matching API key.
- `KICKOFF_CLOUDINARY_CLOUD_NAME`: the product environment.

No credential is put in Codex's config or command arguments. The launcher reads
current values on each start, including when a GUI process has an older environment.

```sh
codex mcp add kickoff-cloudinary -- /Users/taylor/dotfiles/src/mcps/kickoff-cloudinary-mcp
```

The key's Cloudinary permissions still apply to every tool. A successful MCP
connection or search count does not guarantee permission to read asset details
or mutate media. Verify the specific operation before claiming it is available.
