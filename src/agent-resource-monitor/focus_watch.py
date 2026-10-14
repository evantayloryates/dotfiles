#!/usr/bin/env python3
"""Bounded process-delta attribution beside the existing pressure recorder."""
import argparse
from collections import deque
import ctypes
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import sys
import threading
import time
import uuid

import monitor
import watcher
import task_capture

ROOT = watcher.data_root() / 'focus'
VERSION = 1
IDENTITY_POLICY = 'early-task-v1'
DIAGNOSTIC_POLICY = 'late-stack-v1'
INTERVAL = 5.
DENSE_INTERVAL = 2.
WINDOW = 90.
COOLDOWN = 900.
BUDGET = 256 * monitor.MIB
LIMITS = 'Observational ranking, not causal proof. CPU is percent of one core. I/O counters do not identify swap ownership. Footprints are not resident RAM. Processes shorter than the cadence can be missed. No raw argv/environment, chat content or file contents.'


def lifetime(p):
    return (p['pid'], p.get('start_ticks'))


def deltas(current, previous, elapsed):
    """Never carry counters or provenance across PID reuse or unavailable metrics."""
    if not previous or current.get('start_ticks') is None or lifetime(current) != lifetime(previous) or elapsed <= 0:
        return {}
    out = {}
    for key, unit, result in [('cpu_ns', 1e9 / 100, 'cpu_percent'),
                              ('read_bytes', monitor.MIB, 'read_mib_s'),
                              ('write_bytes', monitor.MIB, 'write_mib_s'),
                              ('pageins', 1, 'pageins_s')]:
        a, b = current.get(key), previous.get(key)
        out[result] = (a-b)/elapsed/unit if a is not None and b is not None and a >= b else None
    if current.get('footprint_bytes') is not None and previous.get('footprint_bytes') is not None:
        out['footprint_delta_bytes'] = current['footprint_bytes']-previous['footprint_bytes']
    return out


class FastMac(monitor.Mac):
    def __init__(self):
        super().__init__()
        self.last = None
        self.host_previous = None

    def host_cpu(self):
        ticks=(ctypes.c_uint32*4)();count=ctypes.c_uint32(4)
        if self.lib.host_statistics(self.lib.mach_host_self(),3,ctypes.byref(ticks),ctypes.byref(count)):
            return {'status':'unavailable'}
        current=list(ticks);old=self.host_previous;self.host_previous=current
        if old is None or any(a<b for a,b in zip(current,old)):
            return {'status':'warming'}
        changes=[a-b for a,b in zip(current,old)];total=sum(changes)
        return {'status':'ok',**{k:100*v/total if total else None for k,v in zip(('user_pct','system_pct','idle_pct','nice_pct'),changes)}}

    def sample(self):
        start = time.monotonic()
        raw = watcher.run(['/bin/ps', '-axo', 'pid=,ppid=,rss='], timeout=2, limit=256*1024)
        rows = []
        identities = 0
        live = set()
        paths = {}
        for line in raw.get('output', '').splitlines()[:4096]:
            try:
                pid, ppid, rss = map(int, line.split())
            except ValueError:
                continue
            path = ctypes.create_string_buffer(4096)
            exe = path.value.decode(errors='replace') if self.proc.proc_pidpath(pid, path, len(path)) > 0 else 'unknown'
            u = monitor.Usage()
            available = self.proc.proc_pid_rusage(pid, 2, ctypes.byref(u)) == 0
            p = dict(pid=pid, ppid=ppid, rss_bytes=rss*1024, start_ticks=u.start if available else None,
                     exe=os.path.basename(exe), **monitor.identity(exe, [], {}))
            if available:
                key = (pid, u.start, exe)
                live.add(key)
                paths[key] = exe
                p.update(self.cache.get(key, {}))
                p.update(cpu_ns=(u.user+u.system)*self.timebase, footprint_bytes=u.footprint,
                         read_bytes=u.read_bytes, write_bytes=u.write_bytes, pageins=u.pageins)
            rows.append(p)
        elapsed = start-self.last['monotonic'] if self.last else 0
        old = {lifetime(p):p for p in self.last['processes']} if self.last else {}
        for p in rows:
            p.update(deltas(p, old.get(lifetime(p)), elapsed))
        # Select identity probes after cheap counters, within the existing budget.
        exe_by_pid = {key[0]:key[2] for key in paths}
        eligible = [p for p in rows if p['start_ticks'] is not None
                    and (p['pid'], p['start_ticks'], exe_by_pid[p['pid']]) not in self.cache]
        def priority(p):
            return max((p.get('cpu_percent') or 0)/40,
                       max(0,p.get('footprint_delta_bytes') or 0)/(256*monitor.MIB),
                       (p.get('read_mib_s') or 0)/32,
                       (p.get('pageins_s') or 0)/2048,
                       (p.get('footprint_bytes') or 0)/(2*1024*monitor.MIB))
        ordered = sorted(eligible, key=lambda p:(-priority(p),p['pid']))
        # Reserve up to four probes for immediate ancestors of the hottest unknowns.
        by_pid = {p['pid']:p for p in eligible}
        # Reserve some of the same twenty probes for new Node lifetimes before
        # their worker argv can disappear. Remaining slots still favor hot work.
        fresh_nodes = [p for p in ordered if p['exe']=='node' and lifetime(p) not in old]
        chosen = fresh_nodes[:8]
        chosen_pids = {p['pid'] for p in chosen}
        for p in ordered:
            if len(chosen)>=16: break
            if p['pid'] not in chosen_pids:
                chosen.append(p); chosen_pids.add(p['pid'])
        chosen_pids = {p['pid'] for p in chosen}
        for p in chosen[:4]:
            parent = by_pid.get(p['ppid'])
            if parent and parent['pid'] not in chosen_pids and len(chosen)<20:
                chosen.append(parent); chosen_pids.add(parent['pid'])
        for p in ordered:
            if len(chosen)>=20: break
            if p['pid'] not in chosen_pids:
                chosen.append(p); chosen_pids.add(p['pid'])
        for p in chosen:
            key=(p['pid'],p['start_ticks'],exe_by_pid[p['pid']])
            argv, env = self.procargs(p['pid'])
            self.cache[key] = monitor.identity(paths[key],argv,env)
            self.cache[key]['task_identity'] = task_capture.identify(argv)
            p.update(self.cache[key]); identities += 1
        monitor.resolve_ancestry(rows)
        self.cache = {k:v for k,v in self.cache.items() if k in live}
        result = dict(timestamp=monitor.now(), monotonic=start, processes=rows,
                      interval_seconds=elapsed,
                      cpu_delta_covered=sum(p.get('cpu_percent') is not None for p in rows),
                      io_delta_covered=sum(p.get('read_mib_s') is not None for p in rows),
                      host_cpu=self.host_cpu(),
                      collection_ms=1000*(time.monotonic()-start),
                      health=raw['status'] if not raw.get('truncated') else 'truncated',
                      identity_lookups=identities, identity_policy=IDENTITY_POLICY,
                      task_capture_policy=task_capture.POLICY,
                      task_identity_covered=sum(bool(p.get('task_identity')) for p in rows),
                      task_names_covered=sum(bool((p.get('task_identity') or {}).get('task')) for p in rows))
        self.last = result
        return result


def select(row, previous=None):
    rows = row['processes']
    chosen = {}
    for key in ('cpu_percent', 'read_mib_s', 'write_mib_s', 'pageins_s', 'footprint_bytes', 'footprint_delta_bytes'):
        for p in sorted(rows, key=lambda p:p.get(key) or 0, reverse=True)[:10]:
            chosen[lifetime(p)] = p
    old = {lifetime(p):p for p in previous['processes']} if previous else {}
    live = {lifetime(p):p for p in rows}
    born = [p for k,p in live.items() if k not in old] if previous else []
    for p in born[:20]:
        chosen[lifetime(p)] = p
    # Ancestors of selected workers preserve launch lineage without whole-tree payloads.
    by_pid = {p['pid']:p for p in rows}
    for p in list(chosen.values()):
        seen = set()
        for _ in range(6):
            parent = by_pid.get(p['ppid'])
            if not parent or parent['pid'] in seen:
                break
            seen.add(parent['pid']); chosen[lifetime(parent)] = parent; p = parent
    def brief(p):
        return {k:p.get(k) for k in ('pid','ppid','start_ticks','exe','role','owner','owner_evidence','script_names','task_identity')}
    return {k:v for k,v in row.items() if k!='processes'} | dict(
        process_count=len(rows), processes=list(chosen.values())[:120],
        births=[brief(p) for p in born[:40]], birth_count=len(born),
        exits=[brief(p) for k,p in old.items() if k not in live][:40],
        exit_count=sum(k not in live for k in old))


def pressure(root, previous=None):
    try:
        raw = json.loads((root.parent/'btle/status.json').read_text())['pressure']
        age = time.time()-monitor.epoch(raw['timestamp'])
        if 0 <= age < 15 and raw.get('available'):
            return dict(raw, source='btle-shared'), previous
    except (OSError, ValueError, KeyError):
        pass
    row = watcher.light_sample(previous)
    return dict(row, source='local-fallback'), row


def severe(p):
    return bool(p.get('available') and ((p.get('paging_mib_s') or 0) >= 128 or
                ((p.get('compression_ratio') or 0) >= .3 and (p.get('compressor_mib_s') or 0) >= 1024)))


def quiet(p):
    return (p.get('available') and p.get('pressure_level') == 1 and
            p.get('paging_mib_s') is not None and p['paging_mib_s'] < 8 and
            p.get('compressor_mib_s') is not None and p['compressor_mib_s'] < 64)


class Gate:
    """Distinct pressure readings; no recovery or sustained onset across a gap."""
    def __init__(self):
        self.hits = 0
        self.stamp = None
        self.last_tick = None
        self.quiet_since = None
        self.cpu_since = None
        self.system_since = None

    def evaluate(self, p, tick, host=None):
        gap = self.last_tick is not None and tick-self.last_tick > 30
        self.last_tick = tick
        if gap:
            self.hits = 0
            self.quiet_since = None
            self.cpu_since = self.system_since = None
        if p['timestamp'] != self.stamp:
            self.hits = self.hits+1 if severe(p) else 0
            self.stamp = p['timestamp']
        host = host or {}
        idle = host.get('idle_pct') if host.get('status')=='ok' else None
        busy = 100-idle if idle is not None else None
        cpu_hot = busy is not None and busy >= 90
        system_hot = busy is not None and busy >= 70 and (host.get('system_pct') or 0) >= 40
        self.cpu_since = (self.cpu_since if self.cpu_since is not None else tick) if cpu_hot else None
        self.system_since = (self.system_since if self.system_since is not None else tick) if system_hot else None
        cpu_trigger = self.cpu_since is not None and tick-self.cpu_since >= 30
        system_trigger = self.system_since is not None and tick-self.system_since >= 15
        self.quiet_since = (self.quiet_since if self.quiet_since is not None else tick) if quiet(p) and busy is not None and busy < 70 and not gap else None
        return dict(start=self.hits >= 2 or cpu_trigger or system_trigger,
                    reasons=(['pressure'] if self.hits>=2 else [])+(['host_cpu'] if cpu_trigger else [])+(['system_cpu'] if system_trigger else []),
                    recovered=self.quiet_since is not None and tick-self.quiet_since >= 120, gap=gap)


def stack_frames(output):
    # Keep symbol/count frames only. Drop thread names, headers, paths and binary images.
    return '\n'.join(line[:400] for line in output.splitlines()
                     if re.match(r'^\s*[+!:| ]*\d+\s+\S+', line)
                     and not re.search(r'(Thread_|thread name|DispatchQueue|/Users/|/Volumes/)', line))[:128*1024]


def diagnostics(path, targets, include_docker=True):
    result = dict(timestamp=monitor.now(), stacks=[], limitation=LIMITS,
                  diagnostic_policy=DIAGNOSTIC_POLICY, task_capture_policy=task_capture.POLICY)
    for p in targets[:2]:
        attempted_at = monitor.now()
        current = monitor.Usage()
        lib = ctypes.CDLL('/usr/lib/libproc.dylib')
        if lib.proc_pid_rusage(p['pid'], 2, ctypes.byref(current)) != 0 or current.start != p['start_ticks']:
            result['stacks'].append(dict(pid=p['pid'], start_ticks=p['start_ticks'],
                                        timestamp=attempted_at, status='exited_or_changed_or_inaccessible'))
            continue
        r = watcher.run(['/usr/bin/sample', str(p['pid']), '1', '10'], timeout=4, limit=256*1024)
        frames = stack_frames(r.get('output',''))
        result['stacks'].append(dict(pid=p['pid'], start_ticks=p['start_ticks'], exe=p['exe'],
                                    timestamp=attempted_at,
                                    status='captured' if frames else r['status'] if r['status']!='ok' else 'no_frames',
                                    frames=frames, duration_ms=r['duration_ms'], truncated=r.get('truncated',False)))
    docker = next((x for x in ('/usr/local/bin/docker','/opt/homebrew/bin/docker') if Path(x).exists()), None)
    if docker and include_docker:
        r = watcher.run([docker,'stats','--no-stream','--format','{{json .}}'], timeout=3, limit=65536)
        result['docker'] = {k:v for k,v in r.items() if k!='output'}
        result['docker']['timestamp'] = monitor.now()
        if r['status']=='ok':
            try:
                result['docker']['containers'] = [{k:v for k,v in json.loads(l).items() if k in
                    ('ID','Name','CPUPerc','MemUsage','MemPerc','BlockIO','PIDs')} for l in r.get('output','').splitlines()][:30]
            except ValueError:
                result['docker']['status'] = 'invalid'
        if result['docker']['status']=='ok':
            result['guest_processes'] = task_capture.guest_rankings(
                docker,result['docker'].get('containers',[]),watcher.run,monitor.now)
        else:
            result['guest_processes'] = dict(status='not_run_stats_unavailable',policy=task_capture.POLICY)
    # Evidence runs diagnostic jobs serially. A later stack job must retain the
    # earlier Docker snapshot and all prior attempts, including failures.
    try:
        previous = json.loads((path/'diagnostics.json').read_text())
    except FileNotFoundError:
        previous = None
    if previous is not None:
        result['updated_at'] = result['timestamp']
        result['timestamp'] = previous['timestamp']
        result['stacks'] = previous.get('stacks', []) + result['stacks']
        for key in ('docker','guest_processes'):
            if key not in result and key in previous:
                result[key] = previous[key]
    watcher.write_json(path/'diagnostics.json', result)


class Evidence:
    def __init__(self, root, incident, prelude):
        self.path = root/'captures'/('capture-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
        self.path.mkdir(parents=True, mode=0o700)
        self.started = time.monotonic()
        self.incident = incident
        self.rows = []
        self.peaks = {}
        self.hot = {}
        self.previous_hot = set()
        self.diagnostic_thread = None
        self.docker_requested = False
        self.stack_attempted = set()
        self.bytes = 0
        watcher.write_json(self.path/'metadata.json', dict(version=VERSION, incident=incident,
                           started_at=monitor.now(), interval_seconds=DENSE_INTERVAL, prelude_seconds=120,
                           diagnostic_policy=DIAGNOSTIC_POLICY, task_capture_policy=task_capture.POLICY, limits=LIMITS))
        for row in prelude:
            self.append(row, prelude=True)

    def append(self, row, prelude=False):
        raw = json.dumps(dict(row, prelude=prelude))+'\n'
        if self.bytes+len(raw) > 8*monitor.MIB:
            return False
        with (self.path/'samples.jsonl').open('a') as f:
            f.write(raw)
        self.bytes += len(raw)
        self.rows.append(row)
        for p in row['processes']:
            key = lifetime(p)
            peak = self.peaks.setdefault(key, {k:p.get(k) for k in
                    ('pid','ppid','start_ticks','exe','role','owner','owner_evidence','script_names','task_identity')})
            if p.get('task_identity'):
                peak['task_identity'] = p['task_identity']
            if p.get('owner'):
                peak.update(owner=p['owner'], owner_evidence=p['owner_evidence'])
            for metric in ('cpu_percent','read_mib_s','write_mib_s','pageins_s','footprint_bytes','rss_bytes','footprint_delta_bytes'):
                if p.get(metric) is not None:
                    peak[metric] = max(peak.get(metric, p[metric]), p[metric])
            if not prelude:
                for metric, scale, result in [('cpu_percent',.01,'observed_cpu_seconds'),
                        ('read_mib_s',1,'observed_read_mib'),('write_mib_s',1,'observed_write_mib'),
                        ('pageins_s',1,'observed_pageins')]:
                    if p.get(metric) is not None:
                        peak[result] = peak.get(result,0)+p[metric]*scale*row.get('interval_seconds',0)
        current_hot = {lifetime(p) for p in row['processes'] if (p.get('cpu_percent') or 0)>=40}
        self.hot = {key:self.hot.get(key,0)+1 if key in self.previous_hot else 1 for key in current_hot}
        self.previous_hot = current_hot
        if not prelude:
            self.schedule_diagnostics(row)
        return True

    def schedule_diagnostics(self, row):
        if self.diagnostic_thread is not None and self.diagnostic_thread.is_alive():
            return
        remaining = 2-len(self.stack_attempted)
        candidates = sorted([p for p in row['processes']
                             if self.hot.get(lifetime(p),0)>=3
                             and p.get('start_ticks') is not None and p['pid']!=os.getpid()
                             and lifetime(p) not in self.stack_attempted],
                            key=lambda p:p.get('cpu_percent') or 0, reverse=True)[:remaining]
        include_docker = not self.docker_requested and (bool(candidates) or time.monotonic()-self.started >= 30)
        if not candidates and not include_docker:
            return
        # Reserve attempts before launch: timeout, exit and PID changes all count
        # against the same two-attempt budget. Docker runs once per window.
        self.stack_attempted.update(lifetime(p) for p in candidates)
        self.docker_requested |= include_docker
        self.diagnostic_thread = threading.Thread(target=diagnostics, args=(self.path,candidates),
                                                   kwargs=dict(include_docker=include_docker), daemon=True)
        self.diagnostic_thread.start()

    def report(self, state):
        ranks = {}
        for metric in ('observed_cpu_seconds','observed_read_mib','observed_write_mib','observed_pageins',
                       'cpu_percent','read_mib_s','write_mib_s','pageins_s','footprint_delta_bytes','footprint_bytes'):
            ranks[metric] = sorted(self.peaks.values(),key=lambda p:p.get(metric) or 0,reverse=True)[:10]
        value = dict(version=VERSION, incident=self.incident, state=state, updated_at=monitor.now(),
                     sample_count=len(self.rows), first_sample=self.rows[0]['timestamp'] if self.rows else None,
                     last_sample=self.rows[-1]['timestamp'] if self.rows else None, rankings=ranks,
                     pressure_peak={k:max((r['pressure'][k] for r in self.rows if r.get('pressure',{}).get(k) is not None),default=None)
                                    for k in ('paging_mib_s','swap_out_mib_s','compressor_mib_s')},
                     diagnostics='diagnostics.json' if (self.path/'diagnostics.json').exists() else 'not yet captured',
                     diagnostic_policy=DIAGNOSTIC_POLICY, stack_attempts_reserved=len(self.stack_attempted),
                     task_capture_policy=task_capture.POLICY,
                     docker_requested=self.docker_requested,
                     limits=LIMITS,
                     totals_note='Observed totals cover retained selected intervals only; not whole-lifetime totals. Prelude excluded from totals.',
                     next_tests=['Compare birth/exit chronology with the pressure slope and per-lifetime deltas.',
                                 'Inspect captured symbols before blaming an app; owner IDs are launch provenance.',
                                 'Compare subsequent windows and recovery; propose one reversible workload change only after identifying its owner.'])
        watcher.write_json(self.path/'analysis.json', value)
        return value


def watch(args):
    if sys.platform!='darwin':
        raise SystemExit('macOS only')
    root = Path(args.root).expanduser().resolve() if args.root else ROOT
    root.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (root/'watch.lock').open('a') as lock:
        try:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('focus watcher already running')
        state_path = root/'incidents.json'
        try:
            state = json.loads(state_path.read_text())
        except FileNotFoundError:
            state = dict(version=VERSION, incidents=[], active=None)
        # A restart is explicitly incomplete, never a claimed recovery.
        for capture in (root/'captures').glob('*/analysis.json'):
            d = json.loads(capture.read_text())
            if d.get('state')=='capturing':
                d.update(state='observer_interrupted', updated_at=monitor.now());watcher.write_json(capture,d)
        source_sha256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        task_capture_sha256 = hashlib.sha256(Path(task_capture.__file__).read_bytes()).hexdigest()
        machine = FastMac(); prelude = deque(maxlen=60); previous = None; prev_pressure = None
        stopped = threading.Event()
        signal.signal(signal.SIGTERM,lambda *_:stopped.set());signal.signal(signal.SIGINT,lambda *_:stopped.set())
        start = time.monotonic(); capture = None; gate = Gate()
        last_capture_wall = state.get('last_capture_epoch', 0)
        storage = sum(f.stat().st_size for f in (root/'captures').glob('*/*') if f.is_file()); next_storage = 0
        while not stopped.is_set() and (not args.seconds or time.monotonic()-start<args.seconds):
            tick = time.monotonic(); p,prev_pressure = pressure(root,prev_pressure)
            raw = machine.sample()
            decision = gate.evaluate(p,tick,raw['host_cpu'])
            if decision['recovered'] and state['active']:
                item = next(x for x in state['incidents'] if x['id']==state['active'])
                item['recovered_at'] = monitor.now();state['active'] = None;watcher.write_json(state_path,state)
            if tick>=next_storage:
                storage = sum(f.stat().st_size for f in (root/'captures').glob('*/*') if f.is_file());next_storage=tick+60
            degraded = 'storage_budget' if storage>=BUDGET or shutil.disk_usage(root).free<5*1024**3 else None
            row = select(raw,previous);previous=raw
            row['pressure'] = {k:v for k,v in p.items() if k!='vm'};row['sampling_gap'] = decision['gap']
            row['trigger_reasons'] = decision['reasons']
            prelude.append(row)
            # Slow collection reduces duty cycle; it never runs concurrent full scans.
            interval = max(DENSE_INTERVAL if capture else INTERVAL, raw['collection_ms']/1000*10)
            if degraded is None and raw['health']=='ok' and decision['start'] and capture is None and time.time()-last_capture_wall>=COOLDOWN:
                if not state['active']:
                    state['active'] = 'pressure-'+str(uuid.uuid4())
                    state['incidents'].append(dict(id=state['active'],started_at=monitor.now(),captures=[]))
                capture = Evidence(root,state['active'],[r for r in prelude if r is not row and tick-r['monotonic']<=120])
                item=next(x for x in state['incidents'] if x['id']==state['active']);item['captures'].append(str(capture.path))
                last_capture_wall = time.time();state['last_capture_epoch'] = last_capture_wall
                watcher.write_json(state_path,state)
            if capture:
                okay=capture.append(row);storage+=len(json.dumps(row))
                if tick-capture.started>=WINDOW or not okay or degraded:
                    outcome = 'captured' if okay and not degraded else 'capture_budget'
                    capture.report(outcome);capture=None
                    state['capture_failure'] = None if outcome=='captured' else outcome
                    watcher.write_json(state_path,state)
                else:
                    capture.report('capturing')
            watcher.write_json(root/'status.json',dict(version=VERSION,pid=os.getpid(),timestamp=monitor.now(),
                state='capturing' if capture else 'watching',active_incident=state['active'],
                capture_path=str(capture.path) if capture else None,
                health=degraded or state.get('capture_failure') or (raw['health'] if p.get('available') else 'pressure_unavailable'),
                pressure_source=p['source'],pressure_timestamp=p['timestamp'],process_count=row['process_count'],
                pressure=row['pressure'],trigger_reasons=decision['reasons'],
                cpu_delta_covered=raw['cpu_delta_covered'],io_delta_covered=raw['io_delta_covered'],
                identity_policy=IDENTITY_POLICY,identity_lookups=raw.get('identity_lookups'),source_sha256=source_sha256,
                diagnostic_policy=DIAGNOSTIC_POLICY,
                task_capture_policy=task_capture.POLICY,task_capture_sha256=task_capture_sha256,
                task_identity_covered=raw.get('task_identity_covered'),task_names_covered=raw.get('task_names_covered'),
                host_cpu=raw['host_cpu'],collection_ms=raw['collection_ms'],next_interval_seconds=interval,bytes_retained=storage,
                policy=dict(baseline_seconds=INTERVAL,dense_seconds=DENSE_INTERVAL,window_seconds=WINDOW,
                            cooldown_seconds=COOLDOWN,budget_bytes=BUDGET,stacks_per_window=2),limits=LIMITS))
            stopped.wait(min(interval,max(0,args.seconds-(time.monotonic()-start))) if args.seconds else interval)
        if capture:
            capture.report('observer_stopped')
        watcher.write_json(root/'status.json',dict(version=VERSION,pid=os.getpid(),timestamp=monitor.now(),state='stopped'))


def main():
    os.umask(0o077)
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='mode',required=True)
    w=sub.add_parser('watch');w.add_argument('--root');w.add_argument('--seconds',type=float,default=0)
    s=sub.add_parser('status');s.add_argument('--root')
    args=parser.parse_args()
    if args.mode=='watch':
        watch(args)
    else:
        root=Path(args.root).expanduser() if args.root else ROOT
        print((root/'status.json').read_text() if (root/'status.json').exists() else '{"state":"not_installed"}')


if __name__=='__main__':
    try:
        main()
    except Exception as exc:
        print('focus watcher failed: '+type(exc).__name__,file=sys.stderr);sys.exit(1)
