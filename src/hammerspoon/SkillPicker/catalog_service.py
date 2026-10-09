"""Warm, read-only native skill inventory service. JSON lines in/out; no model turns."""
import json
import os
from pathlib import Path
import selectors
import subprocess
import sys
import time


class NativeInventory:
    def __init__(self, binary=None, home=None):
        self.home = Path(home or Path.home())
        self.binary = str(binary or self.home / '.local/bin/codex')
        self.proc = None
        self.buffer = b''
        self.next_id = 0
        self.catalog = []
        self.signature = None
        self.reloads = 0
        self.sel = selectors.DefaultSelector()

    def close(self):
        if self.proc:
            proc, self.proc = self.proc, None
            self.sel.unregister(proc.stdout)
            proc.terminate()
            try:
                proc.wait(timeout=1)
            except subprocess.TimeoutExpired:
                proc.kill(); proc.wait()
            proc.stdin.close(); proc.stdout.close()
            self.buffer = b''

    def call(self, method, params, timeout=5):
        self.next_id += 1
        ident = self.next_id
        self.proc.stdin.write((json.dumps({'id': ident, 'method': method, 'params': params}) + '\n').encode())
        self.proc.stdin.flush()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if b'\n' not in self.buffer:
                if not self.sel.select(.05):
                    continue
                chunk = os.read(self.proc.stdout.fileno(), 65536)
                if not chunk:
                    raise RuntimeError('Native inventory exited')
                self.buffer += chunk
                continue
            line, self.buffer = self.buffer.split(b'\n', 1)
            try:
                reply = json.loads(line)
            except json.JSONDecodeError:
                continue
            if reply.get('id') == ident:
                if 'error' in reply:
                    raise RuntimeError('Native inventory refused request')
                return reply['result']
        raise TimeoutError('Native inventory timed out')

    def start(self):
        if self.proc and self.proc.poll() is None:
            return
        self.close()
        self.proc = subprocess.Popen([self.binary, 'app-server', '--stdio'],
            cwd=self.home, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, bufsize=0)
        self.sel.register(self.proc.stdout, selectors.EVENT_READ)
        self.call('initialize', {'clientInfo': {'name': 'hammerspoon_skill_picker', 'version': '2.0'}})
        self.proc.stdin.write(b'{"method":"initialized","params":{}}\n')
        self.proc.stdin.flush()
        self.signature = None

    def fingerprint(self):
        """Metadata only. No file contents or recursive scans of plugin bundles."""
        paths = set()
        seen = set()
        roots = [self.home / '.codex/skills', self.home / '.agents/skills']
        for root in roots:
            if root.exists():
                for directory, dirs, files in os.walk(root, followlinks=True):
                    # Skills can be symlinked; prevent directory cycles explicitly.
                    real = os.path.realpath(directory)
                    if real in seen:
                        dirs[:] = []
                        continue
                    seen.add(real)
                    for filename in files:
                        if filename in ('SKILL.md', 'openai.yaml'):
                            paths.add(str(Path(directory) / filename))
        for item in self.catalog:
            p = Path(item['path'])
            paths.update((str(p), str(p.parent), str(p.parent / 'agents/openai.yaml')))
            # Stop at the collection root: unrelated changes in ~/.codex or
            # the home directory must not invalidate the inventory.
            for parent in p.parents:
                paths.add(str(parent))
                if parent.name == 'skills':
                    break
        for extra in ('.codex/config.toml', '.codex/plugins', '.codex/plugins/cache',
                      '.codex/plugins/.plugin-appserver', '.agents', '.codex/skills'):
            paths.add(str(self.home / extra))
        cache = self.home / '.codex/plugins/cache'
        if cache.exists():
            # Publisher/plugin/version directories change on installs/removals.
            for publisher in cache.iterdir():
                paths.add(str(publisher))
                if publisher.is_dir():
                    for plugin in publisher.iterdir():
                        paths.add(str(plugin))
        values = []
        for path in sorted(paths):
            try:
                s = os.stat(path)
                values.append((path, s.st_mtime_ns, s.st_ctime_ns, s.st_size, s.st_ino))
            except OSError:
                values.append((path, None))
        return tuple(values)

    def refresh(self, query=''):
        start = time.perf_counter()
        self.start()
        signature = self.fingerprint()
        changed = signature != self.signature
        if changed:
            data = self.call('skills/list', {'cwds': [str(self.home)], 'forceReload': True})['data'][0]
            if data.get('errors'):
                raise RuntimeError('Incomplete native inventory')
            self.catalog = sorted([{'name': s['name'], 'path': s['path']}
                for s in data['skills'] if s.get('enabled')],
                key=lambda s: (s['name'].casefold(), s['path']))
            self.signature = self.fingerprint()
            self.reloads += 1
        normalize = lambda value: ' '.join(value.casefold().replace('-', ' ').replace('_', ' ').split())
        needle = normalize(query)
        skills = [s for s in self.catalog if needle in normalize(s['name'])]
        return {'skills': skills, 'changed': changed, 'count': len(self.catalog),
                'elapsed_ms': round((time.perf_counter() - start) * 1000, 3), 'reloads': self.reloads}


def main():
    import signal
    def terminate(*_):
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, terminate)
    from union_inventory import UnionInventory
    service = UnionInventory(NativeInventory)
    try:
        try:
            warm = service.refresh()
            print(json.dumps({'action': 'ready', **warm}), flush=True)
        except Exception:
            print(json.dumps({'action': 'ready', 'error': True}), flush=True)
        for line in sys.stdin:
            try:
                request = json.loads(line)
                if request.get('action') == 'quit':
                    break
                if request.get('action') != 'refresh':
                    continue
                try:
                    reply = service.refresh(str(request.get('query', '')))
                    print(json.dumps({'id': request['id'], **reply}), flush=True)
                except Exception:
                    service.close()
                    print(json.dumps({'id': request.get('id'), 'error': True}), flush=True)
            except (ValueError, KeyError):
                continue
    finally:
        service.close()
        service.dispose()


if __name__ == '__main__':
    main()
