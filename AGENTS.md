# Agent directives — dotfiles

## Always commit and push to master before ending a turn
If the working tree has any changes when you are about to end a turn, commit
them all (`git add -A`) and push to `origin/master` — even changes unrelated to
your work. Never leave commits local or the tree dirty. Aim for a reasonable
stopping point before committing, but that is a preference, not a gate: keeping
master current wins over waiting for polish.
