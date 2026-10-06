#!/usr/bin/python3
"""Replace only signed keepalive resources, retaining the live app/worker/PTY.

Rejects changed broker code, active requests or keepalive calls. Uses an atomic
bundle exchange and keeps the previous signed bundle for recovery. Never signals
the broker. The child's normal supervisor restarts it with the new resource.
"""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time
from build_app import APP, ROOT, STAMP, source_hash


def process_rows():
    text = subprocess.run(['/bin/ps', '-axo', 'pid=,ppid=,args='], capture_output=True,
                          text=True, check=True).stdout
    return [line.strip().split(None, 2) for line in text.splitlines() if line.strip()]


def inspect():
    runtime = Path.home() / 'Library/Caches/com.taylor.op-agent/status.json'
    status = json.loads(runtime.read_text())
    rows = process_rows()
    pid = status['pid']
    supervisor = next(int(ppid) for p, ppid, _ in rows if int(p) == pid)
    children = [int(p) for p, parent, args in rows if int(parent) == supervisor and
                args.endswith('/Contents/Resources/keepalive.py')]
    if len(children) != 1:
        raise RuntimeError('Cannot uniquely identify the hosted keepalive child')
    child = children[0]
    if any(int(parent) in (pid, child) for _, parent, _ in rows):
        raise RuntimeError('Broker request or keepalive subprocess is active; retry when idle')
    return status, child


def exchange(a, b):
    lib = ctypes.CDLL(None, use_errno=True)
    fn = lib.renameatx_np
    fn.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    if fn(-2, os.fsencode(a), -2, os.fsencode(b), 2) != 0:  # AT_FDCWD, RENAME_SWAP
        raise OSError(ctypes.get_errno(), 'Atomic bundle exchange failed')


def hash_with_keepalive(data):
    digest = hashlib.sha256()
    for path in (ROOT / 'src/onepassword/app/main.m', ROOT / 'src/onepassword/app/Info.plist',
                 ROOT / 'src/onepassword/op_agent.py', ROOT / 'src/onepassword/keepalive.py',
                 ROOT / 'src/onepassword/build_app.py'):
        digest.update(data if path.name == 'keepalive.py' else path.read_bytes())
    return digest.hexdigest()


def main():
    before, child = inspect()
    resources = APP / 'Contents/Resources'
    if (resources / 'op_agent.py').read_bytes() != (ROOT / 'src/onepassword/op_agent.py').read_bytes():
        raise RuntimeError('Broker source differs; full update must wait for a broker restart')
    # Verify that only the keepalive changed since a sealed build. Older
    # resource-only activations may have left their signed backup as provenance.
    candidates = [resources / 'keepalive.py'] + list(APP.parent.glob('previous-keepalive*.app/Contents/Resources/keepalive.py'))
    stamp = STAMP.read_text().strip()
    if not any(hash_with_keepalive(p.read_bytes()) == stamp for p in candidates):
        raise RuntimeError('Host, worker, plist or builder changed; defer full update until restart')
    expected = hashlib.sha256((ROOT / 'src/onepassword/keepalive.py').read_bytes()).hexdigest()
    previous = hashlib.sha256((resources / 'keepalive.py').read_bytes()).hexdigest()
    statefile = Path.home() / 'Library/Caches/com.taylor.op-keepalive/state.json'
    state = json.loads(statefile.read_text())
    if previous == expected and state.get('source_sha256') == expected and state.get('pid') == child:
        subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(APP)], check=True, capture_output=True)
        STAMP.write_text(source_hash() + '\n')
        print(json.dumps({'activated': True, 'already_current': True, 'broker_pid': before['pid'],
                          'tty': before['tty'], 'keepalive_pid': child, 'source_sha256': expected}))
        return
    backup = APP.parent / ('previous-keepalive-' + previous[:12] + '.app')
    if backup.exists():
        raise RuntimeError('Previous deployment backup exists; reconcile before another update')
    with tempfile.TemporaryDirectory(prefix='.keepalive-', dir=APP.parent) as tmp:
        stage = Path(tmp) / APP.name
        shutil.copytree(APP, stage)
        shutil.copy2(ROOT / 'src/onepassword/keepalive.py', stage / 'Contents/Resources/keepalive.py')
        subprocess.run(['/usr/bin/codesign', '--force', '--sign', '-', '--identifier', 'com.taylor.op-agent', str(stage)], check=True, capture_output=True)
        subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(stage)], check=True, capture_output=True)
        current, still_child = inspect()
        if current != before or still_child != child:
            raise RuntimeError('Process identity changed during preparation; no update applied')
        exchange(APP, stage)
        shutil.move(stage, backup)
        STAMP.write_text(source_hash() + '\n')
    # No running native executable or worker is killed or changed in memory.
    # Do not claim global source hash: this operation only updates keepalive.
    os.kill(child, signal.SIGTERM)
    for _ in range(55):
        state = json.loads(statefile.read_text())
        current = json.loads((Path.home() / 'Library/Caches/com.taylor.op-agent/status.json').read_text())
        if current != before:
            raise RuntimeError('Broker identity changed unexpectedly; human authorization may be required')
        if state.get('pid') != child and state.get('source_sha256') == expected:
            print(json.dumps({'activated': True, 'broker_pid': before['pid'], 'tty': before['tty'],
                              'keepalive_pid': state['pid'], 'source_sha256': expected,
                              'app_locked': state['app_locked'], 'backup': str(backup)}))
            return
        time.sleep(1)
    raise RuntimeError('Signed resource deployed; child activation not confirmed yet. Do not restart broker blindly.')


if __name__ == '__main__':
    main()
