#!/usr/bin/python3
"""Install reproducible startup hooks, preserving all pre-existing contents."""
import argparse
import datetime
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

LINE = '. "$HOME/dotfiles/src/path/overrides.sh"'
MARKER = '# Dotfiles executable overrides (interactive, scripts and agent shells).'
ROOT = Path(__file__).resolve().parents[2]
LABELS = ('com.taylor.dotfiles-path', 'com.taylor.op-agent')


def add_hook(path):
    content = path.read_text() if path.exists() else ''
    if LINE in content.splitlines():
        return False
    if path.exists():
        stamp = datetime.datetime.now().strftime('%Y%m%d%H%M%S%f')
        shutil.copy2(path, str(path) + '.pre-op-agent.' + stamp)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a') as output:
        output.write(('' if not content or content.endswith('\n') else '\n') + '\n' + MARKER + '\n' + LINE + '\n')
    return True


def install_shells(home, zdotdir=None):
    zroot = zdotdir or home
    targets = [zroot / name for name in ('.zshenv', '.zprofile', '.zshrc', '.zlogin')]
    targets += [home / '.bashrc', home / '.profile']
    # Do not create .bash_profile and accidentally hide an existing .profile.
    for name in ('.bash_profile', '.bash_login'):
        if (home / name).exists():
            targets.append(home / name)
            break
    changed = 0
    for path in targets:
        changed += add_hook(path)
    return changed


def install_agents(home):
    dest = home / 'Library/LaunchAgents'
    dest.mkdir(parents=True, exist_ok=True)
    domain = 'gui/' + str(os.getuid())
    for label in LABELS:
        source = ROOT / 'src/launchd' / (label + '.plist')
        target = dest / source.name
        if target.is_symlink() and target.resolve() == source:
            pass
        elif target.exists() or target.is_symlink():
            raise RuntimeError('Existing LaunchAgent differs: ' + str(target))
        else:
            target.symlink_to(source)
        # Re-running installs hooks and refreshes GUI PATH without destroying an
        # active broker session. Restarting changed broker code is explicit.
        loaded = subprocess.run(['/bin/launchctl', 'print', domain + '/' + label], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
        if not loaded:
            subprocess.run(['/bin/launchctl', 'bootstrap', domain, str(target)], check=True)
    subprocess.run(['/bin/sh', str(ROOT / 'src/launchd/export-dotfiles-path.sh')], check=True)
    endpoint = home / 'Library/Caches/com.taylor.op-agent/agent.sock'
    for _ in range(50):
        if endpoint.exists():
            break
        time.sleep(0.1)
    else:
        raise RuntimeError('Broker did not create its socket; inspect launchctl print ' + domain + '/com.taylor.op-agent')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shells-only', action='store_true', help='Install startup hooks without launching services')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        print('op broker: macOS only; no changes made.')
        return
    home = Path.home()
    if (home / 'dotfiles').resolve() != ROOT:
        raise RuntimeError('~/dotfiles must point to this checkout before installation')
    # Full source-controlled shell templates also carry these lines, but these
    # hooks cover existing installations without replacing their custom files.
    changed = install_shells(home, Path(os.environ['ZDOTDIR']) if os.environ.get('ZDOTDIR') else None)
    if not args.shells_only:
        install_agents(home)
    print('op broker: installed; updated %d shell startup files. Existing GUI apps need a restart to inherit PATH.' % changed)


if __name__ == '__main__':
    main()
