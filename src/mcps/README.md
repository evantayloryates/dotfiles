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
| _(none currently)_ | — |

Register a server with Claude Code (user scope, stdio):

```sh
claude mcp add <name> -s user -- node /Users/taylor/dotfiles/src/mcps/<name>/<entry>.mjs
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
