#!/usr/bin/python3
"""Build the local app host reproducibly; generated bundles stay under data/."""
import hashlib
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'data/op-agent/1Password CLI Broker.app'
STAMP = APP.parent / 'source.sha256'
LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'


def source_hash():
    digest = hashlib.sha256()
    for path in (ROOT / 'src/onepassword/app/main.m', ROOT / 'src/onepassword/app/Info.plist', ROOT / 'src/onepassword/op_agent.py', Path(__file__)):
        digest.update(path.read_bytes())
    return digest.hexdigest()


def needs_build():
    return not APP.exists() or not STAMP.exists() or STAMP.read_text().strip() != source_hash()


def build():
    if needs_build():
        APP.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='.build-', dir=APP.parent) as staging:
            bundle = Path(staging) / APP.name
            macos = bundle / 'Contents/MacOS'
            resources = bundle / 'Contents/Resources'
            macos.mkdir(parents=True)
            resources.mkdir()
            shutil.copy2(ROOT / 'src/onepassword/app/Info.plist', bundle / 'Contents/Info.plist')
            shutil.copy2(ROOT / 'src/onepassword/op_agent.py', resources / 'op_agent.py')
            subprocess.run(['/usr/bin/xcrun', 'clang', '-fobjc-arc', '-O2', '-framework', 'AppKit', str(ROOT / 'src/onepassword/app/main.m'), '-o', str(macos / 'op-agent-host')], check=True)
            subprocess.run(['/usr/bin/codesign', '--force', '--sign', '-', '--identifier', 'com.taylor.op-agent', str(bundle)], check=True, capture_output=True)
            subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(bundle)], check=True, capture_output=True)
            if APP.exists():
                shutil.rmtree(APP)
            shutil.move(str(bundle), APP)
        STAMP.write_text(source_hash() + '\n')
    subprocess.run([LSREGISTER, '-f', str(APP)], check=True, capture_output=True)
    return APP


if __name__ == '__main__':
    print(build())
