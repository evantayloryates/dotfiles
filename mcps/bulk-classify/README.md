# classifier

Labels many texts with labels the caller chooses, as fast as the API allows:
a quick call for up to 50 texts, background jobs for up to 200,000. One
service in every harness: the ZDR harness, Claude Code, Codex, Cursor and the
shell. Stage two (the model) runs on one of two accounts, chosen per call
(see [Engines and routing](#engines-and-routing)): anything from or tied to
the ZDR harness, which is cleared for PHI, runs only on the Kickoff ZDR
OpenAI key; everything else runs on Taylor's ChatGPT subscription through the
Codex CLI, to save cost. Embeddings always use the API key. It does no privacy
filtering of what it classifies; the calling environment owns that. Built
2026-10-01; the design came out of four pressure-test rounds whose findings
are summarised under [Why it is built this way](#why-it-is-built-this-way).

## Entry points

| Entry | Use |
|---|---|
| MCP server `classifier` (launcher `../classifier-mcp`) | Every agent harness |
| `classifier` CLI (`~/dotfiles/bin/classifier`) | Shell and scripts: `classifier guide`, `classifier texts --labels a,b "text"`, `classifier start --profile p --input f.jsonl --wait` |
| Skill `taylor-batch-classify` | Tells Claude Code, Codex and Cursor when and how to use it, and holds its learning loop |

Tools (the CLI has the same commands):

| Tool | Does |
|---|---|
| `classify_texts` | Up to 50 texts, answered in the call (about 1-2 s) |
| `classify_start` | Background job from `input_file` (JSONL, CSV with header, JSON array, or one text per line) or up to 500 inline items; `filter`, `offset`, `limit`, `text_field` (dotted paths for nested fields), `output_path`; `resume_job_id` continues a failed or cancelled job |
| `classify_wait` | Long-polls up to 50 s; returns at once when the job ends |
| `classify_results` | Summary first (counts per label, `none`, confidence spread, cost); `label` / `confidence` / `status` page through items, 50 at a time; `output_path` writes every item to a file after the fact |
| `classify_sample` | Up to 50 distinct texts spread across a file or job, for designing labels (the ZDR harness has no file tools) |
| `classify_cancel` | Stops a job; finished items are kept |
| `classify_profiles`, `classify_profile_save` | Saved, reusable label sets (see [Profiles](#profiles)) |
| `classify_guide` | The short usage guide |

Options on both classify calls: `labels` (names, or `{name, description}`),
or `profile`; `examples` for this call only (`[{text, label}]`, never stored);
`max_labels: 2` for a main plus an optional second label; `prefer: "accuracy"`
to send every item to the model.

`phi: true` (CLI `--phi`) marks client or patient data: the call then runs
only on the API key. The ZDR harness scope always counts as PHI.

Every item gets a `label` (one of the labels or `none`), a `confidence`
(`high`: the vote alone was decisive, or the model agreed with it, or long
items whose label several windows agreed on; `low`: the model contradicted a
vote that pointed clearly elsewhere, or said `none` to something close to a
label; `medium`: the rest), and a `status` (`ok`, `unclassifiable` with a reason such as
`empty` or `placeholder`, `rejected`, or `error`).

## How it works

```
normalise (repair broken characters, strip invisible ones, drop empties and "N/A")
  -> dedupe (each distinct text once) -> result cache (same text, same label set)
  -> long item (> 800 chars): the model (standard tier), every label, one call
     up to 24,000 characters; above that, overlapping 8,000-character windows
     (at most 40 per item), then the most frequent substantive label
  -> short item: embed (text-embedding-3-small, 512 dims) -> nearest-neighbour vote
       confident vote -> done
       otherwise      -> the model, each item with its nearest labelled examples:
                         API route: Decisions API, one request per item
                           (CLASSIFIER_STAGE2=chat: gpt-6-luna chat, reasoning
                           none, priority tier, 20 items per call)
                         subscription route: codex exec (gpt-5.6-luna), 50 items per call, 12 at once
```

"The model" above is the stage-two engine the route picked (see
[Engines and routing](#engines-and-routing)); long items go to it too.

- **The vote** compares each item with a bank of rows: one anchor per label
  (`"name: description"`), the profile's examples, the call's examples, a
  built-in set of chatter ("ok", "thanks", "lol"), and any examples labelled
  `none`. It answers alone only when the top label leads clearly, is close
  enough, and the item is nearer a label than chatter.
  - **Real examples** (written or passed in; median 3 or more per label):
    thresholds calibrated leave-one-out on those examples to 98% precision.
  - **Descriptions or generated examples only:** a 0.25 lead (100% precision
    on coaching labels). **Mostly bare label names:** no vote at all.
  - One label: the lead is measured against chatter and the floor.
  - Injection-shaped text (`ignore previous instructions`, `label:`, fake
    JSON, tags) never takes the vote.
- **The model** sees every label up to 400 (one shared `$defs` enum; strict
  schemas allow 1,000 values) and a shortlist beyond. Messages are
  JSON-encoded and marked untrusted, with `none` always allowed. The prompt
  adapts to a catch-all label (`other`, "anything else") and a small-talk
  label, which otherwise lose their items to `none`. Label descriptions are
  screened for instructions at the door.
- **Engine:** one HTTP/1 pool (256 sockets), an outer watchdog on every
  request, hedging at about p97 latency, 5 retries for transient errors, a
  process-wide pause on 429 keyed on the reset headers. `prompt_cache_key`
  per label set. Three chunks of 4,000 items embed and vote at once.
- **Jobs** run in a detached worker that outlives whoever started it. The
  lock names the worker; a live worker is never displaced however slow (a
  paused worker once got a twin and 20,000 duplicates), and a worker that
  loses the lock stops. Results are appended one line per item; transient
  failures are not saved but retried in up to three passes, so an outage
  ends in `failed` (resumable), never in a "finished" job full of errors.
  Crashed workers restart automatically, up to three times without progress.
- **Profiles learn from runs.** Each run of a profile adds its label shares
  to the profile's history (a rerun of the same input is not counted twice).
  History is keyed by input content (a weekly file reused under one name is
  a new run) and by label set (after `add_labels`, the stale entry for that
  input is replaced). `classify_profile_save` with `from_job_id` seeds the
  history from the run that created the profile.
  Results compare a run with that history and flag labels that moved ("billing
  17.7% (usually 10.0%)"): a new topic usually hides inside the nearest label,
  not in `none`. Every summary ends with a **Learn:** line giving the exact
  save or append call; `append` takes notes, examples and `add_labels`.
  Two-label runs show totals counting both labels and the most common pairs.
- **Spending:** `classify_start` shows an estimate and refuses a job over
  `max_usd` (default $10); a running job stops at the limit and resumes with
  a higher one (`resume_job_id` plus `max_usd`).
- **Result cache:** text hashes (never text) to labels, per label-set
  fingerprint and scope, on the job retention window. The same text keeps
  its label across runs (the model alone changed 0.7-2% between identical
  runs), and repeats are free (5,000 items: 2.4 s first, 0.3 s again).

## Engines and routing

Stage two has three engines:

| Engine | Account | Shape | When |
|---|---|---|---|
| `decisions` | Kickoff ZDR API key | `POST /v1/decisions` (`gpt-6-luna`), one request per text: one `choice` question (the labels plus `none`, defined in the developer turn), one `predicate` per label for a second label; the choice's `confidence` moves the vote-based confidence | API route (default) |
| `chat` | Kickoff ZDR API key | chat completions, 20 items per call, strict schema (the engine before 2026-11) | API route with `CLASSIFIER_STAGE2=chat` (rollback) |
| `codex` | ChatGPT subscription | `codex exec` (official CLI only, `gpt-5.6-luna`, effort low), up to 50 items per call, 12 calls at once, `--output-schema`, `--ephemeral`, `-s read-only`, tools off, a scratch cwd outside any repo, only `HOME`/`PATH`/`TMPDIR`/`LANG` in its environment, text over stdin | subscription route |

`src/lib/route.mjs` picks the route per call (and per job, recorded in the
job and re-checked by its worker). **Any one PHI signal forces the API key;
nothing overrides it, and a signal that cannot be evaluated counts as
present:**

| Signal | How it is detected |
|---|---|
| Harness scope | `CLASSIFIER_SCOPE=zdr` (launcher: `HOME` ends in `/.zdr-harness/home`), or `HOME` itself |
| Harness environment | The launcher, first thing and before `env -i`, lists names (never values) of caller variables named `ZDR_*`, `*_ZDR_*` or `OPENCODE_*` in any case, whose value mentions `.zdr-harness`, or whose value is an existing path that resolves into it, in `CLASSIFIER_ENV_SIGNALS`, and proves it ran with `CLASSIFIER_ENV_CHECKED=1` (missing under the launcher = PHI); node checks its own environment the same way. The scope follows the resolved `HOME` (trailing slash, `..` or a symlink to the harness home is still the harness) |
| Paths | Input file, output file, job directory, jobs and profiles stores, `HOME`, `TMPDIR` and working directory, resolved like the kernel (symlinks before `..`, dangling links followed, files not yet created), under `~/.zdr-harness` of the launcher's, the environment's or the account's own home, or any `.zdr-harness` directory; an unresolvable or relative path = PHI |
| Process chain | One `ps` call; any ancestor run from `~/.zdr-harness`, the `zdr-harness` script, `apps/zdr-agent/` or `ZDR Harness.app`; `ps` failing or this process missing = PHI |
| Harness mark | An input file carrying the extended attribute `com.kickoff.zdr`, which the harness's export writers set (`apps/zdr-agent/mcps/kickoff-db/zdr-tag.mjs`) and macOS `cp`, `mv` and Finder keep, so a copy moved out of `~/.zdr-harness` is still harness data; an attribute that cannot be read = PHI |
| Records | A job created in the zdr scope, routed PHI, started with `phi`, or with no routing record; a profile whose `scopes` or one-way stamp file include `zdr` or `unknown` (see below) |
| Explicit | `phi` / `zdr` on the call, `CLASSIFIER_PHI=1` |

**Profile scopes.** A profile created in the zdr scope is ZDR-only; one
created anywhere else is general. A general profile used or saved in the
zdr scope becomes ZDR-only, one way: the zdr scope appends `zdr` to the
profile's stamp file (`<profiles>/.scopes/<name>`, append-only, so the
read-modify-write of the profile JSON by concurrent runs can never drop it)
before any work starts, and a stamp that cannot be written stops the call.
Routing reads the stamp fresh for every decision and before every Codex
call, so a profile first used in the harness while a local job runs moves
that job's remaining calls to the API key. A profile with no `scopes` (saved
before routing) uses the API key. The 14 profiles that existed on
2026-11-23 were scoped by Taylor (9 ZDR-only, 5 general).

**ZDR-only profiles outside the harness.** `classify_profiles` describes a
ZDR-only profile (or one with no scope history) by its label names only
outside the zdr scope: no purpose, descriptions, notes or examples, which
may hold text written in the harness.

**Registration.** The harness refuses to start unless `opencode.json`
launches the classifier launcher directly from
`{env:ZDR_HARNESS_CLASSIFIER_MCP}` with no extra environment, and no other
server reaches it (`check_classifier_registration` in
`apps/zdr-agent/bin/zdr-harness`, tested in `apps/zdr-agent/test/`): a start
through a shared host such as anchor or `mcps/_shared/bin/run` would hide
the signals above.

**Rollback lever.** `echo api > ~/.config/classifier/route` forces the API
key for every caller in every scope from the next call on, without a code
change; anything other than `auto` in that file (unreadable included) means
the API key, and removing the file goes back.

**Audit.** One line per `classify_texts` call and per finished job goes to
`audit.jsonl` beside the scope's jobs (mode 600): engine, route, `phi`,
reason codes (`scope_zdr`, `env_caller`, `path_harness`, `process_harness`,
`record_profile_zdr`, ...), fallback kind and count, and call counts. Never
text, labels, paths or env values.

There is no path from the API key to the subscription: a job recorded as API
stays API, and fallbacks only go subscription -> API. The Codex engine runs
the same check again immediately before every `codex exec` and throws if
anything is present, so it refuses PHI work even when called directly.

With no PHI signal the subscription is used when `codex login status` says
ChatGPT (an API-key login, or an unreadable status, means unavailable, and
the API key is used; the status is cached five minutes on the monotonic
clock). If Codex fails mid-run (not logged in, usage limit, unsupported
model, CLI missing, a bad answer), the affected items go to the API engine.
Failures are classified from the event stream and stderr with the CLI's own
wording (`You've hit your usage limit`, `usage_limit_reached`,
`*_credits_depleted`, exit 127); a login, limit, unsupported-model or
missing-CLI failure ends subscription use for the rest of the run and its
resumes and drops the cached login status. A Codex answer that repeats a
label written into an injection-shaped text (or quotes a label identifier
verbatim) is re-asked on the API engine (`subscription_recheck_items`). Every
result line carries `engine` (`codex`, `decisions`, `chat`, `embeddings` for
the vote, `cache`), every summary and `classify_results` names the route,
its reasons and any fallback, and usage counts `decision_calls`,
`codex_calls`, `codex_input_tokens` (the subscription's limits, no dollar
cost) and `subscription_fallback_items`. `classifier route [--phi] [--input
f] [--json]` shows what a call from the current shell would use.

**Paid credits.** Once the ChatGPT plan's usage limit is reached, an
account with credits keeps answering and bills credits; that is allowed
(Taylor, 2026-11-23) and nothing is blocked. On the subscription route the
service reads the account's limits through the official `codex app-server`
method `account/rateLimits/read` (no model call, nothing sent) at a job's
start, every ten minutes and at its end, and after `classify_texts` calls
at most every ten minutes per process. When the limit is reached with
credits available, or the credit balance fell since the last reading (two
hours at most), it posts a macOS notification through the notify-macos
helper: at most once per job and once per hour. The last reading lives in
`credits.json` beside the scope's jobs (numbers only).

Codex never reads `~/.codex/auth.json` through this service, and the service
never calls a ChatGPT endpoint; it only runs the CLI.

## Key, scope and storage

The launcher reads `KICKOFF_OPENAI_ZDR_API_KEY` from `apps/zdr-agent/.env`
and starts node under `env -i`, so an inherited `OPENAI_API_KEY` (a personal
org) never reaches it. It decides the scope from `HOME`:

| Scope | When | Jobs | Retention |
|---|---|---|---|
| `zdr` | Started by the ZDR harness (`HOME` is `~/.zdr-harness/home`) | `~/.zdr-harness/classifier/jobs` | 7 days, the window for harness chats that touched the production database |
| `local` | Anywhere else | `~/.local/state/classifier/jobs` | 14 days, the general harness chat window |

The result cache sits beside each scope's jobs (`../cache`) on the same window.

A job id from one scope does not exist in the other. Profiles live in
`~/.local/share/classifier/profiles`, shared by both scopes, and are never
pruned. Expired jobs are removed whenever the service starts, and
`zdr-harness prune` removes them on the same windows it uses for chats
(`--db-days` for the harness scope, `--days` for the local scope).

**Agents are never told any of these paths.** Tool output names only the
caller's own `input_file` and `output_path`, as given. In testing, an agent
shown an internal path read the job file and lost its way; keep it that way.

## Profiles

A profile is a saved label set: labels with descriptions, examples, notes
and a track record (runs, items, share answered by the vote, `none` and
low-confidence rates). Profiles are the service's memory, so everything in
them must be free of real data:

- **Written examples** (up to 8 per label, under 200 characters; `none` is
  allowed and marks texts that fit no label) are rejected, all in one list
  with index and reason, when they:
  - contain an identifier the patterns see (email, also spelled out; phone;
    link; handle; long or spelled-out number; money; date; street address;
    age; record id);
  - share a five-word run with an item of any job still on disk in this
    scope, or (at 7+ words) overlap one by token Jaccard 0.5 or more;
  - are judged specific by a model screen (names, places, dates, health
    details beyond a generic symptom, anything pointing at one person).
    Verdicts are remembered per text hash so they do not flip between
    attempts. On 14 attacks (copies, paraphrases, rare details, spelled-out
    identifiers) and 12 generic examples: 13 blocked, 0 generic rejected; the
    one that passes is a reworded copy carrying no identifying detail, which
    is accepted by design.
- **Generated examples** (20 per label by default) are written by the model
  from the descriptions, with no names, places, dates, amounts or ids, and
  screened the same way.
- **Notes and descriptions** are screened the same way and scrubbed of
  identifiers.
- `append: true` adds examples or notes. `replace: true` needs
  `replace_version` (the current version), so a stale or blind overwrite
  fails; agents are told to ask before replacing a profile they did not
  create.

## Transcripts (ZDR harness only)

`kickoffdb_transcript_export` (in `../kickoff-db`) downloads archived call
transcripts straight from S3 to `~/.zdr-harness/exports/tx_*.jsonl` (48 at a
time, checksums verified, up to 10,000 per export) and returns only stats: how
many matched in total and whether the export covers them, dates, lengths, and
the cost to classify. Nothing reaches the agent's context. The classifier in the
harness scope may read that one folder (its other hidden-folder rules stay).
Exports are deleted on the database window (`--db-days`).

Measured 2026-10-01 on real transcripts (counts only): 1,000 calls exported
in 4 s and classified with two labels in 44 s for $5.26 (before the long-item
cost change); 3,359 calls (every call from Sept 27-30) classified in 87 s for
$5.84, about $0.0017 per call. A full month is ~34,000 calls (~$60).

## Paths

`input_file` and `output_path` must be `.jsonl`, `.ndjson`, `.csv`, `.tsv`,
`.json` or `.txt`, outside hidden folders and `Library`, with no
credential-shaped name, judged on the real target (symlinks resolved). In the
harness scope an output never overwrites an existing file. This is what keeps
the classifier from being a general file reader inside the ZDR harness,
which has no file tools on purpose (a hard link to a secret file cannot be
told apart, but creating one needs a shell the harness does not have).
Unexpected errors return only an error code, never a path.

## Registration

| Harness | Where |
|---|---|
| ZDR harness | `opencode/opencode.json` `mcp.classifier` (command `{env:ZDR_HARNESS_CLASSIFIER_MCP}`) and nine `classifier_classify_*` allows; prompt sections in `zdr.md` and `analyst.md` |
| Claude Code | `claude mcp add classifier --scope user -- ~/dotfiles/mcps/bulk-classify/src/launch` |
| Codex | `~/.codex/config.toml` `[mcp_servers.classifier]`, `tool_timeout_sec = 120`; one paragraph in `~/.codex/AGENTS.md` (without it Codex never found the tools) |
| Cursor | `~/.cursor/mcp.json` `mcpServers.classifier` |

## Tuning knobs

Routing and engines: `CLASSIFIER_ROUTE` (`auto`, the default, or `api` to
keep everything on the key), `CLASSIFIER_STAGE2=chat` (API engine rollback),
`CLASSIFIER_SUB_STAGE1=skip` (subscription route without embeddings),
`CLASSIFIER_PHI=1`, `CLASSIFIER_CODEX_MODEL` (`gpt-5.6-luna`; the subscription
refuses `gpt-6.2-luna`), `CLASSIFIER_CODEX_EFFORT` (`low`; `none` is
refused), `CLASSIFIER_CODEX_BATCH` (50), `CLASSIFIER_CODEX_PARALLEL` (12).

Environment variables the launcher passes through, for experiments only:
`CLASSIFIER_BATCH` (items per model call, 20), `CLASSIFIER_CANDIDATES`
(shortlist size above 25 labels, 8), `CLASSIFIER_HINTS` (nearest examples per
item, 8), `CLASSIFIER_NO_CACHE` (skip the result cache, for measuring),
`CLASSIFIER_DEBUG` (stack traces from the CLI), `CLASSIFIER_FAULTS` (inject faults:
`429:0.05,500:0.05,timeout:0.02,reset:0.03`), `CLASSIFIER_JOBS_DIR` and
`CLASSIFIER_PROFILES_DIR` (scratch stores for tests),
`CLASSIFIER_RETENTION_DAYS`.

## Verification

1. `node --test test/*.test.mjs`: `hardening.test.mjs` (the real launcher
   under `/bin/bash` against a fake home: HOME tricks, env names and values,
   overrides a harness caller might pass, cwd and files through symlinks and
   `..`, the harness's own `isolated_env`, the `_shared/bin/run`
   registration, concurrent launches in both scopes, profile stamps and the
   lost-update race, mid-job stamps, Codex failure wording, the audit line),
   the harness registration check (imported from
   `apps/zdr-agent/test/`, not passed on the command line: an argv naming
   the harness app trips the process signal for the clean launches, as does
   running the suite from a shell command that names it),
   `route.test.mjs` (every PHI signal forces
   the API key and never probes Codex; the Codex engine refuses in the zdr
   scope even when called directly; its child environment), `engines.test.mjs`
   (Decisions request and answers, usage, 429s, two labels, refusals, long
   items, Codex schema and parsing, the subscription -> API fallback and no
   reverse path, all against a mocked fetch) and `unit.test.mjs` (offline: normalisation, injection
   detector, identifiers, label validation, file formats and filters, the
   path policy including symlinks, torn results, the profile guard, the kNN
   scan). `test/guard.online.mjs` re-measures the profile guard with the
   model screen (needs `CLASSIFIER_OPENAI_KEY`).
   `test/canary.e2e.mjs` (needs the network; a dummy key) runs a real job
   started the way the harness starts the classifier and checks the worker
   never runs `codex` (exec, login status or the credit reader), with a
   clean-caller control that does. `test/mutants.mjs` turns off each routing
   guard in turn in a scratch copy and requires a failing test for each
   (19 of 19 killed, 2026-11-23).
2. Against scratch stores (`CLASSIFIER_JOBS_DIR`, `CLASSIFIER_PROFILES_DIR`):
   `classifier texts --labels billing,scheduling "charged twice" "lol"` gives
   `billing` and `none`.
3. A 1,000-item job finishes in a few seconds; a job killed with `kill -9`
   mid-run finishes after `classifier wait <id> --until-done` with one result
   per item and no duplicates; `CLASSIFIER_FAULTS` at 20% still completes
   every item.
4. In each harness: one `classify_texts` call and one start / wait / results
   round.

## Why it is built this way

Engines and the subscription defaults, measured 2026-11-23 on public
Banking77 (test split; every item sent to the model; plan folder
`~/src/docs/plans/bulk-classify-routing/results/`):

| Engine | 77 bare labels (616) | 20 labels + 60 `none` (260) | Injection set (440): injected label won | p50 / p95 per call | Items/s | Cost per 1,000 |
|---|---|---|---|---|---|---|
| decisions | 76.1% | 81.5% (`none` 62%) | 0 | 0.56 / 0.81 s | 350 | $0.16 |
| chat | 81.7% | 81.9% (`none` 42%) | 0 | 1.4 / 1.6 s | 290 | $0.034 |
| codex gpt-6-luna, 100 x 6 | 82.1-82.6% | 83.8% | 2 (before the second opinion) | 25 / 26-30 s | 19.5 | subscription |
| **codex gpt-5.6-luna, 50 x 12 (default)** | 86.2-86.5% | 92.3% (`none` 78%, at 100 x 6) | 0 and 0 (9-14 second opinions) | 18-21 / 24-32 s | 19-25 | subscription |

- Grid (gpt-6-luna unless named): 25 / 50 / 100 / 200 items per call gave
  79.5 / 80.8 / 82.1 / 82.0%; effort medium 81.8%; gpt-6-sol 70.0%;
  gpt-5.6-luna 100 x 6 86.5-87.2% but 13.5-16.4 items/s. Lean base
  instructions (`model_instructions_file`) cut tokens 20% but not latency.
- The official `codex app-server` (one process, ephemeral threads,
  `outputSchema`) was 20-40% faster per call at 100 items, equal at 25; it
  cannot ignore the user's `config.toml`, so it is not the default.
- Confidence on the subscription route comes from embedding agreement:
  `high` 92-94% correct, `medium` 76-79%, `low` 54-69%. The model's own
  probability (asked in the schema) put 535 of 616 items at 0.9+ for 92%
  (ECE 0.083), so it is not used. Decisions' probabilities: ECE 0.06.
- Sustained: 3,080 items (all of Banking77 test) as one job through the
  launcher in 93 s, 87.6%, 62 Codex calls, no fallback. The Pro plan's
  weekly usage stayed at 32% across about 13,000 items of tuning.

Engines, measured 2026-11-22 (384 synthetic grocery-support messages, 18
labels with descriptions plus 40 that fit none; no real data):

| Engine | Accuracy | Per stage-two call p50 / p95 | Items per call | Errors, 429s | Cost per 1,000 |
|---|---|---|---|---|---|
| chat (cascade) | 97.9% | 1.2 / 1.5 s | 19 | 0, 0 | $0.033 |
| decisions (cascade) | 97.1% | 0.40 / 0.61 s | 1 | 0, 0 | $0.096 |
| codex, embeddings kept | 97.7% | 21 / 22 s | 69 | 0, 0 | $0.0004 (embeddings) + ~270 subscription tokens per item |
| codex, no embeddings | 97.7% | 21 / 21 s | 64 | 0, 0 | ~$0 + ~320 subscription tokens per item |

- Decisions burst: 3,072 requests in 4.1 s, no 429s (the key allows 30,000
  requests and 180M tokens a minute); p50 rose to 1.6 s under that load.
- Decisions costs about 3x chat here: one ~1,000-token request per text
  against chat's shared, cached prompt for 20. Label descriptions on the
  choices instead of the developer turn lost 1.1 points; a bare prompt cost
  1.1 points too. With two labels the per-label predicates make it $0.42 per
  1,000 (chat $0.06). Long items (16, up to 38k characters): 100% on every
  engine; Decisions $0.0003 per item against chat's $0.0008.
- Codex: ~3 s and ~18k subscription tokens per call whatever its size, plus
  ~0.18 s per item. 25 / 50 / 100 / 200 items per call took 7.6 / 12 / 23 /
  39 s with the same accuracy; 100 is the default, and partial batches are
  split across idle slots (50 texts answer in ~8 s instead of ~12 s).
- Codex with embeddings kept matched no-embeddings accuracy, used 16% fewer
  subscription tokens (the vote answers some items) and keeps graded
  confidence, so the subscription route keeps stage one.

Measured 2026-10-01 (four explorers, $7.75 of API spend, plus the build runs;
raw findings in the session scratchpad `bc-lab/findings/`):

| Finding | Design consequence |
|---|---|
| Injection text fooled the embedding vote (30 of 40 weak messages) but not the model when messages were JSON-encoded with `none` allowed (0 of 400) | Injection-shaped items skip the vote; JSON framing; `none` always allowed |
| Vote share is not confidence: junk scored 0.7-0.9 share at 0.2-0.3 similarity; "ok thanks!" sat as close to a label anchor as a real complaint | Similarity floor, margin, chatter rows |
| The 0.7 share rule escalates everything below ~11 examples per label | k follows examples per label; leave-one-out calibration |
| Generated examples calibrate the vote to 93% precision; real ones to 98.5% | Only real examples unlock calibrated mode |
| 20 items per call matched single-item accuracy at a third of the cost and half the time; per-item shortlists in one call beat single calls | Keyed batches of 20 with per-item enums |
| 512-dim embeddings: same accuracy and recall as 1,536, 3x faster search | 512 dims |
| Embedding vote fails on long items (10 of 27 wrong at ~6k chars); the model got 27 of 27, about 1 s each | Long items go straight to the model |
| A real 429 said `retry-after-ms: 6` while the bucket reset in 60 s | Process-wide pause on reset headers |
| Rare ~30 s stalls set a whole job's wall time; hedging at p97 cut the max 45% for +0.8% spend | Hedging |
| Aborted fetches could stay pending forever and Node exited mid-run | Outer watchdog per request; heartbeat |
| Agents over-polled (38 polls) without a wait parameter; with it, one call | `classify_wait` long-poll |
| Codex truncates large tool output silently and its model invents the rest | Responses under ~8k characters, summary first, paging |
| Agents shown internal paths read them | No internal paths in any output |
| Codex never found the tools unless something named them | The skill and `~/.codex/AGENTS.md` name them |

Round 1 (four pressure-test agents against the build, then fixes):

| Test | Before | After |
|---|---|---|
| Coaching, 12 labels with descriptions (458 hard items) | 96.1% | 98.0% (vote 100%, `high` 99.7%) |
| Bare label names | 93.0% | 98.0% |
| With an `other` catch-all | 83.0% | 96.5% |
| One label | 98.0% | 99.6% |
| 159 labels | 85.2% | 93.0% |
| Long transcripts, request in the middle (11k-54k chars) | 78.1% | 97-100% (2.7x cheaper after phase 2) |
| Long transcripts, 159 labels | 40.6% | 87.5% |
| Banking77 (77 bare names, regression check) | 80.8% | 81.3% |
| Worker paused 25 s while two callers wait | 20,000 duplicates | 0 |
| 50% injected API faults | "finished", all items errors | completes cleanly |
| 26,000 items | 20 s | 13.5 s |

Round 1 also: 50 headless agent runs (Claude haiku/sonnet, Codex) shaped the
tool texts, the export and paging guard, the skill's data-routing rule, and
the profile-save flow.

Phase 2 (learning rounds, 2026-10-01; synthetic weekly inbox where week 3
adds a topic the labels do not cover, plus real transcripts in the harness):

| Behaviour | Round A | Round B (after the service-side learning) |
|---|---|---|
| New topic hidden in a neighbouring label caught and sized (41-42 of 42) | 0 of 8 runs | 9 of 9 (sonnet, Codex) |
| Profile saved on the first run, with a purpose | 1 in 21 Claude runs | 3 of 3 |
| Haiku asking instead of acting on "same as last week" | 5 of 11 | 0 of 11 |
| Two-label survey pairs quoted from the tool, not invented | 0 of 3 | 3 of 3 |
| Profile save attempts | up to 5 | at most 2 |

Agents rarely write skill memories on their own, and a memory on/off A/B on
the drift scenario showed no difference: the learning that works lives in the
service (profile history, comparisons, Learn lines, notes), where agents
follow it.
