"""Incremental, metadata-only last-seen index for the audit's append-only JSONL."""
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path

VERSION = 1


def scan(source, cache_path, group, identity_digest, now):
    source, cache_path = Path(source), Path(cache_path)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = cache_path.with_suffix(cache_path.suffix+'.lock')
    with lock_path.open('a') as lock:
        lock_path.chmod(0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            cache = json.loads(cache_path.read_text())
        except (OSError, ValueError):
            cache = {}
        if (cache.get('version') != VERSION or cache.get('identity_digest') != identity_digest
                or cache.get('source') != str(source.resolve())):
            cache = {}
        files = {}; seen = {}; latest = None; coverage = 0
        stats = dict(bytes_read=0, rows_read=0, files_checked=0, unchanged_files=0, malformed_rows=0)
        cutoff = now-dt.timedelta(days=7)
        for path in sorted(source.glob('*/process_samples.jsonl')):
            key = str(path.relative_to(source))
            prior = cache.get('files', {}).get(key, {})
            try:
                with path.open('rb') as stream:
                    info = os.fstat(stream.fileno())
                    prefix = hashlib.sha256(stream.read(prior.get('prefix_length',256))).hexdigest()
                    signature = [info.st_dev, info.st_ino, getattr(info, 'st_birthtime', None)]
                    reusable = (prior.get('signature') == signature and prior.get('prefix') == prefix
                                and prior.get('offset', 0) <= info.st_size
                                and not (prior.get('offset') == info.st_size
                                         and prior.get('mtime_ns') != info.st_mtime_ns))
                    entry = dict(prior) if reusable else dict(offset=0, seen={}, latest=None, times=[])
                    entry['seen'] = dict(entry['seen']); entry['times'] = list(entry['times'])
                    stream.seek(entry['offset'])
                    consumed = 0
                    while True:
                        line = stream.readline()
                        if not line:
                            break
                        stats['bytes_read'] += len(line); consumed += len(line)
                        # A concurrent writer's incomplete last row must be retried.
                        if not line.endswith(b'\n'):
                            break
                        entry['offset'] = stream.tell()
                        try:
                            row = json.loads(line); timestamp = row['timestamp']
                            when = dt.datetime.fromisoformat(timestamp)
                            processes = row['processes']
                        except (ValueError, KeyError, TypeError):
                            stats['malformed_rows'] += 1
                            continue
                        stats['rows_read'] += 1
                        entry['latest'] = max(entry['latest'] or timestamp, timestamp)
                        if when >= cutoff:
                            entry['times'].append(timestamp)
                        for process in processes:
                            sid = group(process)
                            if sid:
                                entry['seen'][sid] = max(entry['seen'].get(sid, timestamp), timestamp)
                    prefix_length = min(256,entry['offset'])
                    stream.seek(0)
                    entry.update(signature=signature, prefix_length=prefix_length,
                                 prefix=hashlib.sha256(stream.read(prefix_length)).hexdigest(),
                                 mtime_ns=os.fstat(stream.fileno()).st_mtime_ns)
                    stats['files_checked'] += 1
                    stats['unchanged_files'] += bool(reusable and not consumed)
            except FileNotFoundError:
                continue  # Retention may remove an inactive source during discovery.
            entry['times'] = [t for t in entry['times'] if dt.datetime.fromisoformat(t) >= cutoff]
            coverage += len(entry['times'])
            if entry['latest']:
                latest = max(latest or entry['latest'], entry['latest'])
            for sid, timestamp in entry['seen'].items():
                seen[sid] = max(seen.get(sid, timestamp), timestamp)
            files[key] = entry
        value = dict(version=VERSION, source=str(source.resolve()), identity_digest=identity_digest, files=files)
        temporary = cache_path.with_suffix(cache_path.suffix+'.tmp')
        temporary.write_text(json.dumps(value)+'\n'); temporary.chmod(0o600)
        os.replace(temporary, cache_path)
        return seen, latest, coverage, stats
