"""Configured provider union. Only confirmed snapshots are published; no skill writes."""
import hashlib
import json
import os
from pathlib import Path
import re
import time


def metadata(paths):
    result = []
    for path in sorted(paths):
        try:
            s = os.stat(path)
            result.append((str(path), s.st_mtime_ns, s.st_ctime_ns, s.st_size, s.st_ino))
        except FileNotFoundError:
            result.append((str(path), None))
    return tuple(result)


class DirectoryProvider:
    def __init__(self, root):
        self.root = Path(root)
        self.signature = None
        self.catalog = []
        self.reloads = 0

    def files(self):
        try:
            self.root.stat()
        except FileNotFoundError:
            return []
        paths, seen = [], set()
        def fail(error):
            raise error
        for directory, dirs, files in os.walk(self.root, followlinks=True, onerror=fail):
            real = os.path.realpath(directory)
            if real in seen:
                dirs[:] = []
                continue
            seen.add(real)
            if 'SKILL.md' in files:
                paths.append(Path(directory) / 'SKILL.md')
        return sorted(paths)

    @staticmethod
    def skill_metadata(path):
        # Read only a bounded YAML header. Skill bodies/memories are untouched.
        with path.open(encoding='utf-8') as f:
            header = f.read(32768)
        if not header.startswith('---\n'):
            raise ValueError('Skill has no frontmatter: ' + str(path))
        parts = re.split(r'^---\s*$', header, maxsplit=2, flags=re.M)
        if len(parts) < 3:
            raise ValueError('Incomplete skill frontmatter: ' + str(path))
        header = parts[1]
        match = re.search(r'^name:\s*(.*?)\s*$', header, re.M)
        value = match.group(1) if match else path.parent.name
        if value.startswith('"'):
            value = json.loads(value)
        elif value.startswith("'") and value.endswith("'"):
            value = value[1:-1].replace("''", "'")
        else:
            value = re.split(r'\s+#', value)[0].strip()
        if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]+', value):
            raise ValueError('Unsupported invocation name: ' + str(path))
        invocation = re.search(r'^user-invocable:[ \t]*(.*?)[ \t]*$', header, re.M)
        user_invocable = True
        if invocation:
            boolean = re.split(r'\s+#', invocation.group(1))[0].strip().lower()
            if boolean not in ('true', 'false'):
                raise ValueError('user-invocable must be a boolean: ' + str(path))
            user_invocable = boolean == 'true'
        return {'name': value, 'user_invocable': user_invocable}

    @staticmethod
    def name(path):
        return DirectoryProvider.skill_metadata(path)['name']

    def refresh(self):
        files = self.files()
        signature = metadata(files)
        changed = signature != self.signature
        if changed:
            catalog = []
            for path in files:
                item = self.skill_metadata(path)
                # Direct lookup must never offer internal routed references.
                # This policy belongs to each source, before harness unioning.
                if item['user_invocable']:
                    catalog.append({'name': item['name'], 'path': str(path)})
            # Retry if files changed while reading. Never commit mixed provenance.
            if signature != metadata(self.files()):
                raise RuntimeError('Skills changed during directory scan')
            self.catalog = catalog
            self.signature = signature
            self.reloads += 1
        return {'skills': self.catalog, 'changed': changed, 'reloads': self.reloads}


def reconcile(snapshots):
    """Equal invocation names merge across harnesses, never within one harness.

    Same-harness collisions split by owner so nested helper skills retain identity.
    Every record retains all attributed source paths, including divergent copies.
    """
    by_name = {}
    for harness, snapshot in snapshots:
        for item in snapshot['skills']:
            source = {'harness': harness, 'path': item['path']}
            by_name.setdefault(item['name'], []).append(source)
    result = []
    for name, sources in by_name.items():
        counts = {}
        for s in sources:
            counts[s['harness']] = counts.get(s['harness'], 0) + 1
        ambiguous = any(n > 1 for n in counts.values())
        groups = {}
        for source in sources:
            owner = Path(source['path']).parent.parent.name if ambiguous else ''
            groups.setdefault(owner, []).append(source)
        expanded = []
        for owner, group in groups.items():
            owner_counts = {}
            for source in group:
                owner_counts[source['harness']] = owner_counts.get(source['harness'], 0) + 1
            if any(count > 1 for count in owner_counts.values()):
                # An owner collision is insufficient evidence of shared identity.
                # Keep each source separate rather than choosing a cross-harness pair.
                for source in group:
                    expanded.append((owner, [source], owner + '\0' + source['harness'] + '\0' + source['path']))
            else:
                expanded.append((owner, group, owner))
        for owner, group, identity_key in expanded:
            group.sort(key=lambda s: (s['harness'], s['path']))
            preferred = next((s for s in group if s['harness'] == 'codex'), group[0])
            identity = hashlib.sha256((name + '\0' + identity_key).encode()).hexdigest()[:24]
            result.append({'id': identity, 'name': name, 'path': preferred['path'],
                'owner': owner, 'harnesses': sorted({s['harness'] for s in group}),
                'sources': group, 'ambiguous': ambiguous})
    return sorted(result, key=lambda s: (s['name'].casefold(), s['owner'], s['id']))


class UnionInventory:
    def __init__(self, native_factory, home=None, config=None):
        self.home = Path(home or Path.home())
        self.config = Path(config or Path(__file__).with_name('harnesses.json'))
        self.native_factory = native_factory
        self.providers = []
        self.config_signature = None
        self.catalog = []
        self.reloads = 0

    def configure(self):
        signature = metadata([self.config])
        if signature == self.config_signature:
            return False
        config = json.loads(self.config.read_text())
        providers, ids = [], set()
        try:
            for entry in config['harnesses']:
                ident = entry['id']
                if not re.fullmatch(r'[a-z][a-z0-9-]*', ident) or ident in ids:
                    raise ValueError('Invalid or duplicate harness id')
                ids.add(ident)
                if entry['provider'] == 'codex-native':
                    provider = self.native_factory(home=self.home)
                elif entry['provider'] == 'directory':
                    root = entry['root']
                    root = self.home / root[2:] if root.startswith('~/') else Path(root)
                    if not root.is_absolute():
                        raise ValueError('Harness root must be absolute')
                    provider = DirectoryProvider(root)
                else:
                    raise ValueError('Unknown inventory provider')
                providers.append((ident, provider))
            if not providers:
                raise ValueError('No harnesses configured')
        except Exception:
            for _, p in providers:
                if hasattr(p, 'close'): p.close(); p.sel.close()
            raise
        old = self.providers
        self.providers = providers
        self.config_signature = signature
        for _, p in old:
            if hasattr(p, 'close'): p.close(); p.sel.close()
        return True

    def refresh(self, query=''):
        start = time.perf_counter()
        changed = self.configure()
        snapshots = []
        for harness, provider in self.providers:
            snapshot = provider.refresh()
            snapshots.append((harness, snapshot))
            changed |= snapshot['changed']
        catalog = reconcile(snapshots)
        changed |= catalog != self.catalog
        if changed:
            self.catalog = catalog
            self.reloads += 1
        normalize = lambda v: ' '.join(v.casefold().replace('-', ' ').replace('_', ' ').split())
        needle = normalize(query)
        return {'skills': [s for s in self.catalog if needle in normalize(s['name'])],
            'changed': changed, 'count': len(self.catalog), 'reloads': self.reloads,
            'source_counts': {h: len(s['skills']) for h, s in snapshots},
            'elapsed_ms': round((time.perf_counter() - start) * 1000, 3)}

    def close(self):
        for _, p in self.providers:
            if hasattr(p, 'close'): p.close()

    def dispose(self):
        self.close()
        for _, p in self.providers:
            if hasattr(p, 'sel'): p.sel.close()
