# Agent directives — dotfiles

## Shared master: commit, rebase, publish autonomously

This is Taylor’s personal service hub, written by multiple clients. Before ending
a turn with changes, commit ALL shared changes (`git add -A`, including unrelated
edits), then run `/Users/taylor/dotfiles/bin/dotfiles-publish`. Routine commits,
fetches, rebases, conflict resolution and publishing are authorized; do not ask
Taylor to execute commands the agent can execute itself.

The publisher serializes cooperating local publishers, fetches master, rebases
local work onto the exact fetched commit, and pushes only master with an explicit
`--force-with-lease=refs/heads/master:<fetched-sha>`. It preserves that fetched
history, so this ordinarily remains a fast-forward update. A rebase of unpublished
commits does not itself require rewriting remote history. The explicit lease also
rejects a competing update even if background fetching changes origin/master.

If the lease loses a race, the publisher fetches/rebases again (up to three
attempts). Resolve routine conflicts autonomously while preserving both clients’
intent, then rerun. Git rerere remembers prior resolutions. Never bypass secret
scanners or other meaningful checks. Do not abort another client’s Git operation,
reset/drop their edits, or force a collision through.

Never use plain `--force`, `-f`, a `+` refspec, or `--mirror` to publish master.
Do not weaken/remove a lease or reuse a stale lease after rejection. Direct Git
publication is not the standard workflow; use the publisher. If a deliberate
rewrite is ever needed, retain an explicit expected-SHA lease and preserve newer
remote work. Keep master published; stop only for an actual unresolved conflict,
credentials, an enforced policy refusal or a substantive failed check.

Install repo defaults and Codex rules on another Mac with
`python3 src/git-publishing/install.py`. Worktrees share the publication lock;
independent machines coordinate through the remote lease.
