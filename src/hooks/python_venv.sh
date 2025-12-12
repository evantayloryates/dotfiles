#!/bin/zsh

# Auto-create and activate a dedicated Python venv for dotfiles tasks.
# Installs Pillow if missing so image utilities work out of the box.

# Where to place the venv
DOTFILES_PY_VENV_DIR="${DOTFILES_PY_VENV_DIR:-$HOME/.venvs/dotfiles}"

# Avoid re-activating if already active
if [[ -n "$VIRTUAL_ENV" && "$VIRTUAL_ENV" == "$DOTFILES_PY_VENV_DIR"* ]]; then
  return 0
fi

# Create venv if missing
if [[ ! -d "$DOTFILES_PY_VENV_DIR" ]]; then
  mkdir -p "${DOTFILES_PY_VENV_DIR:h}"
  if command -v python3 >/dev/null 2>&1; then
    python3 -m venv "$DOTFILES_PY_VENV_DIR" 2>/dev/null || true
  fi
fi


# Activate if present
if [[ -f "$DOTFILES_PY_VENV_DIR/bin/activate" ]]; then
  source "$DOTFILES_PY_VENV_DIR/bin/activate"

#   # Ensure Pillow is available (quietly)
#   python - <<'PY'
# try:
#   import PIL  # noqa: F401
# except Exception:
#   import subprocess, sys
#   subprocess.run([sys.executable, '-m', 'pip', 'install', '--upgrade', 'pip'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
#   subprocess.run([sys.executable, '-m', 'pip', 'install', 'pillow'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
# PY
# fi


