# Changelog

## 2026-11-23.002 (branch ety/bulk-classify-codex-app-server, release 2 candidate)

- The subscription route runs on a private, warm `codex app-server` (official
  CLI, experimental) instead of one `codex exec` per batch: one ephemeral
  thread per batch, 24 at once. On all 3,080 Banking77 test items: 48-51
  items/s against 33 for `codex exec` at 12 (exec at 24 lost 2-4 calls to
  the API key), the same accuracy (87.8-88.7% against 87.3-88.1%), half the
  subscription tokens per item (201 against 382). Plan folder
  `~/src/docs/plans/bulk-classify-app-server`.
- `codex exec` is the fallback, case by case: a failed turn keeps the
  answers it streamed and sends the rest to exec; unanswered items go to
  exec alone; a breaker skips the app-server after three failures and
  probes it again after 30 s (doubling). Usage limit, API-key login and
  unsupported model still end subscription use for the run.
- Health check before any server takes a turn: ChatGPT login (API-key login
  refused), every `config.toml` MCP server disabled by name (`-c
  mcp_servers={}` leaves them on), sandbox read-only, approvals never,
  notify, memories and history off. `classifier app-health`.
- PHI: the engine re-checks before every batch, after acquiring a server and
  before an exec fallback; it refuses in the zdr scope when called directly
  (tests). Routing itself is unchanged.
- `CLASSIFIER_CODEX_ENGINE=exec` restores release 1; new settings
  `CLASSIFIER_CODEX_APP_*` (servers, tier, shape, base, timeout, idle).
- Audit line adds `codex_app_calls` and `codex_app_fallback_items`.

## 2026-11-23.001 (branch ety/bulk-classify-decisions-routing, release candidate)

- Routing hardened (see README "Engines and routing"): the launcher judges
  the caller's environment before anything else, matches harness variable
  names in any case, resolves path-valued variables and `HOME` (trailing
  slash, `..`, symlinks); node resolves paths like the kernel (a symlink
  followed by `..`, dangling links), also checks `HOME`, `TMPDIR` and the
  profiles store, and takes the harness root from the account's own home as
  well as the environment's.
- Profile scopes: one-way `zdr` stamps in an append-only file per profile,
  written before any work in the zdr scope and read fresh on every decision
  and before every Codex call; a failed stamp stops the call. The 14
  existing profiles were scoped by Taylor (9 ZDR-only, 5 general).
- Codex failures are classified from stderr as well, with the CLI's own
  usage-limit and credits wording, and a missing CLI is its own kind; fatal
  kinds end subscription use for the run and its resumes and drop the
  cached login status (now on the monotonic clock). SIGKILL after a
  timeout's grace period.
- A Codex answer that repeats a label written into an injection-shaped
  text gets a Decisions second opinion (`subscription_recheck_items`).
- One routing audit line per call and per job (`audit.jsonl`, codes and
  counts only); the route line in tool output is short (codes plus three
  reasons).
- Harness exports carry `com.kickoff.zdr`; marked inputs (copies too) route
  to the API key. ZDR-only profiles describe as label names outside the
  harness. The harness refuses to start when the classifier is not
  registered directly. Rollback lever `~/.config/classifier/route`.
- MCP lockdown: `codex exec` with `--disable shell_snapshot` and a process
  watch on every call (anything but git under Codex = `unsafe`, fatal); the
  credit reader disables every configured MCP server by name and checks
  `config/read` first.
- Paid-credit watch on the subscription route (`src/lib/credits.mjs`): a
  macOS notification, at most once per job and once per hour, when Codex
  starts drawing paid credits; nothing is blocked.
- Codex defaults from a tuning grid on public Banking77: `gpt-5.6-luna`
  (4-9 points above `gpt-6-luna`), effort low, 50 items per call, 12 calls
  at once (README "Why it is built this way").

## 2026-11-22.001 (branch ety/bulk-classify-decisions-routing, proof of concept)

- Stage two on the API key moves to the Decisions API (`POST /v1/decisions`):
  one choice question per text, a predicate per label for a second label, the
  model's confidence folded into `confidence`. `CLASSIFIER_STAGE2=chat` rolls
  back to chat completions.
- Routing between the API key and Taylor's ChatGPT subscription
  (`src/lib/route.mjs`): any PHI signal (harness scope, harness environment,
  paths under `~/.zdr-harness`, the process chain, job and profile records,
  the `phi` flag) forces the API key, fail closed; everything else runs stage
  two through `codex exec` (`src/lib/codex.mjs`), falling back to the API key
  when Codex fails. New `phi` argument on `classify_texts` / `classify_start`
  (`--phi` in the CLI) and a `classifier route` command.
- Every result line, summary and usage record names its engine and the route
  reasons. Profiles record the scopes that touched them; profiles saved
  before this change use the API key.

## 2026-10-18.001

- Moved into the MCP fleet as `bulk-classify` (formerly the `classifier`
  server inside the ZDR harness). Tool names are unchanged (`classify_*`);
  the server is now registered as `bulk-classify`. The ZDR harness still
  mounts it under its `classifier` key, and the `classifier` CLI still works.
