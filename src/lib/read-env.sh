#!/bin/sh
# Read specific keys out of dotfiles/.env.
#
# Why not just `set -a; . "$ENV_FILE"`: that is what src/exports/dotenv.sh does
# for the shell, but these callers `exec` a third-party process afterwards. A
# blanket source would hand EVERY secret in .env to that child. Naming the keys
# you need keeps the blast radius to exactly those.
#
# Why read the file at all instead of the environment: MCP launchers are spawned
# by a GUI app with a minimal environment, and the launchd bridge only reaches
# apps started after it last ran. The file on disk is the reliable source.
#
# Usage:
#   . "$(dirname "$0")/../lib/read-env.sh"
#   eval "$(env_export DB_HOST DB_NAME)"   # -> defines $DB_HOST, $DB_NAME
#   password="$(env_get SOME_PASSWORD)"
#
# Both fail loudly (non-zero, message on stderr) if a requested key is absent —
# an unset hostname would otherwise surface as a confusing connection error.

if [ -z "${__READ_ENV_LOADED:-}" ]; then
__READ_ENV_LOADED=1

# Emit `KEY='value'` lines for the named keys, shell-quoted for eval.
env_export() {
  ENV_FILE="${ENV_FILE:-${DOTFILES_DIR:-$HOME/dotfiles}/.env}" \
  ENV_KEYS="$*" \
  python3 - <<'PY'
import os
import shlex
from pathlib import Path

env_file = Path(os.environ["ENV_FILE"])
wanted = os.environ["ENV_KEYS"].split()

if not env_file.is_file():
    raise SystemExit(f"read-env: {env_file} not found")

found = {}
for raw_line in env_file.read_text().splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#"):
        continue
    if line.startswith("export "):
        line = line[len("export "):].lstrip()
    if "=" not in line:
        continue
    key, value = line.split("=", 1)
    key = key.strip()
    if key not in wanted:
        continue
    value = value.strip()
    # Strip one layer of shell quoting, matching how `set -a; source` reads it.
    if value and value[0] in {"'", '"'}:
        parts = shlex.split(value)
        value = parts[0] if parts else ""
    found[key] = value

missing = [k for k in wanted if k not in found]
if missing:
    raise SystemExit(f"read-env: missing from {env_file}: {', '.join(missing)}")

for key in wanted:
    print(f"{key}={shlex.quote(found[key])}")
PY
}

# Print a single value.
env_get() {
  eval "$(env_export "$1")" || return 1
  eval "printf '%s' \"\$$1\""
}

fi
