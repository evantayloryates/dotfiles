#!/usr/bin/python3
"""Build record-screend.app reproducibly; the bundle stays under data/ (gitignored).

Rebuilds only when the sources change (hash stamp), compiles with swiftc, and
signs with an Apple Development identity so the Screen Recording grant survives
rebuilds. Prints the bundle path.

  build.py           build if stale
  build.py --force   always rebuild
"""
import argparse
from contextlib import contextmanager
import fcntl
import json
import socket
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
ENGINE_HOME = Path.home() / '.record-screen'
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


def rpc(method, params=None):
    # Bundle installation always concerns the canonical production instance,
    # even if a caller used RECORD_SCREEN_HOME for a private test engine.
    sockpath = ENGINE_HOME / 'run/engine.sock'
    with socket.socket(socket.AF_UNIX) as sock:
        sock.settimeout(5); sock.connect(str(sockpath))
        sock.sendall((json.dumps({'id':1,'method':method,'params':params or {}})+'\n').encode())
        data = b''
        while b'\n' not in data:
            part = sock.recv(65536)
            if not part: raise RuntimeError('production engine closed before maintenance reply')
            data += part
            if len(data) > 2_000_000: raise RuntimeError('maintenance reply exceeded byte limit')
        reply = json.loads(data.split(b'\n')[0])
        if 'error' in reply: raise RuntimeError(reply['error']['code'] + ': ' + reply['error']['message'])
        return reply['result']


@contextmanager
def install_boundary(token=None, legacy_idle=False):
    try:
        before = rpc('status')
    except (FileNotFoundError, ConnectionRefusedError):
        # An absent socket alone is not process absence. The same instance lock
        # as Engine must be held across cold installation.
        lockpath = ENGINE_HOME / 'run/engine.lock'
        lockpath.parent.mkdir(parents=True, exist_ok=True)
        with lockpath.open('a+') as handle:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            yield
        return
    if token:
        value = rpc('maintenance.validate', {'token':token})
        if value.get('pid') != before['engine']['pid'] or value.get('lease',{}).get('ready') is not True:
            raise RuntimeError('maintenance PID/token changed; bundle not replaced')
    elif legacy_idle and (before.get('capabilities') or {}).get('maintenance_fence') != 1:
        jobs = rpc('record.list', {'active':True,'limit':50})
        after = rpc('status')
        if type(jobs.get('total')) is not int or jobs['total'] != 0 or after.get('viewfinder',{}).get('lanes') != [] or after.get('overlays') != [] or before['engine']['pid'] != after['engine']['pid']:
            raise RuntimeError('legacy work is active, changed or unknown; bundle not replaced')
    else:
        raise RuntimeError('live bundle replacement requires an idle maintenance token; first legacy upgrade needs explicit --legacy-idle')
    yield


def build(force=False, maintenance_token=None, legacy_idle=False):
    digest = source_hash()
    if not force and APP.exists() and STAMP.exists() and STAMP.read_text().strip() == digest:
        return APP, False
    # Compile only after establishing an authorized maintenance boundary. A
    # final validation immediately before replacement handles lease expiry.
    with install_boundary(maintenance_token, legacy_idle):
        pass
    APP.parent.mkdir(parents=True, exist_ok=True)
    prepared = APP.parent / 'prepared' / digest
    bundle = prepared / APP.name
    receipt = prepared / 'compiled.json'
    if not receipt.exists():
        prepared.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='.compile-', dir=prepared) as staging:
            inputs = Path(staging) / 'inputs'; inputs.mkdir()
            frozen = []
            for path in sources():
                target = inputs / path.name; shutil.copy2(path, target); frozen.append(target)
            info_path = inputs / 'Info.plist'; shutil.copy2(SRC / 'Info.plist', info_path)
            build_path = inputs / 'build.py'; shutil.copy2(Path(__file__), build_path)
            frozen_digest = hashlib.sha256()
            for path in [*frozen, info_path, build_path]:
                frozen_digest.update(path.name.encode()); frozen_digest.update(path.read_bytes())
            if frozen_digest.hexdigest() != digest:
                raise RuntimeError('source changed during freezing; no installation')
            candidate = Path(staging) / APP.name
            macos = candidate / 'Contents/MacOS'; macos.mkdir(parents=True)
            info = plistlib.loads(info_path.read_bytes()); info['RSBuildHash'] = digest[:12]
            (candidate / 'Contents/Info.plist').write_bytes(plistlib.dumps(info))
            subprocess.run(['/usr/bin/xcrun', 'swiftc', '-O', '-swift-version', '5', '-target', 'arm64-apple-macos15.0',
                            '-o', str(macos / 'record-screend'), *map(str, frozen)], check=True)
            identity = signing_identity()
            if identity == '-': raise RuntimeError('no existing development identity; refusing grant-breaking ad-hoc installation')
            subprocess.run(['/usr/bin/codesign', '--force', '--sign', identity, '--identifier', BUNDLE_ID,
                            '--timestamp=none', str(candidate)], check=True, capture_output=True)
            subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(candidate)], check=True, capture_output=True)
            if bundle.exists(): shutil.rmtree(bundle)
            shutil.move(str(candidate), bundle)
            receipt.write_text(json.dumps({'source_sha256':digest,'binary_sha256':hashlib.sha256((bundle/'Contents/MacOS/record-screend').read_bytes()).hexdigest(),'signed':True})+'\n')
    saved = json.loads(receipt.read_text())
    if saved['source_sha256'] != digest or saved['binary_sha256'] != hashlib.sha256((bundle/'Contents/MacOS/record-screend').read_bytes()).hexdigest():
        raise RuntimeError('prepared bundle receipt mismatch; no installation')
    subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(bundle)], check=True, capture_output=True)
    if source_hash() != digest: raise RuntimeError('source changed after compilation; prepared evidence retained, no installation')
    with install_boundary(maintenance_token, legacy_idle):
        backups = APP.parent / 'previous'; backups.mkdir(exist_ok=True)
        if APP.exists():
            prior = hashlib.sha256((APP/'Contents/MacOS/record-screend').read_bytes()).hexdigest()
            backup = backups / (prior + '.app')
            if not backup.exists(): shutil.copytree(APP, backup)
            if hashlib.sha256((backup/'Contents/MacOS/record-screend').read_bytes()).hexdigest() != prior:
                raise RuntimeError('prior bundle backup mismatch; no installation')
        # Keep the prepared signed artifact for repeatable recovery; replace via
        # an adjacent staged copy, never recompile just because observation failed.
        with tempfile.TemporaryDirectory(prefix='.deliver-', dir=APP.parent) as delivery:
            replacement = Path(delivery) / APP.name; shutil.copytree(bundle, replacement)
            if APP.exists(): shutil.rmtree(APP)
            shutil.move(str(replacement), APP)
        STAMP.write_text(digest + '\n')
    subprocess.run([LSREGISTER, '-f', str(APP)], capture_output=True)
    return APP, True


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    parser.add_argument('--force',action='store_true')
    parser.add_argument('--maintenance-token')
    parser.add_argument('--legacy-idle',action='store_true')
    args = parser.parse_args()
    if args.check:
        digest = source_hash()
        print(json.dumps({'needs_build':not (APP.exists() and STAMP.exists() and STAMP.read_text().strip()==digest),'source_sha256':digest,'bundle':str(APP)}))
        sys.exit(0)
    path, rebuilt = build(args.force,args.maintenance_token,args.legacy_idle)
    print(path)
    print('rebuilt' if rebuilt else 'up to date', file=sys.stderr)
