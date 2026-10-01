## 1Password — shared Claude and Codex broker

Both harnesses use `/Users/taylor/dotfiles/bin/op`, backed by the same
per-user 1Password CLI Broker. Read
`/Users/taylor/dotfiles/src/onepassword/README.md` for mechanisms and repair.

- Use the absolute wrapper path for credential work. Do not call the Homebrew
  binary directly, create another terminal/tmux authorization session, change
  PATH to bypass the wrapper, or substitute a service account, SDK, native
  credential-request connector or cached token when the broker refuses.
  Browser autofill is a separate route only when Taylor explicitly requests it;
  it is never an implicit fallback for a failed broker lookup.
- Establish account and vault before item access. Pass `--account` explicitly;
  pass `--vault` for item commands, or use a verified `op://<vault>/<item>/<field>`
  reference. Accounts include `my.1password.com` and
  `kudos-fit.1password.com`. A work-named vault may live in the personal account:
  verify ownership rather than deriving the account from the item's name.
- Prefer short `op run` consumers and `op inject` with references. Capture
  `op read` privately only when a script must pass a value directly to its
  intended consumer. Do not print secrets, entire item JSON, environment dumps,
  resolved templates, or secret-bearing stderr into a chat or tool result.
  The wrapper preserves stdout; it does not redact secret output for you.
  Keep secrets out of command arguments, checked-in files and shell tracing.
- Long-running servers must not run inside `op run`: that monopolizes the
  serial broker queue. Resolve only their required fields with short captured
  calls, then launch the server outside the broker; do not persist plaintext.
- Exit 125 means broker unavailable and must fail closed. Report the repair
  hint and repair the shared broker only within authorized scope. Never fall
  back to the direct CLI. Authentication/Touch ID/macOS approval belongs to
  Taylor; do not approve those prompts for him or weaken permissions.
  `op whoami` alone is not proof of failure before an account is authorized.
- For smoke tests, use `--version`, sanitized broker status, scoped metadata
  calls, or the existing synthetic test suite. Verify the actual wrapper and
  broker process. Do not reveal a credential just to prove access. Item writes,
  copies, deletes, exports and credential changes need their own authorization.
