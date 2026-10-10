#!/usr/bin/env python3
"""Install/check the optional isolated paired-device observer; no device actions."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import venv

ROOT = Path(__file__).resolve().parent
STATE = Path.home() / 'Library/Application Support/ios-agent'
PIN = 'pymobiledevice3-11.15.5'
CHECK = "import importlib.metadata as m;from pymobiledevice3.remote.native_tunnel import NativeRemotedTunnel;from pymobiledevice3.services.dvt.instruments.screenshot import Screenshot;assert m.version('pymobiledevice3')=='11.15.5'"

def check(target):
    python = target / 'bin/python'
    return python.is_file() and subprocess.run([str(python), '-B', '-c', CHECK],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20).returncode == 0

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    target = STATE / 'providers' / PIN
    if args.check:
        ready = check(target)
        print(json.dumps({'installed':ready,'provider':PIN,'deviceActionSent':False}))
        return 0 if ready else 1
    if sys.version_info < (3, 11):
        raise SystemExit('Python 3.11+ required; the pinned lock was qualified on macOS Python 3.14.')
    if not STATE.is_dir() or STATE.is_symlink() or STATE.stat().st_mode & 0o077:
        raise SystemExit('Install the base service first; private state directory required.')
    parent = target.parent
    parent.mkdir(mode=0o700, exist_ok=True)
    if parent.is_symlink() or parent.stat().st_mode & 0o077:
        raise SystemExit('Private provider directory required.')
    fd = os.open(parent / '.install.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd,'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if target.exists():
            if not check(target):raise SystemExit('Existing observer failed validation; preserve it for diagnosis.')
        else:
            candidate = Path(tempfile.mkdtemp(prefix='.observer-',dir=parent))
            try:
                venv.EnvBuilder(with_pip=True).create(candidate)
                subprocess.run([str(candidate/'bin/python'), '-m', 'pip', 'install',
                    '--disable-pip-version-check', '-r', str(ROOT/'observer-requirements.lock')],check=True)
                if not check(candidate):raise SystemExit('Observer candidate failed validation.')
                # Venv entrypoint shebangs name the candidate path. The service uses bin/python
                # directly, so those generated pip/CLI scripts are deliberately not its API.
                candidate.rename(target)
            finally:
                if candidate.exists():shutil.rmtree(candidate)
    print(json.dumps({'installed':True,'provider':PIN,'deviceActionSent':False}))
    return 0

if __name__ == '__main__':sys.exit(main())
