# classifier

Labels many texts with labels the caller chooses, as fast as the API allows:
a quick call for up to 50 texts, background jobs for up to 200,000. One
service in every harness: the ZDR harness, Claude Code, Codex, Cursor and the
shell. It always runs on the Kickoff ZDR OpenAI key. It does no privacy
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
       otherwise      -> the model (gpt-6-luna, reasoning none, priority tier),
                         20 items per call, each with its nearest labelled examples
```

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

## Key, scope and storage

The launcher reads `KICKOFF_OPENAI_ZDR_API_KEY` from `src/zdr-harness/.env`
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
| Claude Code | `claude mcp add classifier --scope user -- ~/dotfiles/src/zdr-harness/mcps/classifier-mcp` |
| Codex | `~/.codex/config.toml` `[mcp_servers.classifier]`, `tool_timeout_sec = 120`; one paragraph in `~/.codex/AGENTS.md` (without it Codex never found the tools) |
| Cursor | `~/.cursor/mcp.json` `mcpServers.classifier` |

## Tuning knobs

Environment variables the launcher passes through, for experiments only:
`CLASSIFIER_BATCH` (items per model call, 20), `CLASSIFIER_CANDIDATES`
(shortlist size above 25 labels, 8), `CLASSIFIER_HINTS` (nearest examples per
item, 8), `CLASSIFIER_NO_CACHE` (skip the result cache, for measuring),
`CLASSIFIER_DEBUG` (stack traces from the CLI), `CLASSIFIER_FAULTS` (inject faults:
`429:0.05,500:0.05,timeout:0.02,reset:0.03`), `CLASSIFIER_JOBS_DIR` and
`CLASSIFIER_PROFILES_DIR` (scratch stores for tests),
`CLASSIFIER_RETENTION_DAYS`.

## Verification

1. `node --test test/unit.test.mjs` (offline: normalisation, injection
   detector, identifiers, label validation, file formats and filters, the
   path policy including symlinks, torn results, the profile guard, the kNN
   scan). `test/guard.online.mjs` re-measures the profile guard with the
   model screen (needs `CLASSIFIER_OPENAI_KEY`).
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
