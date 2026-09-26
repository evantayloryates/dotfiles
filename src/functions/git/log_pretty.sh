# git log, compact and paged. Layout, the git config it honours (none is
# required) and how GitHub usernames are resolved: git_log_pretty.py.
#
# The `git` wrapper in ../aliases.sh routes `git log …` here when stdout is a
# terminal; piped or captured `git log` stays native git. Output-shaping flags
# (-p, --stat, --graph, --oneline, --format, …) fall through to native git
# inside the script. Native git any time: `command git log …`.
git_log_pretty() { command python3 "$DOTFILES_DIR/src/functions/git/git_log_pretty.py" "$@"; }
