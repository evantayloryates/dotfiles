# `data/` — machine-local runtime data

A general-purpose, lightweight file store for the dotfiles' small "database"
needs (usage history, indexes, caches, logs — anything that is machine-specific
runtime state rather than source).

## Rules

- **Git:** the directory is tracked, but its **contents are git-ignored**
  (see the `/data/*` block in the repo `.gitignore`), mirroring the `tmp/`
  pattern. Only intentional docs/placeholders are carved back in
  (`!/data/README.md`). Do not commit machine-local data.
- **Location:** always addressed through `$DOTFILES_DATA_DIR`
  (exported from `src/exports/common.sh` as `$DOTFILES_DIR/data`). Never
  hard-code the path — the export means scripts work regardless of where the
  dotfiles are installed.
- **`snake_case` for every folder and file name** under this tree. Firm rule.
- **Idempotent + self-seeding:** anything that reads or writes here must create
  its own subtree on demand and behave correctly when the directory (or its own
  files) do not exist yet. Never assume prior initialization.

## Layout

One subdirectory per class of data:

```
data/
  git_branch_history/                 # per-repo branch usage history (see src/functions/git/)
    <encoded_repo_abs_path>/
      touches.jsonl                   # shell-hook branch touch events
      last_used.jsonl                 # background last-used index + run log
  logs/
    git_branch_history.log            # background indexer log (compact ok / rich errors)
```
