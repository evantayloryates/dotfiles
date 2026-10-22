import json,tempfile,unittest
from pathlib import Path
import btle_events as e
class RelayTests(unittest.TestCase):
 def test_queue_acceptance_is_distinct_from_exact_chat_receipt(self):
  with tempfile.TemporaryDirectory() as f:
   root=Path(f)/'btle';root.mkdir();(Path(f)/'focus').mkdir()
   state={'deliveries':[dict(client_id='exact-a',queue_id='queue-a'),dict(client_id='exact-b',queue_id='queue-b')],
          'pending':{'other':dict(client_id='exact-c')}}
   e.receipt_health(root,state)
   self.assertEqual(state['delivery_health']['unverified'],2)
   e.watcher.write_json(root/'event-receipts.json',dict(receipts=[dict(clientUserMessageId='exact-a',received_at='now'),
       dict(clientUserMessageId='other-id',received_at='now')]))
   e.receipt_health(root,state)
   self.assertEqual(state['delivery_health']['received'],1)
   self.assertEqual(state['delivery_health']['pending'],1)
   self.assertEqual(state['deliveries'][1]['receipt_status'],'not_verified')
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
 def test_pruned_first_bundle_keeps_acknowledged_incident_id(self):
  with tempfile.TemporaryDirectory() as f:
   r=Path(f)
   def episode(name,start,last,checked_at=None):
    p=r/name
    p.write_text(json.dumps(dict(started_at=start,last_sample_at=last,
                                 samples=[{'targets':[{'cpu_percent':99}]}])))
    if checked_at:p.with_suffix('.diagnostics.json').write_text(json.dumps(dict(checked_at=checked_at,stack_capture=dict(status='ok'))))
    return p
   first=episode('episode-first.json','2026-10-11T20:00:00+00:00','2026-10-11T20:05:00+00:00')
   episode('episode-second.json','2026-10-11T20:05:05+00:00','2026-10-11T20:10:00+00:00','2026-10-11T20:05:05+00:00')
   s={'created_at':e.BASELINE,'acknowledged':['episode-first:onset','episode-first:diagnostics:2026-10-11T20:05:05+00:00']}
   self.assertEqual(e.evaluate(r,s),{})
   first.unlink()
   # A previous relay version may already have accepted a duplicate onset.
   s['acknowledged']+=['episode-second:onset','episode-second:diagnostics:2026-10-11T20:05:05+00:00']
   self.assertEqual(e.evaluate(r,s),{})
   episode('episode-third.json','2026-10-11T20:10:05+00:00','2026-10-11T20:15:00+00:00','2026-10-11T20:10:05+00:00')
   groups=e.evaluate(r,s)
   self.assertEqual(list(groups),['episode-first'])
   self.assertEqual([x['id'] for x in groups['episode-first']],['episode-first:diagnostics:2026-10-11T20:10:05+00:00'])
if __name__=='__main__':unittest.main()
