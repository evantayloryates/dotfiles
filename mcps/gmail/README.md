# gmail

Taylor's personal Gmail accounts. One profile per account: `personal-primary`,
`personal-secondary`, `personal-legacy`, registered as `gmail-<profile>`.

- `src/gmail-fork/` is a focused fork of `gmail-mcp-multiauth` 1.4.6 that keeps
  all 21 upstream tools and imports only the Gmail module of Google's API
  library. Its lockfile and `verify-and-benchmark.py` are beside it; install
  with `npm ci --prefix src/gmail-fork --ignore-scripts --no-audit --no-fund`.
- `src/launch <account>` refuses an account without private OAuth credentials
  in `~/.gmail-mcp-accounts/<account>/`, reads only `PERSONAL_GMAIL_APP_SECRET`
  from dotfiles `.env`, and writes the OAuth client to a private temporary
  file that is removed when the server exits.
- New account or expired sign-in: `bin/auth-gmail-account <account>`.
- Claude desktop still points at `gmail-mcp/run-gmail-mcp`, a symlink to
  `src/launch`. Change its registration only while Claude is quit; the app
  overwrites edits made while it runs.

Formerly `gmail-mcp/` and `src/mcps/runtime/gmail-fork/`.
