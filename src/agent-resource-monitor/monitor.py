#!/usr/bin/env python3
"""Local macOS resource windows with bounded, content-free agent provenance."""
import argparse
import ctypes
import datetime as dt
import json
import os
from pathlib import Path
import re
import signal
import struct
import subprocess
import sys
import time

MIB = 1024**2
ID = re.compile(r'^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|thr_[a-zA-Z0-9_-]{8,100})$')
OWNER_KEYS = ('AGENT_RESOURCE_THREAD_ID', 'CODEX_THREAD_ID', 'CODEX_SESSION_ID',
              'CLAUDE_CODE_SESSION_ID', 'CLAUDE_SESSION_ID')


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def command(args):
    try:
        return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL, timeout=4)
    except (OSError, subprocess.SubprocessError):
        return ''


def decode_procargs(data):
    """KERN_PROCARGS2: argc, executable, padding, argv, then environment."""
    argc = struct.unpack_from('i', data)[0]
    if not 0 <= argc <= 100000:
        raise ValueError('Invalid argument count')
    pos = data.index(b'\0', 4) + 1
    while pos < len(data) and data[pos] == 0:
        pos += 1
    argv = []
    for _ in range(argc):
        end = data.index(b'\0', pos)
        argv.append(data[pos:end].decode(errors='replace'))
        pos = end + 1
    env = {}
    for entry in data[pos:].split(b'\0'):
        key, sep, value = entry.partition(b'=')
        key, value = key.decode(errors='replace'), value.decode(errors='replace')
        if sep and key in OWNER_KEYS and ID.fullmatch(value):
            env[key] = value
    return argv, env


def identity(exe, argv, env):
    # Executable identities are telemetry, not semantic classification of chat text.
    joined = ' '.join(argv)
    base = os.path.basename(exe)
    role = base
    if '/ChatGPT.app/' in exe:
        role = ('Codex GPU' if '--type=gpu-process' in argv else
                'Codex renderer' if '--type=renderer' in argv else
                'Codex tool runtime' if '/cua_node/' in exe else 'Codex backend' if base == 'codex' else 'Codex app')
    elif '/Docker.app/' in exe:
        role = 'Docker VM' if base == 'com.docker.sailor' else 'Docker'
    elif base == 'node':
        services = ('gmail-mcp-multiauth', '@notionhq/notion-mcp-server',
                    '@cloudinary/asset-management-mcp', '@playwright/mcp',
                    'claude-driver', 'classifier-mcp', 'zdr-ask-mcp',
                    'kickoff-stage-db-mcp', 'record-screen-mcp')
        service = next((s for s in services if any(s in a for a in argv)), None)
        if '/mcps/runtime/gmail-fork/index.js' in joined:
            role = 'MCP: gmail-mcp-multiauth'
        elif service: role = 'MCP: ' + service
        elif any('appium' in a for a in argv): role = 'Appium'
        elif 'metro' in joined or 'react-native start' in joined: role = 'Metro'
        elif 'agent-react-devtools' in joined: role = 'React DevTools'
    elif '/claude-code/' in exe or '/Claude.app/' in exe:
        role = 'Claude CLI' if '/claude-code/' in exe else 'Claude app'
    if base in ('node', 'node_repl') and ('npm-cli.js' in joined or 'npx-cli.js' in joined):
        role += ' launcher'
    owner, source = None, None
    for key in OWNER_KEYS:
        if key in env:
            owner = env[key]
            source = 'explicit-tag' if key.startswith('AGENT_') else 'process-environment:' + key
            break
    if not owner and role == 'Claude CLI':
        for flag in ('--session-id', '--resume'):
            if flag in argv:
                index = argv.index(flag) + 1
                if index < len(argv) and ID.fullmatch(argv[index]):
                    owner, source = argv[index], 'launch-argument:' + flag
                    break
    scripts = [os.path.basename(a) for a in argv if a.endswith(('.mjs', '.cjs', '.js'))][:3]
    return {'role': role, 'script_names': scripts, 'owner': owner, 'owner_evidence': source}


class Usage(ctypes.Structure):
    _fields_ = [('uuid', ctypes.c_uint8 * 16)] + [(name, ctypes.c_uint64) for name in
        ('user', 'system', 'idle_wakes', 'interrupt_wakes', 'pageins', 'wired', 'resident',
         'footprint', 'start', 'exit', 'child_user', 'child_system', 'child_idle',
         'child_interrupt', 'child_pageins', 'child_elapsed', 'read_bytes', 'write_bytes')]


def resolve_ancestry(processes):
    by_pid = {p['pid']:p for p in processes}
    for p in processes:
        if p['owner'] or p['start_ticks'] is None:
            continue
        ancestor, visited = p, {p['pid']}
        while ancestor['ppid'] in by_pid and ancestor['ppid'] not in visited:
            parent = by_pid[ancestor['ppid']]
            visited.add(parent['pid'])
            if parent['start_ticks'] is None or parent['start_ticks'] > ancestor['start_ticks']:
                break
            if parent['owner']:
                p.update(owner=parent['owner'], owner_evidence='ancestor:' + str(parent['pid']))
                break
            ancestor = parent


class Mac:
    def __init__(self):
        self.lib = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
        self.proc = ctypes.CDLL('/usr/lib/libproc.dylib', use_errno=True)
        self.proc.proc_pid_rusage.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_void_p]
        self.proc.proc_pid_rusage.restype = ctypes.c_int
        self.proc.proc_pidpath.argtypes = [ctypes.c_int,ctypes.c_void_p,ctypes.c_uint32]
        self.proc.proc_pidpath.restype = ctypes.c_int
        class Timebase(ctypes.Structure):
            _fields_ = [('numer', ctypes.c_uint32), ('denom', ctypes.c_uint32)]
        t = Timebase()
        if self.lib.mach_timebase_info(ctypes.byref(t)) or not t.denom:
            raise RuntimeError('Cannot read Mach timebase')
        self.timebase = t.numer / t.denom
        self.cache, self.previous = {}, {}

    def procargs(self, pid):
        mib = (ctypes.c_int * 3)(1, 49, pid)
        n = ctypes.c_size_t()
        if self.lib.sysctl(mib, 3, None, ctypes.byref(n), None, 0) or n.value > 4 * MIB:
            return [], {}
        buf = ctypes.create_string_buffer(n.value)
        if self.lib.sysctl(mib, 3, buf, ctypes.byref(n), None, 0):
            return [], {}
        try:
            return decode_procargs(buf.raw[:n.value])
        except (ValueError, struct.error):
            return [], {}

    def sample(self):
        started = time.monotonic()
        processes, live = [], set()
        for line in command(['/bin/ps', '-axo', 'pid=,ppid=,rss=,%cpu=,comm=']).splitlines():
            parts = line.strip().split(None, 4)
            if len(parts) != 5:
                continue
            pid, ppid, rss, ps_cpu = int(parts[0]), int(parts[1]), int(parts[2]) * 1024, float(parts[3])
            path = ctypes.create_string_buffer(4096)
            # Process titles (ps comm) can be rewritten to contain argv; don't store them.
            exe = path.value.decode(errors='replace') if self.proc.proc_pidpath(pid,path,len(path)) > 0 else 'unknown'
            usage = Usage()
            accessible = self.proc.proc_pid_rusage(pid, 2, ctypes.byref(usage)) == 0
            # Inaccessible processes retain RSS, but cannot receive a cached owner.
            key = (pid, usage.start, exe) if accessible else None
            if key is not None:
                live.add(key)
                if key not in self.cache:
                    argv, env = self.procargs(pid)
                    self.cache[key] = identity(exe, argv, env)
                meta = self.cache[key].copy()
            else:
                meta = identity(exe, [], {})
            p = {'pid': pid, 'ppid': ppid, 'start_ticks': usage.start if accessible else None,
                 'exe': os.path.basename(exe), 'rss_bytes': rss, 'ps_cpu_percent': ps_cpu, **meta}
            if accessible:
                cpu_ns = (usage.user + usage.system) * self.timebase
                p.update(footprint_bytes=usage.footprint, cpu_ns=cpu_ns, pageins=usage.pageins,
                         read_bytes=usage.read_bytes, write_bytes=usage.write_bytes)
                prev = self.previous.get(key)
                if prev:
                    elapsed = started - prev[0]
                    p['cpu_percent'] = max(0, (cpu_ns-prev[1])/1e9/elapsed*100)
                    p['footprint_delta_bytes'] = usage.footprint-prev[2]
                self.previous[key] = (started, cpu_ns, usage.footprint)
            processes.append(p)
        resolve_ancestry(processes)
        self.cache = {k:v for k,v in self.cache.items() if k in live}
        self.previous = {k:v for k,v in self.previous.items() if k in live}
        vm = command(['/usr/bin/vm_stat'])
        match = re.search(r'page size of (\d+)', vm)
        values = {k.strip(' "'): int(v) for k,v in re.findall(r'^([^:]+):\s+(\d+)\.', vm, re.M)}
        system = command(['/usr/sbin/sysctl', 'vm.swapusage', 'kern.memorystatus_vm_pressure_level'])
        swap = re.search(r'used = ([\d.]+)M', system)
        pressure = re.search(r'pressure_level: (\d+)', system)
        gpu = command(['/usr/sbin/ioreg', '-r', '-c', 'IOAccelerator', '-d', '2'])
        keys = ('Alloc system memory', 'In use system memory', 'Device Utilization %',
                'Renderer Utilization %', 'Tiler Utilization %')
        stats = {k:int(v) for k,v in re.findall(r'"([^"\n]+)"=(\d+)', gpu) if k in keys}
        return {'timestamp': now(), 'monotonic': started, 'processes': processes,
                'vm': values, 'page_size': int(match.group(1)) if match else None,
                'swap_used_bytes': float(swap.group(1))*MIB if swap else None,
                'pressure_level': int(pressure.group(1)) if pressure else None,
                'gpu': stats, 'collection_ms': 1000*(time.monotonic()-started)}


def telemetry_event(item):
    """Extract stable metadata only; never retain tool inputs/outputs or message text."""
    payload = item.get('payload', {})
    typ = payload.get('type')
    event = {'timestamp': item.get('timestamp')}
    if item.get('type') == 'response_item' and typ in ('function_call', 'custom_tool_call', 'function_call_output', 'custom_tool_call_output'):
        event.update(event=typ, tool=payload.get('name'), call_id=payload.get('call_id'))
    elif item.get('type') == 'event_msg' and typ == 'item_completed':
        inner = payload.get('item', {})
        if inner.get('type') not in ('CommandExecution', 'ToolCall'):
            return None
        event.update(event=inner.get('type'), item_id=inner.get('id'), status=inner.get('status'),
                     exec_session_id=inner.get('process_id'), started_at_ms=payload.get('started_at_ms'),
                     completed_at_ms=payload.get('completed_at_ms'))
        # process_id in this event is an exec transport ID, NOT an OS PID.
    else:
        return None
    return event


class Tail:
    def __init__(self, path):
        self.path, self.offset = Path(path), Path(path).stat().st_size
    def read(self):
        if self.path.stat().st_size < self.offset:
            self.offset = 0
        events = []
        with self.path.open() as f:
            f.seek(self.offset)
            while True:
                pos, line = f.tell(), f.readline()
                if not line or not line.endswith('\n'):
                    self.offset = pos
                    break
                self.offset = f.tell()
                try:
                    e = telemetry_event(json.loads(line))
                except ValueError:
                    continue
                if e:
                    events.append(e)
        return events


def spikes(sample):
    result = []
    for p in sample['processes']:
        reasons = []
        if p.get('cpu_percent', 0) >= 80: reasons.append('cpu>=80% of one core')
        if p.get('footprint_delta_bytes', 0) >= 128*MIB: reasons.append('footprint growth>=128MiB/sample')
        if reasons:
            result.append({'timestamp': sample['timestamp'], 'pid':p['pid'], 'start_ticks':p['start_ticks'],
                           'role':p['role'], 'owner':p['owner'], 'owner_evidence':p['owner_evidence'],
                           'reasons':reasons, 'cpu_percent':p.get('cpu_percent'),
                           'footprint_delta_bytes':p.get('footprint_delta_bytes')})
    if sample.get('pressure_level', 1) in (2, 4):
        result.append({'timestamp':sample['timestamp'],'role':'system','reasons':['memory pressure warning/critical']})
    if sample.get('gpu', {}).get('Device Utilization %', 0) >= 80:
        result.append({'timestamp':sample['timestamp'],'role':'shared GPU','reasons':['GPU utilization>=80%']})
    return result


def summarize(directory):
    directory = Path(directory)
    aggregate = {}
    samples = 0
    first, last = None, None
    collection = []
    with (directory/'samples.jsonl').open() as f:
        for line in f:
            j = json.loads(line); samples += 1
            first = first or j['timestamp']; last = j['timestamp']; collection.append(j['collection_ms'])
            for p in j['processes']:
                key = (p['pid'], p['start_ticks'])
                a = aggregate.setdefault(key, {k:p[k] for k in ('pid','start_ticks','role','owner','owner_evidence','exe','script_names')})
                footprint = p.get('footprint_bytes')
                if footprint is not None:
                    a.setdefault('first_footprint_bytes', footprint)
                    a['last_footprint_bytes'] = footprint
                    a['peak_footprint_bytes'] = max(a.get('peak_footprint_bytes',0), footprint)
                a['peak_cpu_percent'] = max(a.get('peak_cpu_percent',0), p.get('cpu_percent',0))
    result = {'samples':samples,'first':first,'last':last,
              'mean_collection_ms':sum(collection)/len(collection) if collection else None,
              'processes':sorted(aggregate.values(),key=lambda a:a.get('peak_footprint_bytes',0),reverse=True),
              'limitations':['Owner means process launch provenance, not exclusive current service use.',
                            'GPU counters and shared app renderers do not identify a unique chat.',
                            'Footprints include compressed/swapped pages; do not sum with GPU counters or treat as physical RAM in use.',
                            'Short-lived processes between samples can be missed. Events correlate timing, not causality.']}
    (directory/'summary.json').write_text(json.dumps(result,indent=2)+'\n')
    make_windows(directory)
    print(json.dumps({k:v for k,v in result.items() if k!='processes'}))


def epoch(timestamp):
    return dt.datetime.fromisoformat(timestamp.replace('Z','+00:00')).timestamp()


def make_windows(directory):
    """Merge repeated threshold crossings and preserve +/-15s evidence windows."""
    episodes, recent = [], {}
    with (directory/'spikes.jsonl').open() as f:
        for line in f:
            spike = json.loads(line)
            key = (spike.get('pid'),spike.get('start_ticks'),spike['role'],tuple(spike['reasons']))
            t = epoch(spike['timestamp'])
            e = recent.get(key)
            if e is None or t-epoch(e['end']) > 10:
                e = {'start':spike['timestamp'],'end':spike['timestamp'],'trigger':spike,'samples':[], 'nearby_events':[]}
                recent[key] = e; episodes.append(e)
            else:
                e['end'] = spike['timestamp']
                old = e['trigger']
                if (spike.get('cpu_percent') or 0) > (old.get('cpu_percent') or 0) or (spike.get('footprint_delta_bytes') or 0) > (old.get('footprint_delta_bytes') or 0):
                    e['trigger'] = spike
    with (directory/'samples.jsonl').open() as f:
        for line in f:
            sample = json.loads(line); t = epoch(sample['timestamp'])
            for e in episodes:
                if epoch(e['start'])-15 <= t <= epoch(e['end'])+15:
                    trigger = e['trigger']
                    matches = [p for p in sample['processes'] if p['pid']==trigger.get('pid') and p['start_ticks']==trigger.get('start_ticks')]
                    tops = sorted(sample['processes'],key=lambda p:p.get('cpu_percent',0),reverse=True)[:3]
                    fields = ('pid','role','owner','owner_evidence','cpu_percent','footprint_bytes','footprint_delta_bytes')
                    e['samples'].append({'timestamp':sample['timestamp'],'pressure_level':sample['pressure_level'],
                        'swap_used_bytes':sample['swap_used_bytes'],'gpu':sample['gpu'],
                        'trigger_process':[{k:p.get(k) for k in fields} for p in matches],
                        'top_cpu':[{k:p.get(k) for k in fields} for p in tops]})
    with (directory/'events.jsonl').open() as f:
        for line in f:
            try: event = json.loads(line); t = epoch(event['timestamp'])
            except (ValueError, KeyError, TypeError): continue
            for e in episodes:
                if epoch(e['start'])-15 <= t <= epoch(e['end'])+15: e['nearby_events'].append(event)
    (directory/'windows.json').write_text(json.dumps(episodes,indent=2)+'\n')


def capture(args):
    if sys.platform != 'darwin':
        raise SystemExit('macOS only')
    if args.seconds <= 0 or args.interval < 1:
        raise SystemExit('seconds must be positive; interval must be >=1')
    path = Path(args.out).expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if (path/'samples.jsonl').exists():
        raise SystemExit('Refusing to overwrite an existing capture')
    tail = Tail(args.rollout) if args.rollout else None
    machine = Mac()
    stop = [False]
    def request_stop(*_): stop[0] = True
    signal.signal(signal.SIGINT, request_stop); signal.signal(signal.SIGTERM, request_stop)
    metadata = {'schema':1,'started':now(),'seconds':args.seconds,'interval':args.interval,
                'mach_ticks_to_ns':machine.timebase,'observer_thread':os.environ.get('CODEX_THREAD_ID'),
                'content_policy':'No argv, raw environment, chat bodies, tool arguments, outputs, screenshots or device data are stored.'}
    (path/'metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
    start = time.monotonic()
    with (path/'samples.jsonl').open('w',buffering=1) as f, (path/'spikes.jsonl').open('w',buffering=1) as alerts, (path/'events.jsonl').open('a',buffering=1) as events:
        while not stop[0] and time.monotonic()-start < args.seconds:
            tick = time.monotonic(); sample = machine.sample()
            f.write(json.dumps(sample)+'\n')
            for spike in spikes(sample): alerts.write(json.dumps(spike)+'\n')
            if tail:
                for e in tail.read(): events.write(json.dumps(e)+'\n')
            remaining = min(args.interval-(time.monotonic()-tick),args.seconds-(time.monotonic()-start))
            if remaining>0: time.sleep(remaining)
    summarize(path)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='mode',required=True)
    c = sub.add_parser('capture'); c.add_argument('--seconds',type=float,default=120)
    c.add_argument('--interval',type=float,default=2); c.add_argument('--out',required=True)
    c.add_argument('--rollout',help='One explicitly scoped Codex rollout; records metadata only')
    r = sub.add_parser('report'); r.add_argument('directory')
    t = sub.add_parser('tag'); t.add_argument('--thread',required=True); t.add_argument('command',nargs=argparse.REMAINDER)
    m = sub.add_parser('mark'); m.add_argument('--out',required=True); m.add_argument('--thread',required=True); m.add_argument('--phase',required=True)
    args = parser.parse_args()
    if args.mode == 'capture': capture(args)
    elif args.mode == 'report': summarize(args.directory)
    elif args.mode == 'mark':
        if not ID.fullmatch(args.thread) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',args.phase):
            parser.error('Valid thread ID and a short phase identifier required')
        path = Path(args.out).expanduser().resolve()
        if not (path/'metadata.json').exists(): parser.error('Capture directory does not exist')
        fd = os.open(path/'events.jsonl',os.O_WRONLY|os.O_APPEND)
        try: os.write(fd,(json.dumps({'timestamp':now(),'event':'phase-marker','thread':args.thread,'phase':args.phase})+'\n').encode())
        finally: os.close(fd)
    elif args.mode == 'tag':
        if not ID.fullmatch(args.thread): parser.error('Invalid thread/session ID')
        cmd = args.command[1:] if args.command[:1]==['--'] else args.command
        if not cmd: parser.error('tag requires a command after --')
        env = os.environ.copy(); env['AGENT_RESOURCE_THREAD_ID'] = args.thread
        os.execvpe(cmd[0],cmd,env)


if __name__ == '__main__':
    main()
