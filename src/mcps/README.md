# Custom MCP servers

Home for small, self-authored MCP servers that live with my dotfiles so they're
versioned, portable, and available on any machine that clones this repo.

## Client registrations and resource use

`client-registrations.json` is the canonical fleet configuration for Gmail,
Cloudinary, Notion and claude-driver. Apply it with
`python3 src/mcps/install-client-registrations.py --apply`, then run
`python3 src/mcps/verify-client-registrations.py`. The installer changes only
managed fields, preserves other servers and private app state, and writes host
files privately. Codex and Claude invocation paths are symlinks to the real files in
`src/mcps/host-config/`. Those real files contain private app state and are ignored
by Git. The shareable registration manifest is versioned; the installer resolves
the symlinks before atomic writes so it preserves the trigger topology.

Notion and Cloudinary upstream packages execute from
`src/mcps/runtime/node_modules`, with exact versions and dependency integrity
recorded in `runtime/package-lock.json`. Reinstall with
`npm ci --prefix src/mcps/runtime --ignore-scripts --no-audit --no-fund`.
Dependencies are ignored generated installations inside the repo; custom launchers,
package manifests, dependency lock and claude-driver source are tracked here.
OAuth credentials and other private runtime state stay outside the tracked tree.
Gmail now executes the focused source fork in `runtime/gmail-fork/`, which preserves
all 21 upstream tools and imports only the Gmail module of Google’s API library.
Its dependency lock and verification benchmark are stored beside the source. The
Gmail launcher loads only its OAuth client secret, rather than exporting the full
dotfiles environment. Existing connected clients retain their old processes until their normal reconnect;
new clients use the local runtime. Do not kill active clients to force migration.

The measured MCP fleet grows primarily by *client count*: each attached client
starts separate stdio runtimes. On October 9 there were about 14 roots each for
Notion, Cloudinary, and claude-driver, plus 28 Gmail roots for two accounts.
Their sampled CPU was almost zero. Playwright MCP had another 14 roots; it was
removed from Codex and the sole Claude project registration on Oct 9. A follow-up
found Claude’s user plugin still enabled and uninstalled it on Oct 10. No
active dependency was found in the inspected dotfiles/Kickoff instructions or MCP registrations. Playwright used
as a test library is separate. For agent browser work, use the harness integrated
browser or installed Chrome computer-use tools. Do not re-register Playwright MCP
or reinstall its plugin as a fallback; Kickoff Playwright E2E tests remain supported. To reduce the remaining footprint, compare
root counts when idle chats close, then prototype a shared local transport for
one client only if the reduction is worth the added lifecycle and isolation
complexity. Preserve active clients and account boundaries during that test.

Each subdirectory is one server. They're intentionally **zero-dependency** where
possible (a single script run by an already-installed runtime like Node), so no
`npm install` / build step is needed after cloning — clone dotfiles and register.

Secrets are **not** stored here. Servers read tokens from the environment
(populated by `~/dotfiles/.env`), so nothing sensitive is committed.

| Server | Purpose |
|--------|---------|
| `amplify-prod-postgres-mcp` | Read-only Postgres MCP over an SSH tunnel to the amplify prod primary. |
| `sca-prod-postgres-mcp` | Read-only Postgres MCP over an SSH tunnel to the SCA prod Aurora **reader**. |
| [`kickoff-stage-db`](kickoff-stage-db/README.md) | Read-only MySQL MCP + CLI for Kickoff's **staging** database over the Tunnelblick VPN (auto-connects it); export to file, quote-aware statement checks (launcher: `kickoff-stage-db-mcp`). Not production. |
| [`../codex-bridge`](../codex-bridge/README.md) | Delegates macOS Computer Use tasks to the local Codex agent over the Codex app-server protocol (launcher: `src/codex-bridge/bin/codex-bridge-mcp`). |
| [`../record-screen`](../record-screen/README.md) | Agent-driven screen recording on an always-on ScreenCaptureKit engine: aim and check frames (images returned inline), scheduled frame-accurate recordings, sessions, marks (launcher: `src/record-screen/bin/record-screen-mcp`; registered in Claude Code and Codex by `record-screen install`). |
| [`../claude-driver`](../claude-driver/README.md) | Drives the Claude desktop app from any harness: create/fork/rename/pin/archive/delete sessions, model/effort/mode, messages, focus-safe navigation (launcher: `src/claude-driver/bin/claude-driver-mcp`; registered in Claude Code, Codex, Cursor and OpenCode by `claude-driver install`). |

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
