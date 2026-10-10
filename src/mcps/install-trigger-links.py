#!/usr/bin/env python3
"""Install canonical dotfiles trigger symlinks without changing service contents."""
import argparse
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HOME = Path.home()
LINKS = {
    '.codex/config.toml': 'src/mcps/host-config/codex.toml',
    '.claude.json': 'src/mcps/host-config/claude.json',
    'Library/LaunchAgents/com.taylor.ios-agent.plist': 'src/ios-agent/com.taylor.ios-agent.plist',
    'Library/LaunchAgents/com.taylor.ios-agent.metro.plist': 'src/ios-agent/com.taylor.ios-agent.metro.plist',
    'Library/LaunchAgents/com.taylor.kickoff-live-transcript.plist': 'src/launchagents/com.taylor.kickoff-live-transcript.plist',
    'Library/LaunchAgents/me.taylor.switchboard.outbox.plist': 'src/switchboard/launchd/me.taylor.switchboard.outbox.plist',
    '.local/bin/switchboard-outbox.sh': 'src/switchboard/bin/switchboard-outbox.sh',
    '.skhdrc': 'src/skhd/skhdrc',
}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    for installed, canonical in LINKS.items():
        target, source = HOME / installed, ROOT / canonical
        if not source.is_file():
            raise SystemExit('Canonical source missing: '+canonical)
        if target.is_symlink() and target.resolve() == source.resolve():
            continue
        if target.exists() and target.read_bytes() != source.read_bytes():
            raise SystemExit('Refusing to overwrite divergent trigger: '+installed)
        if args.apply:
            temporary = target.with_name(target.name+'.dotfiles-link-'+str(os.getpid()))
            try:
                temporary.symlink_to(source)
                os.replace(temporary,target)
            finally:
                temporary.unlink(missing_ok=True)
        else:
            raise SystemExit('Trigger needs canonical symlink: '+installed)
    print('All eight migrated trigger paths resolve to their canonical dotfiles sources')

if __name__ == '__main__':
    main()
