#!/usr/bin/env python3
import importlib.util, tempfile, os, threading, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('repair',Path(__file__).resolve().parents[1]/'repair-service.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class Repairs(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();r.BASE=Path(self.tmp.name)/'repairs';self.db=r.conn()
 def tearDown(self):self.db.close();self.tmp.cleanup()
 def report(self):return r.report(self.db,{'symptom':'Export fails','expected':'A usable export','observed':'Explicit export error','dispatch':False})
 def test_duplicates_and_durable_readback(self):
  t=self.report();self.assertTrue(self.report()['deduplicated']);self.assertEqual(t['ticket_id'],self.report()['ticket_id']);other=r.conn();self.assertEqual(r.ticket(other,t['ticket_id'])['state'],'reported');other.close()
 def test_no_success_for_prepared_or_input(self):
  t=self.report();s=r.subscribe(self.db,{'ticket_id':t['ticket_id'],'caller':'test','subscription_key':'one'})
  for state in ['working','patch_prepared','needs_input','dispatch_uncertain']:
   r.outcome(self.db,t['ticket_id'],state,'still open');self.assertIsNone(r.signal(self.db,s['subscription_id'])['event'])
 def test_one_ready_signal_and_restart_recovery(self):
  t=self.report();a={'ticket_id':t['ticket_id'],'caller':'test','subscription_key':'one'};s=r.subscribe(self.db,a);self.assertEqual(s,r.subscribe(self.db,a))
  r.outcome(self.db,t['ticket_id'],'ready_for_use','done',{'native_build':'test-only','verification_path':'synthetic'})
  self.assertEqual(r.signal(self.db,s['subscription_id'])['event']['type'],'record_screen_repair_ready')
  other=r.conn();self.assertIsNone(r.signal(other,s['subscription_id'])['event']);self.assertEqual(r.signal(other,s['subscription_id'])['state'],'delivered');self.assertEqual(other.execute('SELECT count(*) FROM releases').fetchone()[0],1);other.close()
 def test_cancel_and_new_subscription(self):
  t=self.report();s=r.subscribe(self.db,{'ticket_id':t['ticket_id'],'caller':'test','subscription_key':'one'});r.signal(self.db,s['subscription_id'],True);r.outcome(self.db,t['ticket_id'],'ready_for_use','done',{})
  self.assertIsNone(r.signal(self.db,s['subscription_id'])['event']);self.assertEqual(r.signal(self.db,s['subscription_id'])['state'],'canceled')
 def test_concurrent_ready_delivery(self):
  t=self.report();s=r.subscribe(self.db,{'ticket_id':t['ticket_id'],'caller':'test','subscription_key':'one'});r.outcome(self.db,t['ticket_id'],'ready_for_use','done',{})
  values=[]
  def check():
   db=r.conn();values.append(r.signal(db,s['subscription_id']));db.close()
  threads=[threading.Thread(target=check) for _ in range(8)]
  for th in threads:th.start()
  for th in threads:th.join()
  self.assertEqual(sum(x['event'] is not None for x in values),1)
 def test_dependency_boundary_and_validation(self):
  a={'symptom':'UI fails','expected':'Expected click','observed':'Not delivered','owner':'computer_use'};t=r.report(self.db,a);self.assertEqual(t['state'],'needs_input');self.assertIsNone(t['worker_pid'])
  for bad in [{}, {**a,'command':'bad'}, {**a,'evidence_refs':['relative']},{**a,'dispatch':1}]:
   with self.assertRaises(ValueError):r.report(self.db,bad)
if __name__=='__main__':unittest.main()
