# Guidance Fleet watcher repair candidate

These files are the source candidate for the existing Guidance Fleet watcher on
port 4870. They do not install or restart its launchd service. The live copies
are under `~/.local/state/guidance-fleet/kanban-watcher/`.

The candidate was prepared from live `daemon.sh` SHA256
`9890d1085327feef9686a111fdb66016bf9c859fcd61178bd5c0ee142041cf75`
and `codex-delivery.mjs` SHA256
`b1a40445b90c28a8b54fc19e3187d94392bd4186787515dd88f2c8994e2a3d16`.
Review those exact source diffs before installing. Check the live files and
consumer cursor again at deployment; if either changed, reconcile first.

An interrupted or failed exact Codex delivery turn returns a structured terminal
receipt. The daemon records a hold through that event range, sends an immediate
manager alert, and stops retrying or advancing event ranges. A human or owner
must inspect the exact turn and board events, perform any missing action, then
advance the board consumer cursor. Only that cursor readback clears the hold.
The original event range key stays fixed through a queued retry, including
after a partial board acknowledgement. Older state without its original range
key is held for inspection instead of generating a new intent.

The queue helper independently reconciles the original client ID after chat
resume. If resume consumed the item, it waits on that turn without starting the
missing queued submission. The focused tests are:

```sh
/opt/homebrew/opt/node@22/bin/node --test src/local-fleet-codex/queue.test.mjs src/local-fleet-codex/guidance-watcher/daemon.test.mjs
bash -n src/local-fleet-codex/guidance-watcher/daemon.sh
```

To make this live, review the source and synthetic evidence, inspect the exact
current launchd process and board cursor, then replace only the two live files
and perform a scoped watcher restart. Read back the installed file hashes,
single watcher PID, durable receipt, and consumer cursor. Do not replay the
interrupted intents `kw-ev-3148-3149` or `kw-ev-3153-3154`.
