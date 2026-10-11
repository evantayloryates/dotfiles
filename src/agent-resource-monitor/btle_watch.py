#!/usr/bin/env python3
"""One-second, content-free BTLEServer flight recorder; never remediates."""
import argparse
import ctypes
from collections import deque
import datetime as dt
import fcntl
import json
import itertools
import os
from pathlib import Path
import time
import watcher

ROOT = watcher.data_root() / 'btle'
THRESHOLD = 80.


def cpu_seconds(value):
    fields = value.split(':')
    return sum(float(v) * 60 ** i for i, v in enumerate(reversed(fields)))


def processes(all_processes=False):
    if all_processes:
        args = ['/bin/ps', '-axo', 'pid=,ppid=,rss=,time=']
    else:
        found = watcher.run(['/usr/bin/pgrep', '-x', 'BTLEServer'])
        pids = [p for p in found.get('output', '').split() if p.isdigit()]
        if not pids:
            return [], 'ok' if found.get('returncode') == 1 else found['status']
        args = ['/bin/ps', '-p', ','.join(pids), '-o', 'pid=,ppid=,rss=,time=']
    result = watcher.run(args, limit=1024*1024)
    lib = ctypes.CDLL('/usr/lib/libproc.dylib')
    rows = []
    for line in result.get('output', '').splitlines():
        fields = line.strip().split()
        if len(fields) == 4:
            pid, parent, rss, cpu = fields
            try:
                buf = ctypes.create_string_buffer(4096)
                lib.proc_pidpath(int(pid), buf, len(buf))
                rows.append(dict(pid=int(pid), ppid=int(parent), rss_bytes=int(rss)*1024,
                                 cpu_seconds=cpu_seconds(cpu), executable=buf.value.decode(errors='replace')))
            except ValueError:
                continue
    return rows, result['status']


def measure(previous=None):
    rows, health = processes()
    stamp = time.monotonic()
    targets = []
    for row in rows:
        if row['executable'] != '/usr/sbin/BTLEServer':
            continue
        row['cpu_percent'] = None
        if previous:
            old = next((p for p in previous['targets'] if p['pid'] == row['pid']), None)
            if old and row['cpu_seconds'] >= old['cpu_seconds'] and stamp > previous['monotonic']:
                row['cpu_percent'] = (row['cpu_seconds']-old['cpu_seconds'])/(stamp-previous['monotonic'])*100
        targets.append(row)
    return dict(timestamp=watcher.monitor.now(), monotonic=stamp, targets=targets,
                collection_health=health), rows


def high(row):
    return any((p.get('cpu_percent') or 0) >= THRESHOLD for p in row['targets'])


def status(root=ROOT):
    try:
        value = json.loads((root/'status.json').read_text())
        age = (dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(value['timestamp'])).total_seconds()
        value['age_seconds'] = round(age, 1)
        value['fresh'] = 0 <= age < 15
        value['preflight_warning'] = (not value['fresh'] or value.get('collection_health') != 'ok'
                                      or value.get('high_cpu', False))
        return value
    except (OSError, ValueError, KeyError):
        return dict(fresh=False, preflight_warning=True, state='unavailable')


def inventory(rows):
    # Executable paths only: no argv, environment, Bluetooth identifiers or log bodies.
    return [p for p in rows if any(s in p['executable'].lower() for s in
            ('bluetooth', 'btle', 'sharingd', 'rapportd', 'usbmux', 'remoted',
             'iphone', 'xcode', 'python', 'node', 'ios-agent'))]


def prune(root):
    files = sorted(root.glob('episode-*.json'), key=lambda p:p.stat().st_mtime, reverse=True)
    total = 0
    for i, file in enumerate(files):
        total += file.stat().st_size
        if i >= 100 or total > 32*1024**2 or time.time()-file.stat().st_mtime > 14*86400:
            file.unlink()


def watch(root=ROOT, count=None):
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root, 0o700)
    with (root/'watch.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        prune(root)
        previous = pressure = None
        ring = deque(maxlen=60)
        episode = None
        hits = quiet = 0
        for tick in range(count) if count is not None else itertools.count():
            started = time.monotonic()
            row, rows = measure(previous)
            previous = row
            if tick % 5 == 0:
                pressure = watcher.light_sample(pressure)
            row['pressure'] = pressure
            ring.append(row)
            hits = hits+1 if high(row) else 0
            quiet = 0 if high(row) else quiet+1
            if hits >= 5 and episode is None:
                key = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
                episode = dict(started_at=row['timestamp'], path=str(root/f'episode-{key}.json'),
                               samples=list(ring), candidate_inventory=inventory(processes(True)[0]),
                               attribution='Temporal correlation only; inventory does not establish a Bluetooth caller.',
                               stack_capture='Not attempted: previous unprivileged system-process sample was denied by macOS.')
            elif episode:
                episode['samples'].append(row)
            if episode:
                episode['last_sample_at'] = row['timestamp']
                if tick % 10 == 0:
                    episode['latest_candidate_inventory'] = inventory(processes(True)[0])
                watcher.write_json(Path(episode['path']), episode)
                if quiet >= 30 or len(episode['samples']) >= 360:
                    episode = None
                    # Sustained incidents rotate bounded bundles; no unbounded trace.
                    hits = 0
                    prune(root)
            watcher.write_json(root/'status.json', dict(**row, high_cpu=high(row),
                               sustained_high_cpu=hits >= 5, state='incident' if episode else 'watching',
                               watcher_pid=os.getpid(), interval_seconds=1, threshold_cpu_percent=THRESHOLD,
                               trigger_seconds=5, episode_path=episode['path'] if episode else None))
            time.sleep(max(0, 1-(time.monotonic()-started)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['watch','status','preflight','smoke'])
    parser.add_argument('--count', type=int)
    args = parser.parse_args()
    if args.action == 'watch':
        watch(count=args.count)
    elif args.action == 'smoke':
        assert cpu_seconds('1399:06.00') == 83946
        assert cpu_seconds('1:02:03.50') == 3723.5
        assert high({'targets':[{'cpu_percent':98}]})
        assert not high({'targets':[{'cpu_percent':None}]})
        a, _ = measure(); time.sleep(1); b, _ = measure(a)
        assert b['collection_health'] == 'ok'
        print(json.dumps(dict(ok=True, live_sample=b)))
    else:
        print(json.dumps(status(), indent=2))


if __name__ == '__main__':
    main()
