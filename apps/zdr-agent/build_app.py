#!/usr/bin/python3
"""Build ZDR Harness.app reproducibly (Swift + AppKit + WebKit, no dependencies).

The bundle is assembled in a temporary directory and installed straight to
~/Applications, which is the only copy that exists. An earlier version kept the
build output under data/zdr-harness/ as well; macOS indexed and re-registered
it, so "ZDR Harness.app" appeared twice in Spotlight and either copy could be
launched. --force rebuilds even when the source hash is unchanged.
"""
import argparse
import hashlib
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
APP_SRC = HERE / 'app'
INSTALLED = Path.home() / 'Applications' / 'ZDR Harness.app'
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


def build_and_install(force=False):
    digest = source_hash()
    if not force and INSTALLED.exists() and stamp(INSTALLED) == digest:
        print(f'up to date: {INSTALLED}')
        subprocess.run([LSREGISTER, '-f', str(INSTALLED)], check=True, capture_output=True)
        return INSTALLED

    INSTALLED.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.zdr-build-') as staging:
        bundle = Path(staging) / INSTALLED.name
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

        # Swap it in through a sibling temp copy so a crash cannot leave a half bundle.
        landing = INSTALLED.with_name('.' + INSTALLED.name + '.tmp')
        if landing.exists():
            shutil.rmtree(landing)
        subprocess.run(['/usr/bin/ditto', str(bundle), str(landing)], check=True)
        subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(landing)], check=True, capture_output=True)
        if INSTALLED.exists():
            shutil.rmtree(INSTALLED)
        landing.rename(INSTALLED)

    subprocess.run([LSREGISTER, '-f', str(INSTALLED)], check=True, capture_output=True)
    print(f'installed: {INSTALLED}')
    return INSTALLED


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    # --install is accepted for compatibility; installing is now the only mode.
    parser.add_argument('--install', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--force', action='store_true', help='rebuild even if sources are unchanged')
    args = parser.parse_args()
    build_and_install(force=args.force)
