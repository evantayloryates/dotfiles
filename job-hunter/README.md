# Job Hunter

Job Hunter is a local, explainable job-discovery pipeline. It keeps companies, canonical jobs, and source-specific postings separate in validated JSONL files, then generates a static read-only dashboard.

## Commands

Run from `/Users/taylor/dotfiles/job-hunter`:

```bash
./bin/job-hunter doctor
./bin/job-hunter ingest --dry-run
./bin/job-hunter ingest --gmail-batch 10
./bin/job-hunter validate
./bin/job-hunter dashboard
./bin/job-hunter search "agentic frontend"
./bin/job-hunter status <job-id> interested
./bin/job-hunter sources
```

`ingest --dry-run` performs fetch, normalization, and deduplication in memory without canonical writes, cursor changes, or Gmail mutations. The Gmail source launches the existing personal Gmail MCP over stdio. A Gmail message retains `Ingest::Jobs` if parsing, API access, or persistence fails; acknowledgments happen only after canonical JSONL and the run checkpoint are durable.

For a bounded proving run, `--max-per-source N` limits processing without advancing a truncated source cursor. It is intended for controlled validation, not the steady-state manual command.

## Data and privacy

Machine-local data, minimized raw responses, AI cases, and the generated dashboard are ignored by Git. Credentials are read only from the existing environment conventions. Private email bodies are not written to tracked fixtures, logs, the dashboard, or Cerebras prompts.

The source of truth is `data/*.jsonl`; the dashboard is generated output. Optional Adzuna, TheirStack, and SerpApi sources remain disabled when their credentials are absent.

## Reliability and scheduling

Do not schedule this command until it has completed successfully on three separate manual occasions. Repeated commands during one proving session establish idempotency but do not satisfy that separate-occasion gate.
