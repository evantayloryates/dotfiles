import argparse
import contextlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).parent))
import watcher as w


def reading(t, paging=0, pressure=1, compression=.2):
    return dict(timestamp='2026-10-07T20:00:%02dZ'%int(t%60),monotonic=t,paging_mib_s=paging,
                pressure_level=pressure,compression_ratio=compression,swap_used_bytes=100,compressor_mib_s=0)


class Watcher(unittest.TestCase):
    def test_historical_swap_alone_never_triggers(self):
        gate=w.Gate(w.DEFAULTS)
        for t in range(0,300,15):
            row=reading(t);row['swap_used_bytes']=30*1024**3
            self.assertFalse(gate.evaluate(row)['start'])

    def test_pressure_and_paging_use_sustained_entry_and_quiet_exit(self):
        gate=w.Gate(w.DEFAULTS)
        self.assertFalse(gate.evaluate(reading(0,90))['start'])
        self.assertTrue(gate.evaluate(reading(15,90))['start'])
        self.assertFalse(gate.evaluate(reading(30))['recovered'])
        self.assertFalse(gate.evaluate(reading(140))['recovered'])
        self.assertTrue(gate.evaluate(reading(150))['recovered'])
        gate.evaluate(reading(160,10))
        self.assertFalse(gate.evaluate(reading(170))['recovered'])

    def test_critical_immediate_missing_metrics_cannot_claim_recovery(self):
        gate=w.Gate(w.DEFAULTS)
        self.assertTrue(gate.evaluate(reading(0,None,4))['start'])
        gate.evaluate(reading(1))
        self.assertFalse(gate.evaluate(reading(500,None,None))['recovered'])
        self.assertFalse(gate.evaluate(reading(510))['recovered'])

    def test_compression_plus_lower_paging_triggers(self):
        gate=w.Gate(w.DEFAULTS)
        gate.evaluate(reading(0,20,1,.4))
        self.assertTrue(gate.evaluate(reading(15,20,1,.4))['start'])

    def test_compressor_churn_without_swap_triggers_and_blocks_recovery(self):
        gate=w.Gate(w.DEFAULTS)
        gate.evaluate(dict(reading(0,0,1,.4),compressor_mib_s=300))
        self.assertTrue(gate.evaluate(dict(reading(15,0,1,.4),compressor_mib_s=300))['start'])
        gate.evaluate(reading(30))
        self.assertFalse(gate.evaluate(dict(reading(150),compressor_mib_s=100))['recovered'])

    def test_command_output_is_actually_bounded(self):
        result=w.run([sys.executable,'-c','print("x"*1000000)'],limit=100)
        self.assertTrue(result['truncated'])
        self.assertLessEqual(len(result.get('output','')),100)

    def test_counter_reset_and_unknown_not_zero(self):
        def command(args,**_):
            if 'vm_stat' in args[0]:return {'output':'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nSwapins: 1.\nSwapouts: 2.\nPages occupied by compressor: 100.\n'}
            return {'output':'vm.swapusage: used = 30000.00M\nhw.memsize: 25769803776\nkern.memorystatus_vm_pressure_level: 1\n'}
        with patch.object(w,'run',command),patch.object(w.time,'monotonic',return_value=15):
            row=w.light_sample({'monotonic':0,'vm':{'Swapins':10,'Swapouts':20}})
        self.assertIsNone(row['paging_mib_s'])
        with patch.object(w,'run',return_value={'status':'unavailable'}):
            self.assertFalse(w.light_sample()['available'])

    def test_session_preserves_prelude_and_process_lifetimes_and_completion(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);row=reading(15,100)
            def process(pid,start,mem):
                return dict(pid=pid,start_ticks=start,role='worker',rss_bytes=mem,footprint_bytes=mem,owner=None,owner_evidence=None)
            detail=dict(timestamp=row['timestamp'],monotonic=15,processes=[process(7,1,100)])
            episode=w.Episode(root,w.DEFAULTS,[reading(0),row],[detail],row)
            episode.detail(dict(detail,processes=[process(7,2,200)]));episode.finish('recovered')
            self.assertEqual(len(episode.peaks),2)
            self.assertEqual(json.loads((episode.path/'complete.json').read_text())['reason'],'recovered')
            self.assertIn('recovered',(episode.path/'report.html').read_text())
            self.assertEqual(len((episode.path/'light_samples.jsonl').read_text().splitlines()),2)

    def test_retention_never_deletes_active_or_unrelated_folders(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);sessions=root/'sessions';sessions.mkdir()
            active=sessions/'active';active.mkdir();(active/'metadata.json').write_text('{}')
            unknown=sessions/'unknown';unknown.mkdir();(unknown/'anything').write_text('keep')
            done=sessions/'done';done.mkdir();(done/'complete.json').write_text('{}')
            w.prune(root,dict(w.DEFAULTS,retention_bytes=0))
            self.assertTrue(active.exists());self.assertTrue(unknown.exists());self.assertFalse(done.exists())

    def test_restart_marks_interruption_and_preserves_raw_evidence(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);episode=w.Episode(root,w.DEFAULTS,[reading(0)],[],reading(0))
            w.recover_interrupted(root)
            self.assertEqual(json.loads((episode.path/'complete.json').read_text())['reason'],'observer_interrupted')
            self.assertTrue((episode.path/'light_samples.jsonl').exists())

    def test_command_timeout_reaps_only_own_diagnostic(self):
        result=w.run([sys.executable,'-c','import time;time.sleep(5)'],timeout=.05)
        self.assertEqual(result['status'],'timeout')

    def test_no_arbitrary_errors_in_context_or_command_output(self):
        result=w.run([sys.executable,'-c','import sys;print("SECRET",file=sys.stderr);sys.exit(1)'])
        self.assertNotIn('SECRET',json.dumps(result))

    def test_config_change_metadata_drops_payloads_and_invalid_identifiers(self):
        raw=('2026-10-07T20:52:48.895Z response method=config/batchWrite '
             'durationMs=61 originWebcontentsId=1 payload=SECRET url=https://SECRET\n'
             '2026-10-07T20:52:51.000Z mcp_server_startup_status_updated '
             'serverName=gmail_work_primary conversationId=SECRET error=SECRET\n')
        metadata=w.codex_log_metadata(raw)
        self.assertEqual(metadata['events']['config/batchWrite'],1)
        self.assertEqual(metadata['records'][0]['origin_webcontents_id'],1)
        self.assertEqual(metadata['records'][1]['server'],'gmail_work_primary')
        self.assertNotIn('SECRET',json.dumps(metadata))
        self.assertEqual(metadata['thread_ids'],[])

    def test_report_preserves_adjacent_analysis_link_on_regeneration(self):
        with tempfile.TemporaryDirectory() as d:
            episode=w.Episode(Path(d),w.DEFAULTS,[reading(0)],[],reading(0))
            (episode.path/'analysis').mkdir()
            (episode.path/'analysis/index.html').write_text('saved investigation')
            episode.report('active');episode.finish('recovered')
            self.assertIn('href="analysis/index.html"',(episode.path/'report.html').read_text())

    def test_full_watch_lifecycle_freezes_prelude_and_closes_on_recovery(self):
        clock=[0.]
        def sample(previous):
            row=reading(clock[0],0,4 if clock[0]==0 else 1)
            row.update(vm={},collection_ms=1,available=True)
            return row
        class Machine:
            def sample(self):
                return dict(timestamp=w.monitor.now(),monotonic=clock[0],processes=[],collection_ms=1)
        with tempfile.TemporaryDirectory() as d:
            args=argparse.Namespace(root=d,seconds=150)
            with patch.object(w.sys,'platform','darwin'),patch.object(w.time,'monotonic',side_effect=lambda:clock[0]), \
                 patch.object(w.time,'sleep',side_effect=lambda n:clock.__setitem__(0,clock[0]+n)), \
                 patch.object(w,'light_sample',sample),patch.object(w.monitor,'Mac',Machine), \
                 patch.object(w,'contextual_metadata',return_value={'timestamp':w.monitor.now()}), \
                 patch.object(w,'run',return_value={'output':''}):
                w.watch(args)
            sessions=list((Path(d)/'sessions').iterdir())
            self.assertEqual(len(sessions),1)
            complete=json.loads((sessions[0]/'complete.json').read_text())
            self.assertEqual(complete['reason'],'recovered')
            self.assertTrue((sessions[0]/'context.jsonl').exists())
            self.assertEqual(json.loads((sessions[0]/'metadata.json').read_text())['prelude_samples'],1)


if __name__=='__main__':unittest.main()
