#!/usr/bin/python3
"""Build ZDR Harness.app reproducibly (Swift + AppKit + WebKit, no dependencies).

The bundle is built under data/zdr-harness/ and, with --install, copied to
~/Applications. --force rebuilds even when the source hash is unchanged.
"""
import argparse
import hashlib
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
APP_SRC = HERE / 'app'
APP = ROOT / 'data/zdr-harness/ZDR Harness.app'
INSTALLED = Path.home() / 'Applications' / APP.name
STAMP_NAME = 'source.sha256'
BUNDLE_ID = 'com.taylor.zdr-harness.app'
LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'


def sources():
    return sorted((APP_SRC / 'Sources').glob('*.swift')) + [APP_SRC / 'Info.plist', APP_SRC / 'AppIcon.icns', Path(__file__)]


def source_hash():
    digest = hashlib.sha256()
    for path in sources():
        digest.update(path.relative_to(HERE).as_posix().encode() + b'\0')
        digest.update(path.read_bytes())
    return digest.hexdigest()


def stamp(bundle):
    path = bundle / 'Contents/Resources' / STAMP_NAME
    return path.read_text().strip() if path.exists() else None


def build(force=False):
    digest = source_hash()
    if not force and APP.exists() and stamp(APP) == digest:
        print(f'up to date: {APP}')
        return APP
    APP.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.build-', dir=APP.parent) as staging:
        bundle = Path(staging) / APP.name
        macos = bundle / 'Contents/MacOS'
        resources = bundle / 'Contents/Resources'
        macos.mkdir(parents=True)
        resources.mkdir()

        with open(APP_SRC / 'Info.plist', 'rb') as f:
            info = plistlib.load(f)
        # Resolved paths (not the ~/dotfiles symlink) for Open README and the re-auth hint.
        info['ZDRHarnessReadme'] = str(HERE / 'README.md')
        info['ZDRHarnessWrapper'] = str(HERE / 'bin/zdr-harness')
        with open(bundle / 'Contents/Info.plist', 'wb') as f:
            plistlib.dump(info, f)
        shutil.copy2(APP_SRC / 'AppIcon.icns', resources / 'AppIcon.icns')
        (resources / STAMP_NAME).write_text(digest + '\n')

        subprocess.run(['/usr/bin/xcrun', 'swiftc', '-O', '-swift-version', '5',
                        '-target', 'arm64-apple-macosx14.0',
                        '-module-cache-path', str(Path(staging) / 'module-cache'),
                        '-framework', 'AppKit', '-framework', 'WebKit', '-framework', 'Network',
                        *map(str, sorted((APP_SRC / 'Sources').glob('*.swift'))),
                        '-o', str(macos / 'ZDRHarness')], check=True)
        subprocess.run(['/usr/bin/codesign', '--force', '--sign', '-', '--identifier', BUNDLE_ID, str(bundle)],
                       check=True, capture_output=True)
        subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(bundle)], check=True, capture_output=True)
        if APP.exists():
            shutil.rmtree(APP)
        shutil.move(str(bundle), APP)
    print(f'built: {APP}')
    return APP


def install():
    if INSTALLED.exists() and stamp(INSTALLED) == stamp(APP):
        print(f'installed copy up to date: {INSTALLED}')
    else:
        INSTALLED.parent.mkdir(parents=True, exist_ok=True)
        staging = INSTALLED.with_name('.' + INSTALLED.name + '.tmp')
        if staging.exists():
            shutil.rmtree(staging)
        subprocess.run(['/usr/bin/ditto', str(APP), str(staging)], check=True)
        subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(staging)], check=True, capture_output=True)
        if INSTALLED.exists():
            shutil.rmtree(INSTALLED)
        staging.rename(INSTALLED)
        print(f'installed: {INSTALLED}')
    # Register only the installed copy, so `open -a "ZDR Harness"` never picks the build output.
    subprocess.run([LSREGISTER, '-u', str(APP)], capture_output=True)
    subprocess.run([LSREGISTER, '-f', str(INSTALLED)], check=True, capture_output=True)
    return INSTALLED


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install', action='store_true', help='copy the bundle to ~/Applications')
    parser.add_argument('--force', action='store_true', help='rebuild even if sources are unchanged')
    args = parser.parse_args()
    build(force=args.force)
    if args.install:
        install()
