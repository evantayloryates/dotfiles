# notion-kickoff

Kickoff's Notion workspace, through Notion's official
`@notionhq/notion-mcp-server`, pinned in `package.json` with its lockfile.
The token is `KICKOFF_NOTION_PAT` from dotfiles `.env`, handed to the server
as `NOTION_TOKEN`; nothing else from `.env` reaches it.

- Install or upgrade: edit the version in `package.json`, then
  `npm ci --ignore-scripts --no-audit --no-fund` here. Smoke-test before use.
- Run: `mcps/_shared/bin/run notion-kickoff`.
- Codex hides `API-get-users`.

Formerly `src/mcps/kickoff-notion-mcp` (registered as `kickoff-notion`).
