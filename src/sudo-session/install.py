#!/usr/bin/env python3
"""Install Taylor's explicitly authorized one-hour, cross-session sudo cache."""
import os
from pathlib import Path
import pwd
import stat
import subprocess
import sys
import tempfile

CONTENT = b'''# Taylor authorizes a one-hour cache shared across his terminal/agent sessions.
# Authentication is still required when this cache expires or is invalidated.
Defaults:taylor timestamp_timeout=60, timestamp_type=global
'''
DEST = Path('/private/etc/sudoers.d/90-taylor-session')
VISUDO = '/usr/sbin/visudo'

def check(*args):
    subprocess.run([VISUDO, *args], check=True)

def install():
    if len(sys.argv) != 1:
        raise SystemExit('No arguments accepted.')
    if os.geteuid() != 0:
        os.execv('/usr/bin/sudo', ['sudo', '--', sys.executable, str(Path(__file__).resolve())])
    pwd.getpwnam('taylor')
    parent = DEST.parent
    info = parent.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise SystemExit('Root-owned, non-writable sudoers directory required.')
    previous = None
    if DEST.exists() or DEST.is_symlink():
        info = DEST.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise SystemExit('Existing drop-in must be a root-owned regular file.')
        previous = DEST.read_bytes()
    check('-c')
    fd, temporary = tempfile.mkstemp(prefix='.taylor-session-', dir=parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(CONTENT)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o440)
        os.chown(temporary, 0, 0)
        check('-cf', temporary)
        os.replace(temporary, DEST)
        try:
            check('-c')
        except subprocess.CalledProcessError:
            if previous is None:
                DEST.unlink()
            else:
                with open(temporary, 'xb') as stream:
                    stream.write(previous)
                os.chmod(temporary, 0o440)
                os.chown(temporary, 0, 0)
                os.replace(temporary, DEST)
            raise
        print('Installed: taylor, 60 minutes, shared terminal/agent cache; no NOPASSWD grant.')
    finally:
        Path(temporary).unlink(missing_ok=True)

if __name__ == '__main__':
    install()
