#!/usr/bin/python3
"""Build record-screend.app reproducibly; the bundle stays under data/ (gitignored).

Rebuilds only when the sources change (hash stamp), compiles with swiftc, and
signs with an Apple Development identity so the Screen Recording grant survives
rebuilds. Prints the bundle path.

  build.py           build if stale
  build.py --force   always rebuild
"""
import hashlib
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'src/record-screen/engine'
APP = ROOT / 'data/record-screen/record-screend.app'
STAMP = APP.parent / 'source.sha256'
BUNDLE_ID = 'com.taylor.record-screen'
LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'


def sources():
    return sorted([*(SRC / 'Sources').glob('*.swift'),
                   *(ROOT / 'src/codex-bridge/native').glob('*.swift')])


def source_hash():
    digest = hashlib.sha256()
    for path in [*sources(), SRC / 'Info.plist', Path(__file__)]:
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def signing_identity():
    """RECORD_SCREEN_SIGN_IDENTITY wins; otherwise the first Apple Development
    identity in the keychain; otherwise ad-hoc (and the grant won't stick)."""
    forced = os.environ.get('RECORD_SCREEN_SIGN_IDENTITY')
    if forced:
        return forced
    out = subprocess.run(['/usr/bin/security', 'find-identity', '-v', '-p', 'codesigning'], capture_output=True, text=True).stdout
    for line in out.splitlines():
        if '"Apple Development:' in line:
            return line.split()[1]
    return '-'


def build(force=False):
    digest = source_hash()
    if not force and APP.exists() and STAMP.exists() and STAMP.read_text().strip() == digest:
        return APP, False
    APP.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.build-', dir=APP.parent) as staging:
        bundle = Path(staging) / APP.name
        macos = bundle / 'Contents/MacOS'
        macos.mkdir(parents=True)
        info = plistlib.loads((SRC / 'Info.plist').read_bytes())
        info['RSBuildHash'] = digest[:12]
        (bundle / 'Contents/Info.plist').write_bytes(plistlib.dumps(info))
        subprocess.run(['/usr/bin/xcrun', 'swiftc', '-O', '-swift-version', '5', '-target', 'arm64-apple-macos15.0',
                        '-o', str(macos / 'record-screend'), *map(str, sources())], check=True)
        identity = signing_identity()
        if identity == '-':
            print('warning: no Apple Development identity; signing ad-hoc, so macOS will forget the '
                  'Screen Recording grant on every rebuild', file=sys.stderr)
        subprocess.run(['/usr/bin/codesign', '--force', '--sign', identity, '--identifier', BUNDLE_ID,
                        '--timestamp=none', str(bundle)], check=True, capture_output=True)
        subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(bundle)], check=True, capture_output=True)
        if APP.exists():
            shutil.rmtree(APP)
        shutil.move(str(bundle), APP)
    STAMP.write_text(digest + '\n')
    subprocess.run([LSREGISTER, '-f', str(APP)], capture_output=True)
    return APP, True


if __name__ == '__main__':
    path, rebuilt = build(force='--force' in sys.argv)
    print(path)
    print('rebuilt' if rebuilt else 'up to date', file=sys.stderr)
