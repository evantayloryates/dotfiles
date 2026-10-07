import importlib.util
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import time
import unittest

spec = importlib.util.spec_from_file_location('monitor',Path(__file__).with_name('monitor.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
THREAD = '00000000-0000-4000-8000-000000000001'


class Provenance(unittest.TestCase):
    def test_environment_is_distinct_from_argv_and_secrets_are_dropped(self):
        argv = [b'node',b'CODEX_THREAD_ID=forged',b'service.js']
        data = struct.pack('i',len(argv))+b'/usr/bin/node\0\0'+b'\0'.join(argv)+b'\0'+f'CODEX_THREAD_ID={THREAD}\0API_KEY=secret\0'.encode()
        parsed, env = m.decode_procargs(data)
        self.assertEqual(env,{'CODEX_THREAD_ID':THREAD})
        result = m.identity('/usr/bin/node',parsed,env)
        self.assertEqual(result['owner'],THREAD)
        self.assertNotIn('secret',json.dumps(result))
        self.assertIsNone(m.identity('/usr/bin/node',parsed,{})['owner'])

    def test_cli_resume_alias_is_not_a_session(self):
        self.assertIsNone(m.identity('/claude-code/bin/claude',['claude','--resume','latest'],{})['owner'])
        self.assertEqual(m.identity('/claude-code/bin/claude',['claude','--session-id',THREAD],{})['owner'],THREAD)

    def test_younger_reused_parent_does_not_supply_an_owner(self):
        parent = {'pid':1,'ppid':0,'start_ticks':200,'owner':THREAD,'owner_evidence':'explicit-tag'}
        child = {'pid':2,'ppid':1,'start_ticks':100,'owner':None,'owner_evidence':None}
        m.resolve_ancestry([parent,child]); self.assertIsNone(child['owner'])
        parent['start_ticks']=50
        m.resolve_ancestry([parent,child]); self.assertEqual(child['owner'],THREAD)

    def test_ancestry_cycle_does_not_hang(self):
        processes = [{'pid':1,'ppid':2,'start_ticks':1,'owner':None}, {'pid':2,'ppid':1,'start_ticks':1,'owner':None}]
        m.resolve_ancestry(processes); self.assertTrue(all(p['owner'] is None for p in processes))

    def test_rollout_content_never_reaches_event(self):
        record = {'timestamp':'2026-10-07T16:00:00Z','type':'response_item','payload':{'type':'custom_tool_call','name':'exec','call_id':'a','input':'SECRET'}}
        event = m.telemetry_event(record)
        self.assertNotIn('SECRET',json.dumps(event))
        self.assertEqual(event['tool'],'exec')
        record = {'timestamp':'2026-10-07T16:00:00Z','type':'event_msg','payload':{'type':'item_completed','item':{'type':'CommandExecution','process_id':'123','command':'SECRET','stdout':'SECRET'}}}
        event = m.telemetry_event(record)
        self.assertEqual(event['exec_session_id'],'123')
        self.assertNotIn('pid',event)
        self.assertNotIn('SECRET',json.dumps(event))

    def test_spike_window_preserves_recovery_and_nearby_events(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            p = {'pid':7,'start_ticks':9,'role':'worker','owner':THREAD,'owner_evidence':'explicit-tag','cpu_percent':90,'footprint_bytes':10,'footprint_delta_bytes':0}
            rows = [{'timestamp':f'2026-10-07T16:00:{t:02d}Z','processes':[p],'pressure_level':1,'swap_used_bytes':0,'gpu':{}} for t in [0,10,20,30]]
            (path/'samples.jsonl').write_text(''.join(json.dumps(j)+'\n' for j in rows))
            (path/'spikes.jsonl').write_text(json.dumps(m.spikes(rows[1])[0])+'\n')
            (path/'events.jsonl').write_text(json.dumps({'timestamp':rows[0]['timestamp'],'event':'phase-marker'})+'\n')
            m.make_windows(path)
            windows = json.loads((path/'windows.json').read_text())
            self.assertEqual(len(windows),1)
            self.assertEqual(len(windows[0]['samples']),3)
            self.assertEqual(len(windows[0]['nearby_events']),1)

    @unittest.skipUnless(sys.platform=='darwin','Darwin telemetry integration')
    def test_live_tagged_cpu_worker_and_mach_timebase(self):
        env = os.environ.copy(); env['AGENT_RESOURCE_THREAD_ID'] = THREAD
        child = subprocess.Popen([sys.executable,'-c','import time; t=time.monotonic()+8\nwhile time.monotonic()<t: pass'],env=env)
        try:
            machine = m.Mac(); first = machine.sample(); time.sleep(0.6); second = machine.sample()
            p = next(p for p in second['processes'] if p['pid']==child.pid)
            self.assertEqual(p['owner'],THREAD)
            self.assertEqual(p['owner_evidence'],'explicit-tag')
            self.assertGreater(p['cpu_percent'],20)  # Missing Mach conversion yields about 2%.
            self.assertGreater(p['footprint_bytes'],0)
        finally:
            child.terminate(); child.wait(timeout=5)


if __name__=='__main__': unittest.main()
