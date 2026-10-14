import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
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
            class Machine:
                def sample(self):
                    return dict(timestamp=f.monitor.now(),monotonic=clock[0],processes=[proc(cpu_percent=20)],
                                interval_seconds=2,cpu_delta_covered=1,io_delta_covered=0,
                                host_cpu=dict(status='ok',idle_pct=90,system_pct=5),collection_ms=10,health='ok')
            def pressure(root,previous):
                return dict(timestamp=str(clock[0]),available=True,source='fixture',pressure_level=1,
                            paging_mib_s=150 if clock[0]<100 else 0,compressor_mib_s=0),None
            original=f.watcher.write_json
            def write(path,value):
                if path.name=='status.json':writes.append(value.copy())
                original(path,value)
            with patch.object(f,'FastMac',Machine),patch.object(f,'pressure',pressure),patch.object(f.threading,'Event',Event),\
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
                self.assertTrue(any(x.get('next_interval_seconds')==5 for x in writes))
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
            child=subprocess.Popen([sys.executable,'-c','import time,pathlib; p=pathlib.Path(__import__("sys").argv[1]); end=time.monotonic()+12\nwhile time.monotonic()<end: p.write_bytes(b"x"*65536)',str(Path(d)/'fixture')],env=env)
            try:
                m=f.FastMac();a=m.sample();time.sleep(.2);b=m.sample()
                # Identity lookups are budgeted; seed only this known test child's metadata.
                key=next(k for k in m.last['processes'] if k['pid']==child.pid)
                self.assertGreater(key['cpu_percent'],0);self.assertGreater(key['write_mib_s'],0)
                argv,e=m.procargs(child.pid);identity=f.monitor.identity('python3',argv,e)
                self.assertEqual(identity['owner'],env['AGENT_RESOURCE_THREAD_ID'])
                self.assertNotIn(str(Path(d)/'fixture'),json.dumps(f.select(b,a)))
                self.assertEqual(b['host_cpu']['status'],'ok')
                f.diagnostics(Path(d),[key],include_docker=False)
                stack=json.loads((Path(d)/'diagnostics.json').read_text())['stacks'][0]
                self.assertEqual(stack['status'],'captured',stack)
                self.assertTrue(stack['frames'])
            finally:
                child.terminate();child.wait(timeout=5)

if __name__=='__main__':unittest.main()
