# dotfiles

order of zsh files 
1. ~/.zshenv
2. ~/.zprofile
3. ~/.zshrc
4. ~/.zlogin

for on logout functionality
~/.zlogout

A self-updating dotfiles system for VS Code dev containers that automatically syncs changes from GitHub without requiring container rebuilds.

## 🚀 Quick Start

### For Dev Containers

Add to your `.devcontainer/devcontainer.json`:

```json
{
  "postCreateCommand": "bash /workspaces/path-to-repo/install.sh"
}
```

Or run manually during container setup:
```bash
bash install.sh
```

### What install.sh Does

1. ✅ Checks for zsh (installs if missing)
2. 🔧 Sets zsh as the default shell
3. 📦 Clones this repo to `~/.dotfiles-repo`
4. 📄 Copies `.zshrc` to your home directory (one-time only)
5. 🎯 Sets up auto-update mechanism

## 📁 Structure

```
.
├── install.sh              # Initial setup script (run once during container build)
├── .zshrc                  # Template .zshrc (copied to ~/ on first install)
└── src/
    ├── index.sh           # Main loader (sources all subdirectory files)
    ├── aliases/           # Alias definitions (*.sh files)
    ├── exports/           # Environment variables (*.sh files)
    ├── functions/         # Shell functions (*.sh files)
    ├── hooks/             # Shell hooks (*.sh files)
    └── path/              # PATH modifications (*.sh files)
```

## 🔄 How Auto-Update Works

1. **On shell startup**: `.zshrc` checks for repo updates (every 5 minutes)
2. **If updates found**: Silently pulls latest changes from GitHub
3. **Always sources**: Fresh `src/index.sh` which loads all your configs
4. **Result**: Changes propagate within 5 minutes without rebuilding container!

## ✍️ Making Changes

### Files that live-update (edit these!)
- `src/aliases/*.sh` - Add/modify aliases
- `src/exports/*.sh` - Environment variables
- `src/functions/*.sh` - Custom functions
- `src/hooks/*.sh` - Shell hooks
- `src/path/*.sh` - PATH modifications
- `src/index.sh` - Loader logic

Push changes to GitHub → They'll appear in your container within 5 minutes!

### Files that DON'T live-update
- `.zshrc` - Only copied once during initial setup (local changes preserved)
- `install.sh` - Only runs during container build

## 🎯 Customization

### Add a new alias
Create `src/aliases/myaliases.sh`:
```bash
#!/bin/zsh
alias deploy='npm run deploy'
alias dev='npm run dev'
```

### Add environment variables
Create `src/exports/myenv.sh`:
```bash
#!/bin/zsh
export MY_VAR="value"
export PATH="$HOME/bin:$PATH"
```

### Change update interval
Edit `.zshrc` and modify:
```bash
CHECK_INTERVAL=300  # Change to desired seconds
```

## 🔧 Advanced

### Manual update check
```bash
rm ~/.dotfiles_last_check  # Force immediate check on next shell
```

### Repo location
Set custom location before running install:
```bash
export DOTFILES_REPO_PATH="/custom/path"
bash install.sh
```

## 📝 Notes

- The system uses zsh-specific syntax in `src/index.sh` for efficient file loading
- All `*.sh` files in src subdirectories are automatically sourced
- Update checks run in background to keep shell startup fast
- Git operations are silenced to avoid noise during normal shell use
