#!/usr/bin/env python3
"""Validate one completed fixed DEV product before CoreDevice installation."""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import re
import subprocess
import sys
from build_jobs import private_base, status


def prepare(state, job):
    if not isinstance(job, str) or not re.fullmatch('[a-f0-9]{32}', job):
        raise ValueError('fixed_build_job_required')
    base = private_base(state)
    result = status(base, job)
    if result.get('state') != 'completed' or result.get('ok') is not True:
        raise ValueError('completed_verified_build_required')
    request = json.loads((base/job/'request.json').read_text())
    cache = request.get('derivedDataJob', job)
    if not re.fullmatch('[a-f0-9]{32}', cache):
        raise ValueError('fixed_build_cache_required')
    derived = base/cache/'DerivedData'
    manifest = json.loads((derived/'ios-agent-build.json').read_text())
    product = Path(manifest['product'])
    if product.is_symlink() or product.resolve().parent != (derived/'Build/Products/Debug-iphoneos').resolve():
        raise ValueError('fixed_dev_product_required')
    info = plistlib.loads((product/'Info.plist').read_bytes())
    stamp = result.get('deliveryId')
    if not isinstance(stamp, str) or not re.fullmatch('[a-f0-9]{32}', stamp) or info.get('IOSAgentDeliveryId') != stamp or manifest.get('deliveryId') != stamp:
        raise ValueError('signed_delivery_identity_required')
    executable = info.get('CFBundleExecutable')
    if info.get('CFBundleIdentifier') != 'com.dev.kudos.fit' or not isinstance(executable, str) or Path(executable).name != executable:
        raise ValueError('fixed_dev_bundle_required')
    binary = product/executable
    if binary.is_symlink() or hashlib.sha256(binary.read_bytes()).hexdigest() != result.get('executableHash'):
        raise ValueError('build_product_changed')
    subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(product)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
    seal = subprocess.run(['/usr/bin/codesign', '-d', '--verbose=4', str(product)], check=True, capture_output=True, text=True, timeout=5).stderr
    match = re.search(r'^CDHash=([a-f0-9]+)$', seal, re.M)
    if not match:
        raise ValueError('signed_product_seal_required')
    config = state/'web-device.json'
    if config.is_symlink() or config.stat().st_mode & 0o077:
        raise ValueError('private_device_configuration_required')
    device = json.loads(config.read_text()).get('coreDeviceId', '')
    if not re.fullmatch('[A-Fa-f0-9-]{36}', device):
        raise ValueError('configured_device_id_required')
    return {'ok': True, 'jobId': job, 'deliveryId': stamp, 'product': str(product), 'device': device, 'seal': match[1], 'executableHash': result['executableHash']}


def main():
    p = argparse.ArgumentParser(); p.add_argument('--state', type=Path, required=True); args = p.parse_args()
    try:
        q = json.load(sys.stdin); value = prepare(args.state, q.get('jobId'))
    except ValueError as e:
        value = {'ok': False, 'reason': str(e)}
    except Exception:
        value = {'ok': False, 'reason': 'signed_product_validation_failed'}
    print(json.dumps(value))

if __name__ == '__main__': main()
