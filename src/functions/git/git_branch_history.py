#!/usr/bin/env python3
"""Robust JSONL helpers for the git branch-history data layer.

This file lives alongside the shell code it supports (src/functions/git/) but is
NOT sourced by the loader (the loader only globs *.sh). It is invoked explicitly
from branch_history.sh / gb.sh for the two jobs that want real JSON parsing:

  * `resolve_usage`  — interactive selector: compute each branch's effective
                       last-used epoch from touches.jsonl (+ last_used.jsonl).
  * `index`          — background indexer: backfill branch_last_used entries and
                       append an index_run summary, honoring the cooldown.

The hot per-prompt "touch" path does NOT use this file; it stays pure shell+awk.
All operations are idempotent and safe when files are missing or partially
malformed (bad lines are skipped, never fatal).
"""

import json
import sys
import traceback

SCHEMA_VERSION = 1


def _iter_entries(path):
    """Yield parsed JSON objects from a JSONL file, skipping unreadable lines."""
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except (ValueError, TypeError):
                    continue
                if isinstance(obj, dict):
                    yield obj
    except FileNotFoundError:
        return
    except OSError:
        return


def _epoch(obj, *keys):
    """First present, int-coercible epoch among the given keys, else None."""
    for k in keys:
        v = obj.get(k)
        if v is None:
            continue
        try:
            return int(v)
        except (ValueError, TypeError):
            continue
    return None


def resolve_usage(touches_path, last_used_path):
    """Print `branch\\tepoch` for every branch with history.

    Effective last-used precedence (per plan 4.7):
      1. newest touch entry (start/latest/final) for the branch, else
      2. newest branch_last_used entry for the branch.
    Branches with neither are simply absent from the output; the shell layer
    diffs against the live branch list to discover "missing history" branches.
    """
    touch_best = {}
    for obj in _iter_entries(touches_path):
        b = obj.get("branch")
        if not isinstance(b, str) or not b:
            continue
        e = _epoch(obj, "ts_epoch")
        if e is None:
            continue
        if b not in touch_best or e > touch_best[b]:
            touch_best[b] = e

    index_best = {}
    for obj in _iter_entries(last_used_path):
        if obj.get("type") != "branch_last_used":
            continue
        b = obj.get("branch")
        if not isinstance(b, str) or not b:
            continue
        e = _epoch(obj, "last_used_epoch", "ts_epoch")
        if e is None:
            continue
        if b not in index_best or e > index_best[b]:
            index_best[b] = e

    out = []
    for b in set(touch_best) | set(index_best):
        eff = touch_best.get(b)
        if eff is None:
            eff = index_best.get(b)
        out.append((b, eff))

    # Deterministic ordering (branch name) — the shell re-sorts anyway.
    out.sort(key=lambda t: t[0])
    w = sys.stdout.write
    for b, e in out:
        w("%s\t%d\n" % (b, e))
    return 0


def _newest_index_run_finished(last_used_path):
    newest = None
    for obj in _iter_entries(last_used_path):
        if obj.get("type") != "index_run":
            continue
        if obj.get("status") != "ok":
            continue
        e = _epoch(obj, "finished_epoch", "ts_epoch")
        if e is None:
            continue
        if newest is None or e > newest:
            newest = e
    return newest


def _newest_last_used_by_branch(last_used_path):
    best = {}
    for obj in _iter_entries(last_used_path):
        if obj.get("type") != "branch_last_used":
            continue
        b = obj.get("branch")
        if not isinstance(b, str) or not b:
            continue
        e = _epoch(obj, "last_used_epoch", "ts_epoch")
        if e is None:
            continue
        if b not in best or e > best[b]:
            best[b] = e
    return best


def index(last_used_path, reindex_seconds, cooldown_seconds, now_epoch, now_iso):
    """Backfill branch_last_used entries + append an index_run summary.

    Branch commit data arrives on stdin as `branch\\t<committer_unix_epoch>`
    lines (one per local branch), gathered by the shell via git for-each-ref.
    Prints a single compact summary line to stdout for the log.
    """
    reindex_seconds = int(reindex_seconds)
    cooldown_seconds = int(cooldown_seconds)
    now_epoch = int(now_epoch)

    # Cooldown: derived purely from the newest successful index_run already on
    # disk (no separate last-run file). Redundant runs no-op almost instantly.
    last_run = _newest_index_run_finished(last_used_path)
    if last_run is not None and (now_epoch - last_run) < cooldown_seconds:
        sys.stdout.write("status=cooldown age=%ds\n" % (now_epoch - last_run))
        return 0

    branches = []
    for line in sys.stdin:
        line = line.rstrip("\n")
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        name = parts[0].strip()
        try:
            commit_epoch = int(parts[1].strip())
        except (ValueError, TypeError):
            continue
        if name:
            branches.append((name, commit_epoch))

    existing = _newest_last_used_by_branch(last_used_path)

    to_write = []
    for name, commit_epoch in branches:
        prev = existing.get(name)
        # Re-index when there is no entry, or the newest is older than the
        # staleness threshold. Otherwise skip (already fresh).
        if prev is not None and (now_epoch - prev) < reindex_seconds:
            continue
        to_write.append((name, commit_epoch))

    written = 0
    error = None
    try:
        if to_write:
            lines = []
            for name, commit_epoch in to_write:
                from datetime import datetime, timezone

                last_used_at = datetime.fromtimestamp(
                    commit_epoch, tz=timezone.utc
                ).strftime("%Y-%m-%dT%H:%M:%SZ")
                lines.append(
                    json.dumps(
                        {
                            "schema_version": SCHEMA_VERSION,
                            "type": "branch_last_used",
                            "branch": name,
                            "ts": now_iso,
                            "ts_epoch": now_epoch,
                            "source": "indexer",
                            "last_used_at": last_used_at,
                            "last_used_epoch": commit_epoch,
                            "indexed_at": now_iso,
                            "method": "commit_committerdate",
                            "confidence": "medium",
                            "source_ref": name,
                        },
                        separators=(",", ":"),
                        ensure_ascii=False,
                    )
                )
                written += 1
            with open(last_used_path, "a", encoding="utf-8") as fh:
                fh.write("\n".join(lines) + "\n")
    except OSError as exc:  # pragma: no cover - disk failure
        error = str(exc)

    status = "error" if error else "ok"
    run = {
        "schema_version": SCHEMA_VERSION,
        "type": "index_run",
        "ts": now_iso,
        "ts_epoch": now_epoch,
        "source": "indexer",
        "started_at": now_iso,
        "finished_at": now_iso,
        "finished_epoch": now_epoch,
        "status": status,
        "branches_scanned": len(branches),
        "branches_written": written,
        "error": error,
    }
    try:
        with open(last_used_path, "a", encoding="utf-8") as fh:
            fh.write(
                json.dumps(run, separators=(",", ":"), ensure_ascii=False) + "\n"
            )
    except OSError as exc:  # pragma: no cover - disk failure
        sys.stderr.write("failed to append index_run: %s\n" % exc)
        sys.stdout.write(
            "status=error scanned=%d written=%d msg=%s\n"
            % (len(branches), written, exc)
        )
        return 1

    sys.stdout.write(
        "status=%s scanned=%d written=%d\n" % (status, len(branches), written)
    )
    return 0 if status == "ok" else 1


def main(argv):
    if len(argv) < 2:
        sys.stderr.write("usage: git_branch_history.py <resolve_usage|index> ...\n")
        return 2
    cmd = argv[1]
    try:
        if cmd == "resolve_usage":
            return resolve_usage(argv[2], argv[3])
        if cmd == "index":
            # index <last_used_path> <reindex_seconds> <cooldown_seconds> <now_epoch> <now_iso>
            return index(argv[2], argv[3], argv[4], argv[5], argv[6])
    except Exception:  # noqa: BLE001 - background job: capture full trace for the log
        sys.stderr.write(traceback.format_exc())
        sys.stdout.write("status=error msg=exception\n")
        return 1
    sys.stderr.write("unknown command: %s\n" % cmd)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
