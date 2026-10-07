#!/usr/bin/env python3
"""Passive macOS pressure flight recorder. No remediation or remote calls."""
import argparse
from collections import Counter, deque
import datetime as dt
import fcntl
import hashlib
import html
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import subprocess
import sys
import time
import uuid

import monitor

MIB = 1024 ** 2
DEFAULTS = dict(interval=15., detail_interval=60., pre_seconds=300.,
                enter_samples=2, paging_mib_s=64., compressed_paging_mib_s=16.,
                compression_ratio=.30, compressor_mib_s=256., exit_compressor_mib_s=64.,
                exit_paging_mib_s=8., recovery_seconds=120.,
                max_session_seconds=7200., max_session_bytes=128*MIB,
                retention_days=14., retention_bytes=2*1024**3, min_free_bytes=5*1024**3)
POLICY = ('Local, passive telemetry only. No process termination, pausing, restarts, '
          'purges, credentials, raw arguments/environment, chat contents, screenshots, '
          'application log bodies, or remote network requests. Owner means launch provenance, '
          'not exclusive current use or causality. Footprints include compressed/swapped pages; '
          'GPU accounting overlaps other metrics. Missing measurements stay null.')


def data_root():
    base = Path(os.environ.get('DOTFILES_DATA_DIR', Path(__file__).resolve().parents[2]/'data'))
    return base/'agent_resource_monitor'


def write_json(path, value):
    temp = path.with_suffix(path.suffix+'.tmp')
    temp.write_text(json.dumps(value, indent=2)+'\n')
    os.replace(temp, path)


def run(args, timeout=3, limit=65536):
    """Bound time and output; never persist stderr or generic exception text."""
    started = time.monotonic()
    try:
        with subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                              start_new_session=True) as proc:
            raw=bytearray(); truncated=False
            selector=selectors.DefaultSelector(); selector.register(proc.stdout,selectors.EVENT_READ)
            try:
                deadline=started+timeout
                while selector.get_map():
                    if time.monotonic()>=deadline:raise subprocess.TimeoutExpired(args,timeout)
                    for key,_ in selector.select(max(0,deadline-time.monotonic())):
                        chunk=os.read(key.fileobj.fileno(), min(8192,limit+1-len(raw)))
                        if not chunk:selector.unregister(key.fileobj);break
                        raw.extend(chunk)
                        if len(raw)>limit:
                            truncated=True;os.killpg(proc.pid,signal.SIGKILL)
                            selector.unregister(key.fileobj);break
                proc.wait(timeout=max(.01,deadline-time.monotonic()))
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
                return {'status':'timeout', 'duration_ms':1000*(time.monotonic()-started)}
            finally:selector.close()
            return {'status':'ok' if proc.returncode == 0 else 'unavailable',
                    'returncode':proc.returncode, 'truncated':truncated,
                    'output':raw[:limit].decode(errors='replace') if proc.returncode == 0 else '',
                    'duration_ms':1000*(time.monotonic()-started)}
    except OSError:
        return {'status':'unavailable', 'duration_ms':1000*(time.monotonic()-started)}


def light_sample(previous=None):
    started = time.monotonic()
    vm = run(['/usr/bin/vm_stat'])
    sysctl = run(['/usr/sbin/sysctl', 'vm.swapusage', 'hw.memsize',
                  'kern.memorystatus_vm_pressure_level', 'vm.loadavg'])
    v = {k.strip(' "'):int(n) for k,n in re.findall(r'^([^:]+):\s+(\d+)\.', vm.get('output',''), re.M)}
    s = sysctl.get('output','')
    def value(pattern, cast=float):
        m = re.search(pattern, s)
        return cast(m[1]) if m else None
    size = re.search(r'page size of (\d+)', vm.get('output',''))
    page_size = int(size[1]) if size else None
    used = value(r'used = ([\d.]+)M')
    row = dict(timestamp=monitor.now(), monotonic=started, vm=v, page_size=page_size,
               pressure_level=value(r'pressure_level: (\d+)', int),
               physical_memory_bytes=value(r'hw.memsize: (\d+)', int),
               swap_used_bytes=used*MIB if used is not None else None,
               load_average=[float(x) for x in re.findall(r'vm.loadavg: \{ ([\d.]+) ([\d.]+) ([\d.]+)',s)[0]] if 'vm.loadavg: {' in s and re.findall(r'vm.loadavg: \{ ([\d.]+) ([\d.]+) ([\d.]+)',s) else None,
               paging_mib_s=None, compression_ratio=None, swap_in_mib_s=None, swap_out_mib_s=None)
    row['compressor_mib_s']=None
    if page_size and row['physical_memory_bytes'] and 'Pages occupied by compressor' in v:
        row['compression_ratio'] = v['Pages occupied by compressor']*page_size/row['physical_memory_bytes']
    if previous and page_size:
        elapsed = started-previous['monotonic']
        counters = ('Swapins','Swapouts','Compressions','Decompressions','Pageins','Pageouts')
        for k in counters:
            old = previous.get('vm',{}).get(k)
            if elapsed > 0 and old is not None and k in v and v[k] >= old:
                row[k.lower()+'_mib_s'] = (v[k]-old)*page_size/MIB/elapsed
        if 'swapins_mib_s' in row and 'swapouts_mib_s' in row:
            row['swap_in_mib_s'] = row['swapins_mib_s']
            row['swap_out_mib_s'] = row['swapouts_mib_s']
            row['paging_mib_s'] = row['swap_in_mib_s']+row['swap_out_mib_s']
        if 'compressions_mib_s' in row and 'decompressions_mib_s' in row:
            row['compressor_mib_s']=row['compressions_mib_s']+row['decompressions_mib_s']
    row['collection_ms'] = 1000*(time.monotonic()-started)
    row['available'] = bool(v) and row['pressure_level'] is not None
    return row


class Gate:
    def __init__(self, config):
        self.config, self.hits, self.quiet_since = config, 0, None

    def evaluate(self, row):
        c = self.config
        pressure, paging = row.get('pressure_level'), row.get('paging_mib_s')
        reasons = []
        if pressure in (2,4): reasons.append('macos_memory_pressure')
        if paging is not None and paging >= c['paging_mib_s']: reasons.append('sustained_paging')
        if (row.get('compression_ratio') or 0) >= c['compression_ratio'] and paging is not None and paging >= c['compressed_paging_mib_s']:
            reasons.append('compression_with_paging')
        if (row.get('compression_ratio') or 0) >= c['compression_ratio'] and (row.get('compressor_mib_s') or 0) >= c['compressor_mib_s']:
            reasons.append('compressor_churn')
        self.hits = self.hits+1 if reasons else 0
        churn=row.get('compressor_mib_s')
        healthy = (pressure == 1 and paging is not None and paging < c['exit_paging_mib_s']
                   and churn is not None and churn < c['exit_compressor_mib_s'])
        if healthy:
            if self.quiet_since is None: self.quiet_since = row['monotonic']
        else: self.quiet_since = None
        return dict(start=pressure==4 or self.hits>=c['enter_samples'], reasons=reasons,
                    recovered=self.quiet_since is not None and row['monotonic']-self.quiet_since>=c['recovery_seconds'])


def contextual_metadata():
    """Known numeric/platform metadata only; no arbitrary config/log contents."""
    result = {'timestamp':monitor.now()}
    result['hardware'] = run(['/usr/sbin/sysctl','hw.memsize','hw.ncpu','hw.model','kern.osrelease','kern.boottime'])
    result['disk'] = run(['/bin/df','-k',str(data_root())])
    result['io_cpu'] = run(['/usr/sbin/iostat','-c','2','-w','1'], timeout=3)
    result['thermal'] = run(['/usr/bin/pmset','-g','therm'])
    result['gpu'] = {}  # GPU metadata is in attributed samples, not duplicated here.
    config = Path.home()/'.codex/config.toml'
    if config.exists():
        result['codex_config_mtime_ns'] = config.stat().st_mtime_ns
        # A change detector, never the potentially credential-bearing content.
        result['codex_config_sha256'] = hashlib.sha256(config.read_bytes()).hexdigest()
    docker_settings = Path.home()/'Library/Group Containers/group.com.docker/settings-store.json'
    try:
        settings = json.loads(docker_settings.read_text())
        result['docker_settings'] = {k:settings[k] for k in ('MemoryMiB','SwapMiB','UseResourceSaver')
                                     if isinstance(settings.get(k),(int,bool))}
    except (OSError, ValueError): pass
    docker = next((p for p in ('/usr/local/bin/docker','/opt/homebrew/bin/docker') if Path(p).exists()), None)
    if docker:
        # Read-only Docker socket commands; none starts Docker or a container.
        stats = run([docker,'stats','--no-stream','--format','{{json .}}'],timeout=4)
        if stats['status']=='ok':
            allowed = ('ID','Name','CPUPerc','MemUsage','MemPerc','BlockIO','NetIO','PIDs')
            try: stats['containers']=[{k:v for k,v in json.loads(l).items() if k in allowed} for l in stats.pop('output').splitlines()]
            except ValueError: stats.pop('output',None); stats['status']='invalid'
        result['docker'] = stats
        if stats.get('containers'):
            # At most two container process trees, sorted by memory percentage.
            containers=sorted(stats['containers'],key=lambda x:float(x.get('MemPerc','0%').strip('%') or 0),reverse=True)[:2]
            result['docker_processes']={}
            for container in containers:
                cid=container.get('ID','')
                if re.fullmatch(r'[0-9a-f]{12,64}',cid):
                    result['docker_processes'][cid] = run([docker,'top',cid,'-eo','pid,ppid,rss,pcpu,etime,comm'],timeout=2)
    # Only structural event counts and identifiers from a bounded recent log tail.
    log_root=Path.home()/'Library/Logs/com.openai.codex'
    today=dt.datetime.now(dt.timezone.utc).strftime('%Y/%m/%d')
    files=sorted((log_root/today).glob('*t0*.log'),key=lambda p:p.stat().st_mtime,reverse=True)[:1]
    events=Counter(); thread_ids=set(); durations=[]; first=last=None
    for path in files:
        with path.open('rb') as f:
            f.seek(max(0,path.stat().st_size-MIB)); raw=f.read(MIB).decode(errors='replace')
        for line in raw.splitlines():
            timestamp=re.match(r'\d{4}-\d\d-\d\dT[\d:.]+Z',line)
            if not timestamp: continue
            first=first or timestamp[0]; last=timestamp[0]
            for event in ('mcp_extension_tool_discovery_failed','mcp_server_startup_status_updated'):
                if event in line: events[event]+=1
            for method in ('mcpServerStatus/list','thread/resume','thread/start'):
                if 'method='+method in line:
                    events[method]+=1
                    duration=re.search(r'\bdurationMs=(\d+)',line)
                    if duration: durations.append(int(duration[1]))
            tid=re.search(r'\bconversationId=([0-9a-f-]{36})\b',line)
            if tid and monitor.ID.fullmatch(tid[1]):thread_ids.add(tid[1])
            # No error strings, URL values, tool payloads or free text retained.
    result['codex_event_counts']={'bounded_tail_bytes':MIB,'first':first,'last':last,
                                  'events':dict(events),'thread_ids':sorted(thread_ids),
                                  'max_response_ms':max(durations) if durations else None}
    return result


def folder_bytes(path):
    return sum(p.stat().st_size for p in path.rglob('*') if p.is_file() and not p.is_symlink())


def prune(root, config, wall_time=None):
    wall_time = time.time() if wall_time is None else wall_time
    completed=[]
    for path in (root/'sessions').glob('*'):
        if path.is_symlink() or not (path/'complete.json').is_file(): continue
        completed.append((path.stat().st_mtime,path,folder_bytes(path)))
    completed.sort()
    total=sum(n for _,_,n in completed)
    for modified,path,n in completed:
        if wall_time-modified>config['retention_days']*86400 or total>config['retention_bytes']:
            shutil.rmtree(path); total-=n


class Episode:
    def __init__(self, root, config, prelude, details, trigger, continuation=None):
        name=dt.datetime.now().strftime('%Y_%m_%d_%H_%M_%S')+'_'+uuid.uuid4().hex[:8]
        self.path=root/'sessions'/name; self.path.mkdir(parents=True,mode=0o700)
        self.config=config; self.started=trigger['monotonic']; self.bytes=0
        self.peaks={}; self.rows=0; self.peak_paging=0.; self.peak_swap=0.; self.last=None
        self.detail_count=0; self.pre_detail_count=len(details);self.peak_compressor=0.
        self.metadata=dict(schema=1, started=trigger['timestamp'], timezone=str(dt.datetime.now().astimezone().tzinfo),
                           config=config, policy=POLICY, continuation_of=continuation,
                           prelude_samples=len(prelude), prelude_detail_samples=len(details))
        write_json(self.path/'metadata.json',self.metadata)
        (self.path/'README.txt').write_text('Open report.html for the incident overview.\n'
            'light_samples.jsonl: VM counter deltas and pressure (includes the prelude).\n'
            'process_samples.jsonl: attributed process lifetimes, footprints, CPU, I/O and GPU.\n'
            'context.jsonl: Docker, I/O, thermal, hardware/config change markers and metadata-only MCP counts.\n'
            'events.jsonl: trigger, gap, recovery and continuation events.\n'+POLICY+'\n')
        for row in prelude:self.append('light_samples.jsonl',row);self.track_light(row)
        for row in details:self.detail(row,prelude=True)
        self.event('trigger',trigger)
        self.report('active')

    def append(self, name, row):
        encoded=(json.dumps(row,separators=(',',':'))+'\n').encode()
        with (self.path/name).open('ab') as f:f.write(encoded)
        self.bytes+=len(encoded)

    def event(self, kind, row):
        self.append('events.jsonl',dict(event=kind,timestamp=row['timestamp'],
                                      reasons=row.get('reasons',[])))

    def track_light(self, row):
        self.rows+=1;self.last=row['timestamp']
        self.peak_paging=max(self.peak_paging,row.get('paging_mib_s') or 0)
        self.peak_swap=max(self.peak_swap,row.get('swap_used_bytes') or 0)
        self.peak_compressor=max(self.peak_compressor,row.get('compressor_mib_s') or 0)

    def light(self,row): self.append('light_samples.jsonl',row);self.track_light(row)

    def detail(self,row,prelude=False):
        self.append('process_samples.jsonl',row)
        if not prelude:self.detail_count+=1
        for p in row['processes']:
            key=(p['pid'],p['start_ticks'])
            existing=self.peaks.get(key)
            if existing is None or (p.get('footprint_bytes') or p['rss_bytes'])>(existing.get('footprint_bytes') or existing['rss_bytes']):
                self.peaks[key]=p.copy()
        # Keep summary memory bounded even in an extended process-start storm.
        if len(self.peaks)>5000:
            self.peaks=dict(sorted(self.peaks.items(),key=lambda kv:kv[1].get('footprint_bytes',kv[1]['rss_bytes']),reverse=True)[:3000])

    def report(self, state):
        tops=sorted(self.peaks.values(),key=lambda p:p.get('footprint_bytes',p['rss_bytes']),reverse=True)[:30]
        summary=dict(state=state,started=self.metadata['started'],last_sample=self.last,
                     light_samples=self.rows,detail_samples=self.detail_count,
                     prelude_detail_samples=self.pre_detail_count,peak_paging_mib_s=self.peak_paging,
                     peak_compressor_mib_s=self.peak_compressor,
                     peak_swap_bytes=self.peak_swap,telemetry_bytes=self.bytes,top_processes=tops,
                     policy=POLICY)
        write_json(self.path/'summary.json',summary)
        rows=''.join('<tr>'+''.join('<td>'+html.escape(str(x))+'</td>' for x in
            (p['pid'],p['role'],round(p.get('footprint_bytes',p['rss_bytes'])/MIB,1),
             p.get('owner') or 'unknown/shared',p.get('owner_evidence') or 'unavailable'))+'</tr>' for p in tops)
        (self.path/'report.html').write_text('<!doctype html><meta charset="utf-8"><title>Mac pressure incident</title>'
            '<style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:20px;color:#17202a}'
            'td,th{padding:8px;text-align:left;border-bottom:1px solid #ddd}table{width:100%}code{overflow-wrap:anywhere}</style>'
            '<h1>Mac pressure incident</h1><p>'+html.escape(state)+' · '+html.escape(self.metadata['started'])+'</p>'
            '<p>Peak paging: %.1f MiB/s · Peak compressor churn: %.1f MiB/s (uncompressed page equivalents) · '
            'Peak swap occupied: %.1f GiB · %d light samples · %d detailed samples.</p>'
            %(self.peak_paging,self.peak_compressor,self.peak_swap/1024**3,self.rows,self.detail_count+self.pre_detail_count)+
            '<p>Each row is one process lifetime at its peak footprint, including the prelude. '
            'Footprint includes compressed/swapped pages; these peaks were not necessarily simultaneous. '
            'RSS is substituted only where footprint is unavailable. Launch provenance does not assign fault.</p>'
            '<table><tr><th>PID</th><th>Role</th><th>Peak MiB</th><th>Launch owner</th><th>Evidence</th></tr>'+rows+'</table>'
            '<p>'+html.escape(POLICY)+'</p><p>Full evidence: <a href="light_samples.jsonl">VM timeline</a>, '
            '<a href="process_samples.jsonl">process timeline</a>, <a href="context.jsonl">system context</a>, '
            '<a href="events.jsonl">events</a>, <a href="metadata.json">configuration</a>.</p>')

    def finish(self, reason):
        self.report(reason)
        write_json(self.path/'complete.json',dict(reason=reason,finished=monitor.now()))


def recover_interrupted(root):
    for path in (root/'sessions').glob('*'):
        if path.is_symlink() or (path/'complete.json').exists():continue
        if (path/'metadata.json').is_file():
            write_json(path/'complete.json',dict(reason='observer_interrupted',finished=monitor.now()))
            if (path/'summary.json').exists():
                summary=json.loads((path/'summary.json').read_text());summary['state']='observer_interrupted'
                write_json(path/'summary.json',summary)
            if (path/'report.html').exists():
                report=path/'report.html'
                report.write_text(report.read_text().replace('<h1>Mac pressure incident</h1>',
                    '<h1>Mac pressure incident</h1><p><strong>Observer interrupted. Recovery was not measured.</strong></p>',1))
            # Preserve all evidence. Do not pretend recovery was measured.


def watch(args):
    if sys.platform!='darwin':raise SystemExit('macOS only')
    root=Path(args.root).expanduser().resolve() if args.root else data_root()
    root.mkdir(parents=True,exist_ok=True,mode=0o700)
    lock=(root/'watch.lock').open('a')
    try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:raise SystemExit('watcher already running')
    for name in ('watcher_stdout.log','watcher_stderr.log'):
        log=root/name
        if log.exists() and log.stat().st_size>MIB:log.write_text('')
    config=DEFAULTS.copy()
    for k in config:
        value=getattr(args,k,None)
        if value is not None:config[k]=value
    if config['interval']<5 or config['detail_interval']<config['interval'] or config['recovery_seconds']<config['interval']:
        raise SystemExit('interval >=5; detail/recovery intervals >= poll interval required')
    stop=[False]
    signal.signal(signal.SIGTERM,lambda *_:stop.__setitem__(0,True))
    signal.signal(signal.SIGINT,lambda *_:stop.__setitem__(0,True))
    recover_interrupted(root);prune(root,config)
    gate=Gate(config); previous=None; episode=None; machine=monitor.Mac()
    light_ring=deque();detail_ring=deque();next_detail=0.;next_context=0.;next_prune=0.
    ring=root/'detail_ring';ring.mkdir(exist_ok=True,mode=0o700)
    started=time.monotonic();last_boot=run(['/usr/sbin/sysctl','-n','kern.boottime']).get('output','').strip()
    try:
        while not stop[0] and (not args.seconds or time.monotonic()-started<args.seconds):
            tick=time.monotonic();row=light_sample(previous)
            if previous and row['monotonic']-previous['monotonic']>config['interval']*4:
                row['paging_mib_s']=None;row['swap_in_mib_s']=None;row['swap_out_mib_s']=None;row['compressor_mib_s']=None
                gate=Gate(config)
                if episode:episode.event('sampling_gap',row)
            previous=row;decision=gate.evaluate(row);row['reasons']=decision['reasons']
            light_ring.append(row)
            while light_ring and tick-light_ring[0]['monotonic']>config['pre_seconds']:light_ring.popleft()
            while detail_ring and tick-detail_ring[0]['monotonic']>config['pre_seconds']:detail_ring.popleft()
            free=shutil.disk_usage(root).free
            if decision['start'] and episode is None and free>=config['min_free_bytes']:
                episode=Episode(root,config,light_ring,detail_ring,row);next_context=0.;next_detail=0.
            elif episode:episode.light(row)
            if free<config['min_free_bytes'] and episode:
                episode.finish('disk_reserve');episode=None
            # Even in idle mode, a sparse attributed prelude catches the buildup.
            if tick>=next_detail and free>=config['min_free_bytes']:
                detail=machine.sample();detail_ring.append(detail)
                if episode:episode.detail(detail)
                write_json(ring/(str(time.monotonic_ns())+'.json'),detail)
                files=sorted(ring.glob('*.json'),key=lambda p:p.stat().st_mtime,reverse=True)
                for path in files:
                    if time.time()-path.stat().st_mtime>config['pre_seconds']:path.unlink()
                next_detail=time.monotonic()+config['detail_interval']
            if episode and tick>=next_context:
                episode.append('context.jsonl',contextual_metadata());episode.report('active')
                next_context=time.monotonic()+config['detail_interval']
            if episode:
                if decision['recovered']:
                    episode.event('recovered',row);episode.finish('recovered');episode=None
                elif tick-episode.started>=config['max_session_seconds'] or episode.bytes>=config['max_session_bytes']:
                    old=episode.path.name;episode.finish('continued_at_limit')
                    episode=Episode(root,config,[],[],row,continuation=old);episode.light(row)
                    next_context=0.;next_detail=0.
            if tick>=next_prune:prune(root,config);next_prune=tick+3600
            write_json(root/'status.json',dict(pid=os.getpid(),timestamp=row['timestamp'],mode='profiling' if episode else 'watching',
                active_session=str(episode.path) if episode else None,config=config,
                light_collection_ms=row['collection_ms'],detail_collection_ms=detail_ring[-1]['collection_ms'] if detail_ring else None,
                pressure_level=row['pressure_level'],paging_mib_s=row['paging_mib_s'],
                compressor_mib_s=row['compressor_mib_s'],boot_marker=last_boot,
                degraded='disk_reserve' if free<config['min_free_bytes'] else None if row['available'] else 'metrics_unavailable'))
            # Persistent ring survives a watcher interruption; atomically bounded.
            write_json(root/'prelude.json',dict(light=list(light_ring)))
            delay=max(0,config['interval']-(time.monotonic()-tick))
            if args.seconds:delay=min(delay,max(0,args.seconds-(time.monotonic()-started)))
            end=time.monotonic()+delay
            while not stop[0] and time.monotonic()<end:time.sleep(min(.5,max(0,end-time.monotonic())))
    finally:
        if episode:episode.finish('observer_stopped')
        write_json(root/'status.json',dict(pid=os.getpid(),timestamp=monitor.now(),mode='stopped'))
        lock.close()


def main():
    os.umask(0o077)
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='mode',required=True)
    w=sub.add_parser('watch');w.add_argument('--root');w.add_argument('--seconds',type=float,default=0)
    for name in ('interval','detail_interval','paging_mib_s','exit_paging_mib_s','compressor_mib_s','exit_compressor_mib_s','recovery_seconds'):
        w.add_argument('--'+name.replace('_','-'),type=float)
    s=sub.add_parser('status');s.add_argument('--root')
    args=parser.parse_args()
    if args.mode=='watch':watch(args)
    else:
        root=Path(args.root).expanduser().resolve() if args.root else data_root()
        try:
            status=json.loads((root/'status.json').read_text())
            if status.get('mode')!='stopped' and (time.time()-monitor.epoch(status['timestamp']))>90:status['mode']='stale'
            print(json.dumps(status,indent=2))
        except FileNotFoundError:print(json.dumps({'mode':'not_installed','root':str(root)}))


if __name__=='__main__':
    try:main()
    except Exception as exc:
        # launchd may inherit credentials; exception strings can include payloads.
        print('resource watcher failed: '+type(exc).__name__,file=sys.stderr)
        sys.exit(1)
