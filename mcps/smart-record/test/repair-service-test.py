#!/usr/bin/env python3
import importlib.util, tempfile, os, threading, unittest, subprocess, sys, json
from pathlib import Path
spec=importlib.util.spec_from_file_location('repair',Path(__file__).resolve().parents[1]/'src/repair-service.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class Repairs(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();r.BASE=Path(self.tmp.name)/'repairs';self.db=r.conn()
 def tearDown(self):self.db.close();self.tmp.cleanup()
 def report(self):return r.report(self.db,{'symptom':'Export fails','expected':'A usable export','observed':'Explicit export error','dispatch':False})
 def test_duplicates_and_durable_readback(self):
  t=self.report();self.assertTrue(self.report()['deduplicated']);self.assertEqual(t['ticket_id'],self.report()['ticket_id']);other=r.conn();self.assertEqual(r.ticket(other,t['ticket_id'])['state'],'reported');other.close()
 def test_default_owner_matches_explicit_recorder(self):
  t=self.report();a={'symptom':'Export fails','expected':'A usable export','observed':'Explicit export error','dispatch':False,'owner':'recorder'}
  same=r.report(self.db,a);self.assertTrue(same['deduplicated']);self.assertEqual(same['ticket_id'],t['ticket_id'])
 def command(self,name,args):
  env={**os.environ,'SMART_RECORD_HOME':str(r.BASE.parent)}
  return json.loads(subprocess.check_output([sys.executable,str(Path(r.__file__)),name],input=json.dumps(args),text=True,env=env))
 def test_feedback_preserves_readiness_revision_and_original_limits(self):
  t=self.report();s=r.subscribe(self.db,{'ticket_id':t['ticket_id'],'caller':'feedback','subscription_key':'once'})
  prepared=r.outcome(self.db,t['ticket_id'],'patch_prepared','not delivered')
  f=self.command('feedback',{'ticket_id':t['ticket_id'],'result':'verified','note':'Caller checked patch only'})
  self.assertEqual(f['state'],'patch_prepared');self.assertEqual(f['revision'],prepared['revision']);self.assertIsNone(r.signal(self.db,s['subscription_id'])['event']);self.assertEqual(self.command('releases',{})['releases'],[])
  ready=r.outcome(self.db,t['ticket_id'],'ready_for_use','delivered',{'native_build':'fixture','limits':'original limitation'})
  self.assertIsNotNone(r.signal(self.db,s['subscription_id'])['event'])
  f=self.command('feedback',{'ticket_id':t['ticket_id'],'result':'failed','note':'New consumer issue needs a new incident','evidence_refs':['/private/fixture']})
  self.assertEqual(f['revision'],ready['revision']);self.assertEqual(f['state'],'ready_for_use');self.assertEqual(f['release']['limits'],'original limitation')
  release=self.command('releases',{'limit':1})['releases'][0];self.assertEqual(release['consumer_feedback'][-1]['result'],'failed');self.assertIsNone(r.signal(self.db,s['subscription_id'])['event'])
 def test_actual_cli_report_routes_to_ticket_not_watcher(self):
  env={**os.environ,'SMART_RECORD_HOME':str(r.BASE.parent)}
  args={'symptom':'Dependency failed','expected':'Owner routing','observed':'Not delivered','owner':'computer_use','dispatch':False}
  raw=subprocess.check_output(['node',str(Path(r.__file__).with_name('cli.mjs')),'report-bug',json.dumps(args)],text=True,env=env)
  t=json.loads(raw);self.assertEqual(t['state'],'needs_input');self.assertIsNone(t['worker_pid']);self.assertEqual(r.ticket(self.db,t['ticket_id'])['report']['symptom'],args['symptom'])
 def test_no_success_for_prepared_or_input(self):
  t=self.report();s=r.subscribe(self.db,{'ticket_id':t['ticket_id'],'caller':'test','subscription_key':'one'})
  for state in ['working','patch_prepared','needs_input','dispatch_uncertain']:
   r.outcome(self.db,t['ticket_id'],state,'still open');self.assertIsNone(r.signal(self.db,s['subscription_id'])['event'])
 def test_one_ready_signal_and_restart_recovery(self):
  t=self.report();a={'ticket_id':t['ticket_id'],'caller':'test','subscription_key':'one'};s=r.subscribe(self.db,a);self.assertEqual(s,r.subscribe(self.db,a))
  r.outcome(self.db,t['ticket_id'],'ready_for_use','done',{'native_build':'test-only','verification_path':'synthetic'})
  self.assertEqual(r.signal(self.db,s['subscription_id'])['event']['type'],'smart_record_repair_ready')
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

class Pipeline(unittest.TestCase):
 """Worktree, merge and cleanup mechanics against a throwaway repository."""
 def setUp(self):
  os.environ['SMART_RECORD_REPAIR_NOTIFY']='0'
  self.tmp=tempfile.TemporaryDirectory();self.repo=Path(self.tmp.name)/'repo';self.repo.mkdir()
  for args in [['init','-q','-b','master'],['config','user.email','t@example.com'],['config','user.name','t']]:r.git(self.repo,*args)
  self.commit(self.repo,'a.txt','one\n','base');self.id='bug_'+'a'*24
 def tearDown(self):self.tmp.cleanup()
 def commit(self,where,name,text,msg):(Path(where)/name).write_text(text);r.git(where,'add','-A');r.git(where,'commit','-qm',msg)
 def test_worktree_rebases_merges_and_leaves_nothing(self):
  path,branch=r.make_worktree(self.repo,self.id,2);self.assertTrue(path.is_dir());self.assertEqual(path.parent,self.repo.parent/'worktrees')
  self.commit(path,'fix.txt','fixed\n','the fix');self.commit(self.repo,'other.txt','x\n','meanwhile on master')
  head=r.integrate(self.repo,path,branch,deadline_s=5,pause_s=0)
  self.assertEqual(r.git(self.repo,'log','-1','--format=%s',head).stdout.strip(),'the fix');self.assertTrue((self.repo/'fix.txt').exists());self.assertTrue((self.repo/'other.txt').exists())
  r.remove_worktree(self.repo,path,branch)
  self.assertFalse(path.exists());self.assertEqual(r.git(self.repo,'branch','--list','--format=%(refname:short)','smart-record-repair/*').stdout.strip(),'')
  self.assertEqual(len(r.git(self.repo,'worktree','list','--porcelain').stdout.split('worktree '))-1,1)
 def test_a_new_attempt_replaces_a_crashed_one(self):
  path,_=r.make_worktree(self.repo,self.id,2);path2,branch2=r.make_worktree(self.repo,self.id,3)
  self.assertEqual(path,path2);self.assertEqual(r.git(self.repo,'branch','--list','--format=%(refname:short)','smart-record-repair/*').stdout.split(),[branch2]);r.remove_worktree(self.repo,path2,branch2)
 def test_conflict_stops_without_touching_master_and_keeps_the_work(self):
  path,branch=r.make_worktree(self.repo,self.id,2);self.commit(path,'a.txt','fix\n','the fix');self.commit(self.repo,'a.txt','other\n','conflicting')
  before=r.git(self.repo,'rev-parse','HEAD').stdout
  with self.assertRaises(r.Halt) as h:r.integrate(self.repo,path,branch,deadline_s=5,pause_s=0)
  self.assertEqual(h.exception.state,'needs_input');self.assertEqual(r.git(self.repo,'rev-parse','HEAD').stdout,before)
  folder=Path(self.tmp.name)/'ticket';folder.mkdir();patch=r.save_patch(self.repo,path,branch,folder)
  self.assertIn('+fix',Path(patch).read_text());r.remove_worktree(self.repo,path,branch);self.assertFalse(path.exists())
 def test_main_checkout_off_master_is_not_merged(self):
  path,branch=r.make_worktree(self.repo,self.id,2);self.commit(path,'fix.txt','x\n','fix');r.git(self.repo,'checkout','-qb','elsewhere')
  with self.assertRaises(r.Halt):r.integrate(self.repo,path,branch,deadline_s=0,pause_s=0)
  r.remove_worktree(self.repo,path,branch)
 def test_prompt_carries_no_report_text(self):
  prompt=r.worker_prompt(Path('/w'),'b',Path('/t'),Path('/repo'))
  self.assertIn('/t/incident.json',prompt);self.assertIn('untrusted',prompt);self.assertNotIn('Incident data',prompt)
 def test_trace_escapes_report_text(self):
  folder=Path(self.tmp.name)/'trace';folder.mkdir()
  r.write_trace(folder,{'ticket_id':self.id,'state':'ready_for_use','report':{'symptom':'<script>x</script>'},'trace':[{'at':0,'step':'merged','detail':'<b>'}],'commits':[{'sha':'f'*40,'subject':'<i>'}]})
  page=(folder/'trace.html').read_text();self.assertNotIn('<script>x',page);self.assertIn('&lt;script&gt;',page);self.assertIn('commit/'+'f'*40,page)
 def test_follow_on_generations_are_capped(self):
  r.BASE=Path(self.tmp.name)/'repairs';db=r.conn();started=[]
  real=r.subprocess.Popen;r.subprocess.Popen=lambda *a,**k:started.append(a)
  try:
   parent=r.report(db,{'symptom':'s','expected':'e','observed':'o','dispatch':False})
   one=r.ticket(db,r.file_follow_on(db,parent,'tests fail'));self.assertEqual(one['generation'],1);self.assertEqual(one['report']['parent_ticket'],parent['ticket_id'])
   two=r.ticket(db,r.file_follow_on(db,one,'tests fail again'));self.assertEqual(two['generation'],2)
   self.assertIsNone(r.file_follow_on(db,two,'and again'));self.assertEqual(len(started),2)
  finally:r.subprocess.Popen=real;db.close()

class EndToEnd(Pipeline):
 """worker() with a fake Codex: fix in a worktree, merge, clean up, verify on master."""
 def fake_codex(self,state='fixed',commit=True):
  script=Path(self.tmp.name)/'codex';script.write_text(f"""#!/usr/bin/env python3
import json,subprocess,sys
args=sys.argv;sys.stdin.read();out=args[args.index('--output-last-message')+1]
if {commit!r}:
 open('fix.txt','w').write('fixed');subprocess.run(['git','add','-A']);subprocess.run(['git','commit','-qm','Fix the reported defect'])
json.dump(dict(state={state!r},summary='fixed it',root_cause='an off-by-one',verification='suite passes',smoke=[['node','--test','test/ok.test.mjs']],limits='none'),open(out,'w'))
""");script.chmod(0o755);return script
 def run_worker(self,script,smoke_ok=True):
  svc=self.repo/'mcps/smart-record/test';svc.mkdir(parents=True)
  (svc/'ok.test.mjs').write_text("import test from 'node:test';test('ok',()=>{});\n");(svc.parent/'src').mkdir();(svc.parent/'src/server.mjs').write_text('const VERSION = "9.9.9";\n');r.git(self.repo,'add','-A');r.git(self.repo,'commit','-qm','tests')
  r.BASE=Path(self.tmp.name)/'repairs';db=r.conn();saved={k:getattr(r,k) for k in ['CODEX_CANDIDATES','worker_overrides','publish','deliver_native','mcp_smoke','report']}
  r.CODEX_CANDIDATES=[script];r.worker_overrides=lambda repo:[];r.publish=lambda repo:(True,'published');r.deliver_native=lambda repo:None
  def smoke(repo):
   if not smoke_ok:raise r.Halt('verify_failed','smoke broke')
   return {'adapter_version':'9.9.9','tools':1,'engine':'fixture'}
  r.mcp_smoke=smoke;filed=[]
  try:
   t=r.report(db,{'symptom':'Export fails','expected':'works','observed':'error','dispatch':False})
   real_report=saved['report'];r.report=lambda db,a:(filed.append(a),real_report(db,{**a,'dispatch':False}))[1]
   return r.worker(db,t['ticket_id'],repo=self.repo),filed
  finally:
   for k,v in saved.items():setattr(r,k,v)
   db.close()
 def test_fixed_report_ships_and_leaves_no_worktree(self):
  final,_=self.run_worker(self.fake_codex())
  self.assertEqual(final['state'],'ready_for_use',final.get('worker_outcome'));self.assertEqual(final['release']['commits'][0]['subject'],'Fix the reported defect')
  self.assertTrue((self.repo/'fix.txt').exists());self.assertFalse(r.worktree_path(self.repo,final['ticket_id']).exists())
  self.assertEqual(r.git(self.repo,'branch','--list','--format=%(refname:short)','smart-record-repair/*').stdout.strip(),'')
  folder=r.BASE/final['ticket_id'];self.assertTrue((folder/'trace.html').exists());self.assertNotIn('Export fails',(folder/'prompt.txt').read_text())
  self.assertIn('Export fails',(folder/'incident.json').read_text());self.assertEqual([s['step'] for s in final['trace']][:3],['worktree','worker','merged'])
 def test_unfixed_attempt_cleans_up_and_keeps_master(self):
  before=r.git(self.repo,'rev-parse','HEAD').stdout
  final,_=self.run_worker(self.fake_codex('cannot_reproduce',commit=False))
  self.assertEqual(final['state'],'cannot_reproduce');self.assertNotEqual(r.git(self.repo,'rev-parse','HEAD').stdout,before)  # the fixture's own test commit only
  self.assertFalse(r.worktree_path(self.repo,final['ticket_id']).exists());self.assertFalse((self.repo/'fix.txt').exists())
 def test_post_merge_failure_files_a_follow_on(self):
  final,filed=self.run_worker(self.fake_codex(),smoke_ok=False)
  self.assertEqual(final['state'],'needs_input');self.assertEqual(filed[0]['parent_ticket'],final['ticket_id']);self.assertTrue(final['follow_on'].startswith('bug_'))
if __name__=='__main__':unittest.main()
