import json,tempfile,unittest
from pathlib import Path
import btle_events as e
class RelayTests(unittest.TestCase):
 def test_recovered_prepared_health_is_retained_without_send_but_uncertain_is_not_cancelled(self):
  with tempfile.TemporaryDirectory() as f:
   r=Path(f);status=r/'status.json';path=r/'event-relay.json'
   def run(phase):
    e.watcher.write_json(status,dict(timestamp=e.watcher.monitor.now(),collection_health='ok'))
    e.watcher.write_json(path,dict(created_at=e.BASELINE,acknowledged=[],pending={'health':dict(client_id='fixture',phase=phase,events=[dict(kind='monitoring_failure')])}))
    return e.run(r,send=False)
   state=run('prepared');self.assertEqual(state['pending'],{});self.assertEqual(state['resolved_without_send'][0]['client_id'],'fixture')
   state=run('submitting');self.assertEqual(state['pending']['health']['client_id'],'fixture')
 def test_idle_rotation_recovery_dedup(self):
  with tempfile.TemporaryDirectory() as f:
   r=Path(f);s={'created_at':e.BASELINE,'acknowledged':[]}
   self.assertEqual(e.evaluate(r,s),{})
   def episode(name,start,last,cpus):
    (r/name).write_text(json.dumps(dict(started_at=start,last_sample_at=last,samples=[{'targets':[{'cpu_percent':c}]} for c in cpus])))
   episode('episode-a.json','2026-10-11T20:00:00+00:00','2026-10-11T20:05:00+00:00',[99]*40)
   episode('episode-b.json','2026-10-11T20:05:05+00:00','2026-10-11T20:06:00+00:00',[99]*10+[0]*30)
   groups=e.evaluate(r,s);self.assertEqual(len(groups),1);events=next(iter(groups.values()));self.assertEqual({v['kind'] for v in events},{'onset','recovery'})
   s['acknowledged']=[x['id'] for x in events];self.assertEqual(e.evaluate(r,s),{})
   episode('episode-c.json','2026-10-11T20:07:00+00:00','2026-10-11T20:07:30+00:00',[99]*30)
   self.assertEqual(len(e.evaluate(r,s)),1)
if __name__=='__main__':unittest.main()
