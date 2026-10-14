import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parent))
import focus_watch as f
import btle_events as relay

def proc(pid=1,start=10,**kw):
    return dict(pid=pid,ppid=0,start_ticks=start,exe='fixture',role='fixture',owner=None,
                owner_evidence=None,script_names=[],**kw)

class Focus(unittest.TestCase):
    def test_single_flight_blocked_worker_timeout_backoff_and_drain(self):
        entered=threading.Event();release=threading.Event();calls=[]
        def collect():
            calls.append(1);entered.set();release.wait(3)
            return dict(health='timeout',processes=[],collection_ms=14000)
        job=f.SingleFlight(collect)
        try:
            self.assertIsNone(job.poll(time.monotonic(),5))
            self.assertTrue(entered.wait(1))
            for _ in range(10):job.poll(time.monotonic(),2)
            self.assertEqual(len(calls),1)
            self.assertTrue(job.in_flight())
            release.set();job.drain()
            tick=time.monotonic();result=job.poll(tick,2)
            self.assertEqual(result['health'],'timeout')
            self.assertGreaterEqual(job.next_due-tick,139)
            self.assertEqual(job.launches,1)
            self.assertIsNone(job.poll(tick+100,2))
            self.assertEqual(job.launches,1)
        finally:release.set();job.drain()

    def test_pressure_only_rows_do_not_reset_hot_lifetimes_or_duplicate_counters(self):
        with tempfile.TemporaryDirectory() as d,patch.object(f.threading,'Thread') as thread:
            thread.return_value.is_alive.return_value=False
            e=f.Evidence(Path(d),'fixture',[])
            e.started=time.monotonic()
            for _ in range(3):
                e.append(dict(timestamp='fixture',processes=[proc(pid=7,cpu_percent=80)],
                              interval_seconds=2,census_sample_available=True,pressure=dict(paging_mib_s=150)))
                e.append(dict(timestamp='fixture',processes=[],interval_seconds=2,census_sample_available=False,
                              pressure=dict(paging_mib_s=150)))
            self.assertEqual(len(e.stack_attempted),1)
            report=e.report('captured')
            self.assertEqual(report['pressure_only_samples'],3)
            self.assertEqual(report['census_samples'],3)
            self.assertAlmostEqual(report['rankings']['observed_cpu_seconds'][0]['observed_cpu_seconds'],4.8)

    def test_shared_pressure_remains_available_while_fallback_is_blocked(self):
        entered=threading.Event();release=threading.Event()
        def slow(previous):
            entered.set();release.wait(3)
            return dict(timestamp='2000-01-01T00:00:00Z',available=True)
        with tempfile.TemporaryDirectory() as d,patch.object(f.watcher,'light_sample',side_effect=slow):
            root=Path(d);(root/'btle').mkdir()
            reader=f.PressureReader(root/'focus')
            try:
                self.assertFalse(reader.poll(time.monotonic())['available'])
                self.assertTrue(entered.wait(1))
                f.watcher.write_json(root/'btle/status.json',dict(pressure=dict(timestamp=f.monitor.now(),available=True,paging_mib_s=900)))
                self.assertEqual(reader.poll(time.monotonic())['source'],'btle-shared')
                self.assertEqual(reader.fallback.launches,1)
                release.set();reader.drain()
                (root/'btle/status.json').write_text('{}')
                self.assertFalse(reader.poll(time.monotonic())['available'])
            finally:release.set();reader.drain()

    def test_capture_and_recovery_with_blocked_census_preserve_cooldown_and_budget(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)/'focus';clock=[0.];writes=[]
            class Event:
                def is_set(self):return False
                def wait(self,seconds):clock[0]+=seconds
            class Thread:
                def __init__(self,**kw):pass
                def start(self):pass
                def is_alive(self):return False
            class Machine:
                def sample(self):raise AssertionError('Census must never run on pressure thread')
            class Flight:
                def __init__(self,collect):self.started=0;self.next_due=141;self.duration=14.1
                def poll(self,tick,interval):return None
                def in_flight(self):return True
                def drain(self):pass
            class Host:
                def sample(self):return dict(status='ok',idle_pct=95,system_pct=2)
            class Pressure:
                def __init__(self,root):pass
                def poll(self,tick):return dict(timestamp=str(tick),available=True,source='fixture',pressure_level=1,
                                               paging_mib_s=900 if tick<110 else 0,compressor_mib_s=0)
                def drain(self):pass
            original=f.watcher.write_json
            def write(path,value):
                if path.name=='status.json':writes.append(value.copy())
                original(path,value)
            with patch.object(f,'FastMac',Machine),patch.object(f,'SingleFlight',Flight),patch.object(f,'HostCPU',Host),\
                 patch.object(f,'PressureReader',Pressure),patch.object(f.threading,'Event',Event),\
                 patch.object(f.threading,'Thread',Thread),patch.object(f.signal,'signal'),\
                 patch.object(f.time,'monotonic',side_effect=lambda:clock[0]),\
                 patch.object(f.time,'time',side_effect=lambda:10000+clock[0]),\
                 patch.object(f.watcher,'write_json',side_effect=write):
                f.watch(SimpleNamespace(root=str(root),seconds=250))
                state=json.loads((root/'incidents.json').read_text())
                self.assertEqual(len(state['incidents']),1)
                self.assertIsNone(state['active'])
                path=Path(state['incidents'][0]['captures'][0]);a=json.loads((path/'analysis.json').read_text())
                self.assertEqual(a['state'],'captured');self.assertEqual(a['census_samples'],0)
                self.assertGreaterEqual(a['pressure_only_samples'],40)
                self.assertLessEqual(len((path/'samples.jsonl').read_bytes()),8*f.monitor.MIB)
                samples=[json.loads(x) for x in (path/'samples.jsonl').read_text().splitlines()]
                self.assertTrue(all(x['process_count'] is None for x in samples))
                self.assertTrue(any(x.get('health')=='census_stalled' for x in writes))
                self.assertTrue(all(x['next_interval_seconds']==2 for x in writes if 'next_interval_seconds' in x))
                # Persistent cooldown and storage reserve still prohibit extra windows.
                with patch.object(Pressure,'poll',side_effect=lambda tick:dict(timestamp=str(tick),available=True,source='fixture',paging_mib_s=900)):
                    f.watch(SimpleNamespace(root=str(root),seconds=30))
                self.assertEqual(len(list((root/'captures').iterdir())),1)
                with patch.object(f,'BUDGET',1):f.watch(SimpleNamespace(root=str(root),seconds=10))
                self.assertTrue(any(x.get('health')=='storage_budget' for x in writes))

    def test_real_threaded_watch_records_window_while_census_is_blocked(self):
        release=threading.Event();entered=threading.Event();calls=[]
        class Machine:
            def sample(self):
                calls.append(1);entered.set();release.wait(2)
                return dict(health='timeout',processes=[],collection_ms=14000)
        class Host:
            def sample(self):return dict(status='ok',idle_pct=95,system_pct=2)
        class Pressure:
            def __init__(self,root):pass
            def poll(self,tick):return dict(timestamp=f.monitor.now(),available=True,source='fixture',paging_mib_s=900)
            def drain(self):pass
        timer=threading.Timer(.5,release.set)
        with tempfile.TemporaryDirectory() as d,patch.object(f,'FastMac',Machine),patch.object(f,'HostCPU',Host),\
             patch.object(f,'PressureReader',Pressure),patch.object(f.signal,'signal'),\
             patch.object(f,'PRESSURE_INTERVAL',.02),patch.object(f,'WINDOW',.12):
            timer.start()
            try:
                f.watch(SimpleNamespace(root=str(Path(d)/'focus'),seconds=.3))
                self.assertTrue(entered.is_set());self.assertEqual(len(calls),1)
                paths=list((Path(d)/'focus/captures').glob('*/analysis.json'))
                self.assertEqual(len(paths),1)
                a=json.loads(paths[0].read_text())
                self.assertEqual(a['state'],'captured')
                self.assertEqual(a['census_samples'],0)
                self.assertGreater(a['pressure_only_samples'],1)
                self.assertEqual(a['pressure_policy'],'independent-pressure-v1')
                self.assertEqual(json.loads((Path(d)/'focus/status.json').read_text())['state'],'stopped')
            finally:release.set();timer.join()

    def test_docker_diagnostic_integrates_guest_rankings_once_and_bounds_calls(self):
        stats='\n'.join(json.dumps(dict(ID=f'{i:012x}',CPUPerc=f'{i}%',MemUsage=f'{i}GiB / 12GiB')) for i in range(1,4))
        def run(args,**kw):
            if args[1]=='stats':output=stats
            else:
                self.assertEqual(args[1],'top')
                self.assertEqual(kw,dict(timeout=2,limit=256*1024))
                output='PID PPID RSS %CPU ELAPSED COMMAND\n7 0 1024 50.0 3 node /private/yarn.js run test:gateway --token SECRET\n'
            return dict(status='ok',returncode=0,output=output,duration_ms=1,truncated=False)
        with tempfile.TemporaryDirectory() as d, patch.object(f.Path,'exists',return_value=True), \
             patch.object(f.watcher,'run',side_effect=run) as runner:
            f.diagnostics(Path(d),[],include_docker=True)
            result=json.loads((Path(d)/'diagnostics.json').read_text())
            self.assertEqual(runner.call_count,3)
            self.assertEqual(len(result['guest_processes']['containers']),2)
            self.assertEqual(result['guest_processes']['containers'][0]['processes'][0]['task_identity']['task'],'test:gateway')
            self.assertNotIn('SECRET',json.dumps(result))
            self.assertNotIn('/private/',json.dumps(result))

    def test_early_node_identity_uses_existing_budget_and_survives_report(self):
        class Census:
            def proc_pidpath(self,pid,buf,size):
                buf.value=b'/fixture/node' if pid==33 else b'/fixture/python3'
                return len(buf.value)
            def proc_pid_rusage(self,pid,version,ptr):
                u=ptr._obj;u.start=pid;u.user=0
                u.footprint=1024**2 if pid==33 else 2*1024**3
                return 0
        m=object.__new__(f.FastMac);m.proc=Census();m.cache={};m.timebase=1.
        m.last=dict(monotonic=time.monotonic()-5,processes=[proc(i,start=i,cpu_ns=0,footprint_bytes=0) for i in range(1,33)])
        m.host_cpu=lambda:dict(status='ok',idle_pct=90)
        calls=[]
        def args(pid):
            calls.append(pid)
            return ['node','/private/node_modules/.bin/tsc','--noEmit','SECRET'],{}
        m.procargs=args
        with patch.object(f.watcher,'run',return_value=dict(status='ok',output='\n'.join(f'{i} 0 1024' for i in range(1,34)))):
            row=m.sample()
        self.assertIn(33,calls);self.assertEqual(len(calls),20)
        worker=next(x for x in row['processes'] if x['pid']==33)
        self.assertEqual(worker['task_identity'],dict(tool='tsc',flags=['--noEmit']))
        with tempfile.TemporaryDirectory() as d:
            e=f.Evidence(Path(d),'fixture',[])
            selected=f.select(row,dict(processes=[proc(i,start=i) for i in range(1,33)]))
            selected['pressure']=dict(paging_mib_s=0)
            e.append(selected)
            early=json.loads((e.path/'samples.jsonl').read_text().splitlines()[0])
            self.assertEqual(next(p for p in early['processes'] if p['pid']==33)['task_identity']['tool'],'tsc')
            # Once the newborn becomes hot, the same early identity reaches
            # the ranked report as well as its already-persisted birth row.
            worker['cpu_percent']=200
            e.append(selected);report=e.report('captured')
            self.assertNotIn('SECRET',json.dumps(report))
            saved=[p for rank in report['rankings'].values() for p in rank if p['pid']==33]
            self.assertTrue(saved)
            self.assertEqual(saved[0]['task_identity']['tool'],'tsc')

    def test_late_worker_after_docker_snapshot_serial_jobs_and_attempt_budget(self):
        jobs = []
        clock = [0.]
        class Thread:
            def __init__(self, target, args, kwargs, daemon):
                self.args = args; self.kwargs = kwargs; self.running = False
                jobs.append(self)
            def start(self): self.running = True
            def is_alive(self): return self.running
        def row(*processes):
            return dict(timestamp='fixture', processes=list(processes), interval_seconds=2,
                        pressure=dict(paging_mib_s=150))
        with tempfile.TemporaryDirectory() as d, patch.object(f.threading,'Thread',Thread), \
             patch.object(f.time,'monotonic',side_effect=lambda:clock[0]):
            e = f.Evidence(Path(d),'fixture',[])
            clock[0] = 30
            e.append(row(proc(pid=7,cpu_percent=2)))
            self.assertEqual(len(jobs),1)
            self.assertEqual(jobs[0].args[1],[])
            self.assertTrue(jobs[0].kwargs['include_docker'])
            # A hot worker arrives after Docker was requested; busy jobs cannot overlap.
            for tick in (36,38,40):
                clock[0] = tick; e.append(row(proc(pid=7,cpu_percent=210)))
            self.assertEqual(len(jobs),1)
            jobs[0].running = False
            clock[0] = 42; e.append(row(proc(pid=7,cpu_percent=234)))
            self.assertEqual(len(jobs),2)
            self.assertEqual(jobs[1].args[1][0]['pid'],7)
            self.assertFalse(jobs[1].kwargs['include_docker'])
            jobs[1].running = False
            # The same lifetime is never retried, even when the attempt failed.
            for tick in (44,46,48):
                clock[0] = tick; e.append(row(proc(pid=7,cpu_percent=250)))
            self.assertEqual(len(jobs),2)
            # PID reuse gets its own streak and can consume the one remaining attempt.
            for tick in (50,52):
                clock[0] = tick; e.append(row(proc(pid=7,start=11,cpu_percent=250)))
            self.assertEqual(len(jobs),2)
            clock[0] = 54; e.append(row(proc(pid=7,start=11,cpu_percent=250)))
            self.assertEqual(len(jobs),3)
            jobs[2].running = False
            for tick in (56,58,60):
                clock[0] = tick; e.append(row(proc(pid=8,cpu_percent=300)))
            self.assertEqual(len(jobs),3)
            e.report('captured')
            report = json.loads((e.path/'analysis.json').read_text())
            self.assertEqual(report['stack_attempts_reserved'],2)
            self.assertEqual(report['diagnostic_policy'],'late-stack-v1')

    def test_prelude_missing_identity_and_self_never_start_stack_jobs(self):
        with tempfile.TemporaryDirectory() as d, patch.object(f.threading,'Thread') as thread:
            e = f.Evidence(Path(d),'fixture',[])
            e.started = time.monotonic()
            for _ in range(4):
                e.append(dict(timestamp='fixture',processes=[proc(pid=7,cpu_percent=200)]),prelude=True)
            self.assertFalse(thread.called)
            for _ in range(4):
                e.append(dict(timestamp='fixture',processes=[proc(pid=7,start=None,cpu_percent=200),
                                                            proc(pid=os.getpid(),cpu_percent=200)]))
            self.assertFalse(thread.called)
            self.assertFalse(e.stack_attempted)

    def test_later_stack_merge_preserves_docker_and_failed_attempt(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)
            previous=dict(timestamp='original',stacks=[dict(pid=6,status='timeout')],
                          docker=dict(timestamp='docker-time',status='ok',containers=[]),
                          guest_processes=dict(status='ok',containers=[]))
            f.watcher.write_json(path/'diagnostics.json',previous)
            class Lib:
                def proc_pid_rusage(self,pid,version,ptr):
                    ptr._obj.start=10
                    return 0
            with patch.object(f.ctypes,'CDLL',return_value=Lib()), \
                 patch.object(f.watcher,'run',return_value=dict(status='ok',output='  + 3 safeSymbol\n',
                                                               duration_ms=1,truncated=False)) as run:
                f.diagnostics(path,[proc(pid=7)],include_docker=False)
                result=json.loads((path/'diagnostics.json').read_text())
                self.assertEqual(result['timestamp'],'original')
                self.assertEqual(result['docker'],previous['docker'])
                self.assertEqual(result['guest_processes'],previous['guest_processes'])
                self.assertEqual([x['pid'] for x in result['stacks']],[6,7])
                self.assertEqual(result['stacks'][1]['status'],'captured')
                self.assertEqual(run.call_count,1)
                # Lifetime revalidation happens in the actual diagnostic worker.
                f.diagnostics(path,[proc(pid=8,start=99)],include_docker=False)
                result=json.loads((path/'diagnostics.json').read_text())
                self.assertEqual(result['stacks'][-1]['status'],'exited_or_changed_or_inaccessible')
                self.assertEqual(run.call_count,1)

    def test_identity_budget_prioritizes_hot_births_ancestry_and_pid_reuse(self):
        class Census:
            reuse = False

            def proc_pidpath(self, pid, buf, size):
                buf.value = b'/fixture/node'
                return len(buf.value)

            def proc_pid_rusage(self, pid, version, ptr):
                u = ptr._obj
                u.start = pid + (10000 if self.reuse and pid == 1999 else 0)
                u.user = 10_000_000_000 if pid == 1999 else 10
                u.footprint = 3*1024**3 if pid == 1999 else 1024**2
                u.read_bytes = 1000
                u.pageins = 10
                return 0

        machine = object.__new__(f.FastMac)
        machine.proc = Census()
        machine.cache = {}
        machine.timebase = 1.
        machine.last = dict(monotonic=time.monotonic()-5, processes=[
            proc(i, start=i, cpu_ns=0, footprint_bytes=1024**2,
                 read_bytes=0, write_bytes=0, pageins=0) for i in range(1,2001)])
        machine.host_cpu = lambda: dict(status='ok', idle_pct=50, system_pct=20)
        calls = []

        def procargs(pid):
            calls.append(pid)
            return ['node','/fixture/task.cjs'], {'CLAUDE_CODE_SESSION_ID':'fixture-'+str(machine.proc.reuse)}

        machine.procargs = procargs
        census = '\n'.join(f'{i} {1900 if i == 1999 else 0} 1024' for i in range(1,2001))
        with patch.object(f.watcher,'run',return_value=dict(status='ok',output=census)):
            first = machine.sample()
            target = next(p for p in first['processes'] if p['pid'] == 1999)
            self.assertEqual(len(calls),20)
            self.assertIn(1999,calls)
            self.assertIn(1900,calls)
            self.assertEqual(target['script_names'],['task.cjs'])
            self.assertEqual(target['owner'],'fixture-False')
            self.assertEqual(first['cpu_delta_covered'],2000)
            self.assertEqual(first['io_delta_covered'],2000)
            machine.proc.reuse = True
            calls.clear()
            second = machine.sample()
            target = next(p for p in second['processes'] if p['pid'] == 1999)
            self.assertLessEqual(len(calls),20)
            self.assertIn(1999,calls)
            self.assertEqual(target['owner'],'fixture-True')
            self.assertIsNone(target.get('cpu_percent'))
            self.assertIsNone(target.get('footprint_delta_bytes'))
            self.assertNotIn((1999,1999,'/fixture/node'),machine.cache)

    def test_lifetime_reset_and_missing_counters(self):
        a=proc(cpu_ns=100,read_bytes=100,write_bytes=10,pageins=3,footprint_bytes=20)
        b=proc(cpu_ns=200,read_bytes=200,write_bytes=30,pageins=5,footprint_bytes=40)
        self.assertEqual(f.deltas(b,a,2)['pageins_s'],1)
        self.assertEqual(f.deltas(b,a,2)['footprint_delta_bytes'],20)
        self.assertEqual(f.deltas(dict(b,start_ticks=11),a,2),{})
        self.assertEqual(f.deltas(dict(b,start_ticks=None),a,2),{})
        self.assertIsNone(f.deltas(dict(b,read_bytes=50),a,2)['read_mib_s'])

    def test_selection_birth_exit_and_ancestry_bounded(self):
        rows=[proc(i,ppid_override=0) for i in range(500)]
        for p in rows:p.pop('ppid_override')
        rows[-1].update(cpu_percent=90,ppid=2)
        r=f.select(dict(processes=rows,timestamp='fixture'),dict(processes=[proc(999)]))
        self.assertLessEqual(len(r['processes']),120)
        self.assertEqual(r['birth_count'],500);self.assertEqual(r['exit_count'],1)
        self.assertIn(499,[p['pid'] for p in r['processes']]);self.assertIn(2,[p['pid'] for p in r['processes']])

    def test_severe_not_swap_occupancy_and_missing_not_recovery(self):
        self.assertFalse(f.severe(dict(available=True,swap_used_bytes=50*1024**3)))
        self.assertTrue(f.severe(dict(available=True,paging_mib_s=150)))
        self.assertFalse(f.quiet(dict(available=True,pressure_level=1)))
        self.assertFalse(f.severe(dict(available=False,paging_mib_s=150)))

    def test_gate_requires_distinct_samples_and_no_gap_recovery(self):
        gate=f.Gate();hot=dict(timestamp='a',available=True,paging_mib_s=150)
        self.assertFalse(gate.evaluate(hot,0)['start'])
        self.assertFalse(gate.evaluate(hot,5)['start'])
        self.assertTrue(gate.evaluate(dict(hot,timestamp='b'),10)['start'])
        self.assertFalse(gate.evaluate(dict(hot,timestamp='c'),60)['start'])
        calm=dict(available=True,pressure_level=1,paging_mib_s=0,compressor_mib_s=0)
        host=dict(status='ok',idle_pct=90,system_pct=5)
        for tick in range(65,186,5):result=gate.evaluate(dict(calm,timestamp=str(tick)),tick,host)
        self.assertTrue(result['recovered'])
        self.assertFalse(gate.evaluate(dict(calm,timestamp='220'),220,host)['recovered'])
        self.assertFalse(gate.evaluate(dict(timestamp='225',available=False),225)['recovered'])

    def test_cpu_only_gate_is_sustained_and_blocks_false_recovery(self):
        gate=f.Gate();calm=dict(available=True,pressure_level=1,paging_mib_s=0,compressor_mib_s=0)
        hot=dict(status='ok',idle_pct=5,system_pct=5)
        for tick in range(0,30,5):self.assertFalse(gate.evaluate(dict(calm,timestamp=str(tick)),tick,hot)['start'])
        self.assertIn('host_cpu',gate.evaluate(dict(calm,timestamp='30'),30,hot)['reasons'])
        for tick in range(35,180,5):result=gate.evaluate(dict(calm,timestamp=str(tick)),tick,hot)
        self.assertFalse(result['recovered'])
        self.assertFalse(gate.evaluate(dict(calm,timestamp='185'),185,dict(status='unavailable'))['recovered'])

    def test_watch_lifecycle_recovery_restart_cooldown_and_storage_budget(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)/'focus';clock=[0.];writes=[]
            class Event:
                def is_set(self):return False
                def wait(self,seconds):clock[0]+=seconds
            class Thread:
                def __init__(self,**kwargs):pass
                def start(self):pass
                def is_alive(self):return False
            class Machine:
                def sample(self):
                    return dict(timestamp=f.monitor.now(),monotonic=clock[0],processes=[proc(cpu_percent=20)],
                                interval_seconds=2,cpu_delta_covered=1,io_delta_covered=0,
                                host_cpu=dict(status='ok',idle_pct=90,system_pct=5),collection_ms=10,health='ok')
            intervals=[]
            class Flight:
                def __init__(self,collect):self.collect=collect;self.next_due=0;self.duration=0;self.started=0
                def poll(self,tick,interval):
                    intervals.append(interval)
                    if tick<self.next_due:return None
                    self.next_due=tick+interval
                    return self.collect()
                def in_flight(self):return False
                def drain(self):pass
            class Host:
                def sample(self):return dict(status='ok',idle_pct=90,system_pct=5)
            class Pressure:
                def __init__(self,root):self.root=root
                def poll(self,tick):return f.pressure(self.root,None)[0]
                def drain(self):pass
            def pressure(root,previous):
                return dict(timestamp=str(clock[0]),available=True,source='fixture',pressure_level=1,
                            paging_mib_s=150 if clock[0]<100 else 0,compressor_mib_s=0),None
            original=f.watcher.write_json
            def write(path,value):
                if path.name=='status.json':writes.append(value.copy())
                original(path,value)
            with patch.object(f,'FastMac',Machine),patch.object(f,'SingleFlight',Flight),patch.object(f,'HostCPU',Host),\
                 patch.object(f,'PressureReader',Pressure),patch.object(f,'pressure',pressure),patch.object(f.threading,'Event',Event),\
                 patch.object(f.threading,'Thread',Thread),patch.object(f.signal,'signal'),patch.object(f.time,'monotonic',side_effect=lambda:clock[0]),\
                 patch.object(f.time,'time',side_effect=lambda:10000+clock[0]),patch.object(f,'diagnostics'),\
                 patch.object(f.watcher,'write_json',side_effect=write):
                f.watch(SimpleNamespace(root=str(root),seconds=250))
                state=json.loads((root/'incidents.json').read_text())
                self.assertEqual(len(state['incidents']),1)
                self.assertEqual(len(state['incidents'][0]['captures']),1)
                self.assertIsNone(state['active']);self.assertIn('recovered_at',state['incidents'][0])
                report=json.loads((Path(state['incidents'][0]['captures'][0])/'analysis.json').read_text())
                self.assertEqual(report['state'],'captured')
                self.assertTrue(any(x.get('next_interval_seconds')==2 for x in writes))
                self.assertIn(5,intervals);self.assertIn(2,intervals)
                # Restart into severe pressure within persisted cooldown: no extra window.
                with patch.object(f,'pressure',side_effect=lambda *_:(dict(timestamp=str(clock[0]),available=True,source='fixture',paging_mib_s=150),None)):
                    f.watch(SimpleNamespace(root=str(root),seconds=30))
                self.assertEqual(len(list((root/'captures').iterdir())),1)
                with patch.object(f,'BUDGET',1):f.watch(SimpleNamespace(root=str(root),seconds=10))
                self.assertTrue(any(x.get('health')=='storage_budget' for x in writes))

    def test_stack_filter_drops_headers_thread_names_and_user_paths(self):
        text='Command: SECRET\n  Thread_123 name: SECRET\n  + 90 cleanupAsset (in libUARP)\n    + 2 userFunction /Users/SECRET/file\nBinary Images: SECRET\n'
        clean=f.stack_frames(text)
        self.assertIn('cleanupAsset',clean);self.assertNotIn('SECRET',clean)

    def test_capture_report_and_relay_dedupe_across_rotations(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);focus=root/'focus';focus.mkdir();btle=root/'btle';btle.mkdir()
            f.watcher.write_json(focus/'status.json',dict(timestamp=f.monitor.now(),health='ok'))
            evidence=f.Evidence(focus,'fixture',[])
            row=dict(timestamp=f.monitor.now(),monotonic=time.monotonic(),processes=[proc(cpu_percent=20,read_mib_s=4)],pressure=dict(paging_mib_s=150))
            evidence.append(row);evidence.report('captured')
            f.watcher.write_json(focus/'incidents.json',dict(incidents=[dict(id='fixture',captures=[str(evidence.path),str(evidence.path)])]))
            state={'acknowledged':[]}
            groups=relay.focus_events(btle,state);events=groups['focus:fixture']
            self.assertEqual(len(events),1)
            state['acknowledged']=[events[0]['id']]
            self.assertEqual(relay.focus_events(btle,state),{})
            report=json.loads((evidence.path/'analysis.json').read_text())
            self.assertEqual(report['rankings']['read_mib_s'][0]['read_mib_s'],4)
            self.assertIn('not causal',report['limits'])

    def test_corrupt_focus_evidence_does_not_break_btle_relay(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'focus').mkdir();(root/'focus/status.json').write_text('{')
            state={'acknowledged':[]};events=relay.focus_events(root/'btle',state)
            self.assertEqual(events['focus:health'][0]['kind'],'monitoring_failure')
            state['acknowledged']=['focus:health:failure']
            self.assertEqual(relay.focus_events(root/'btle',state),{})

    def test_pressure_uses_fresh_shared_metrics_and_falls_back(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'btle').mkdir()
            f.watcher.write_json(root/'btle/status.json',dict(pressure=dict(timestamp=f.monitor.now(),available=True,paging_mib_s=180)))
            with patch.object(f.watcher,'light_sample',side_effect=AssertionError('duplicate VM probe')):
                row,_=f.pressure(root/'focus');self.assertEqual(row['source'],'btle-shared')
            f.watcher.write_json(root/'btle/status.json',dict(pressure=dict(timestamp='2000-01-01T00:00:00Z',available=True)))
            with patch.object(f.watcher,'light_sample',return_value=dict(timestamp=f.monitor.now(),available=True)):
                row,_=f.pressure(root/'focus');self.assertEqual(row['source'],'local-fallback')

    @unittest.skipUnless(sys.platform=='darwin','Darwin live counters')
    def test_live_tagged_short_worker_cpu_io_and_provenance(self):
        with tempfile.TemporaryDirectory() as d:
            env=dict(os.environ,AGENT_RESOURCE_THREAD_ID='00000000-0000-4000-8000-000000000001')
            # Bound our fixture's writes; after measuring deltas, let only this
            # owned worker sleep so profiling does not add a disk stress test.
            gate=Path(d)/'sample-phase'
            child=subprocess.Popen([sys.executable,'-c',
                'import time,pathlib,sys; p=pathlib.Path(sys.argv[1]); gate=pathlib.Path(sys.argv[2]); end=time.monotonic()+12\n'
                'while time.monotonic()<end and not gate.exists():\n p.write_bytes(b"x"*65536); sum(range(10000)); time.sleep(.02)\n'
                'time.sleep(12)',str(Path(d)/'fixture'),str(gate)],env=env)
            try:
                m=f.FastMac();a=m.sample();time.sleep(.2);b=m.sample()
                # Identity lookups are budgeted; seed only this known test child's metadata.
                key=next(k for k in m.last['processes'] if k['pid']==child.pid)
                self.assertGreater(key['cpu_percent'],0);self.assertGreater(key['write_mib_s'],0)
                argv,e=m.procargs(child.pid);identity=f.monitor.identity('python3',argv,e)
                self.assertEqual(identity['owner'],env['AGENT_RESOURCE_THREAD_ID'])
                self.assertNotIn(str(Path(d)/'fixture'),json.dumps(f.select(b,a)))
                self.assertEqual(b['host_cpu']['status'],'ok')
                gate.touch()
                time.sleep(.05)
                f.diagnostics(Path(d),[key],include_docker=False)
                stack=json.loads((Path(d)/'diagnostics.json').read_text())['stacks'][0]
                self.assertEqual(stack['status'],'captured',stack)
                self.assertTrue(stack['frames'])
            finally:
                child.terminate();child.wait(timeout=5)

if __name__=='__main__':unittest.main()
