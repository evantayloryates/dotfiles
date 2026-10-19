import asyncio,json,unittest
from types import SimpleNamespace as Obj
from urllib.parse import urlsplit
import browser_inspector as debug
SOURCE='let count = 0;\nfunction tick() { count += 1; }\nsetInterval(tick, 200);'
class Session:
 def __init__(self):self.calls=[];self.response_methods={};self.worker_calls=[];self.fail=None;self.terminate=False;self.pause=False
 def emit(self,m,**p):
  if m in self.response_methods:self.response_methods[m]({'params':p})
 def worker(self,**message):self.emit('Worker.dispatchMessageFromWorker',workerId='w1',message=json.dumps(message))
 async def send_command(self,m,**a):
  self.calls.append((m,a))
  if m==self.fail:raise debug.ProtocolError(m)
  if m=='Page.getResourceTree':return {'frameTree':{'frame':{'id':'f','loaderId':'l'}}}
  if m=='Runtime.evaluate':return {'result':{'value':{'originMatches':True,'visible':True,'timeOrigin':1,'ready':'complete'}}}
  if m=='Worker.enable':self.emit('Worker.workerCreated',workerId='w1',name='counter',url='https://dev.example.ts.net/worker.js?token=private')
  if m=='Worker.sendMessageToWorker':
   q=json.loads(a['message']);method=q['method'];self.worker_calls.append(method);r={}
   if method=='Debugger.enable':
    self.worker(method='Debugger.scriptParsed',params={'scriptId':'7','url':'https://dev.example.ts.net/worker.js?token=private'})
    if self.pause:self.worker(method='Debugger.paused',params={'reason':'DebuggerStatement','callFrames':[]})
   if method=='Debugger.getScriptSource':r={'scriptSource':SOURCE}
   if method=='ScriptProfiler.stopTracking':self.worker(method='ScriptProfiler.trackingComplete',params={'samples':{'stackTraces':[{'timestamp':1,'stackFrames':[{'name':'workerDebugTick','url':'https://dev.example.ts.net/worker.js?token=private','line':3}]}]}})
   if method=='Debugger.resume':self.worker(method='Debugger.resumed',params={})
   if method=='Console.enable':
    self.worker(method='Console.messageAdded',params={'message':{'text':'worker tick','token':'abcdefghijklmnop'}})
    if self.terminate:self.emit('Worker.workerTerminated',workerId='w1')
   self.worker(id=q['id'],result=r)
  if m=='Worker.disable':self.emit('Worker.workerCreated',workerId='late',name='late',url='https://dev.example.ts.net/late.js')
  return {}
class WorkerTests(unittest.IsolatedAsyncioTestCase):
 async def asyncSetUp(self):
  self.s=Session();self.target=Obj(application=Obj(bundle='com.apple.mobilesafari',id_='a'),page=Obj(id_=1));self.origin=urlsplit('https://dev.example.ts.net');self.ref=(await debug.inspect(self.s,{'op':'overview'},self.target,self.origin,lambda:None))['documentRef'];self.q={'op':'worker-sources','workerId':'w1','documentRef':self.ref,'sampleMs':100}
 async def capture(self,check=lambda:None):return await debug.inspect(self.s,self.q,self.target,self.origin,check)
 async def test_nested_source_catalog_and_source_window_with_all_workers_initialized(self):
  r=await self.capture();self.assertEqual(r['scripts'][0]['url'],'https://dev.example.ts.net/worker.js');self.assertTrue(r['workerInitializationConfirmed']);self.assertEqual(r['workersInitialized'],2);self.assertTrue(r['domainsDisabled']);self.assertEqual(self.s.response_methods,{})
  self.q.update(op='worker-source',scriptId='7',startLine=1,lineCount=1);r=await self.capture();self.assertEqual(r['source']['text'],'function tick() { count += 1; }');self.assertEqual(r['source']['totalLines'],3);self.assertEqual(self.s.worker_calls[-1],'Debugger.disable')
 async def test_worker_console_scrubs_known_fields_and_marks_possible_history(self):
  self.q['op']='worker-console';r=await self.capture();self.assertTrue(r['historyMayReplay']);self.assertEqual(r['events'][0]['params']['message']['token'],'abcd…mnop');self.assertEqual(self.s.worker_calls,['Console.enable','Console.disable'])
 async def test_unknown_worker_initializes_existing_and_disables_without_nested_dispatch(self):
  self.q['workerId']='foreign'
  with self.assertRaisesRegex(ValueError,'current_debug_worker_required'):await self.capture()
  self.assertEqual(self.s.worker_calls,[]);self.assertTrue(self.q['_workerCleanup']['workerInitializationConfirmed']);self.assertEqual(self.s.calls[-1][0],'Worker.initialized')
 async def test_owner_loss_after_enable_still_disables_worker_and_parent(self):
  def check():
   if 'Debugger.enable' in self.s.worker_calls:raise ValueError('observer_owner_expired')
  with self.assertRaisesRegex(ValueError,'observer_owner_expired'):await self.capture(check)
  self.assertEqual(self.s.worker_calls[-1],'Debugger.disable');self.assertTrue(self.q['_workerCleanup']['domainsDisabled'])
 async def test_unexpected_worker_pause_is_immediately_resumed_and_confirmed(self):
  self.s.pause=True;r=await self.capture();self.assertTrue(r['workerResumeConfirmed']);self.assertIn('Debugger.resume',self.s.worker_calls);self.assertTrue(r['domainsDisabled'])
 async def test_worker_termination_rejects_and_parent_detaches_without_inventing_live_domain(self):
  self.s.terminate=True;self.q['op']='worker-console'
  with self.assertRaisesRegex(ValueError,'debug_worker_terminated'):await self.capture()
  self.assertTrue(self.q['_workerCleanup']['workerTerminated']);self.assertTrue(self.q['_workerCleanup']['domainsDisabled']);self.assertNotIn('Console.disable',self.s.worker_calls)
 async def test_initialization_failure_never_claims_cleanup(self):
  self.s.fail='Worker.initialized'
  with self.assertRaisesRegex(ValueError,'debug_cleanup_unconfirmed'):await self.capture()
  self.assertFalse(self.q['_workerCleanup']['domainsDisabled']);self.assertEqual(self.s.worker_calls,[])
 async def test_worker_profile_retains_final_samples_and_stops_without_gc(self):
  self.q['op']='worker-profile';r=await self.capture();self.assertTrue(r['profilerStopped']);self.assertTrue(r['profileComplete']);self.assertEqual(r['sampleCount'],1);self.assertFalse(r['forcedGarbageCollection']);self.assertEqual(self.s.worker_calls,['ScriptProfiler.startTracking','ScriptProfiler.stopTracking']);self.assertEqual(r['events'][-1]['params']['samples']['stackTraces'][0]['stackFrames'][0]['url'],'https://dev.example.ts.net/worker.js')
 async def test_worker_profile_owner_loss_still_stops(self):
  self.q['op']='worker-profile'
  def check():
   if 'ScriptProfiler.startTracking' in self.s.worker_calls:raise ValueError('observer_owner_expired')
  with self.assertRaisesRegex(ValueError,'observer_owner_expired'):await self.capture(check)
  self.assertIn('ScriptProfiler.stopTracking',self.s.worker_calls);self.assertTrue(self.q['_workerCleanup']['domainsDisabled'])
 async def test_worker_debug_requires_fresh_document_before_parent_enable(self):
  self.q.pop('documentRef')
  with self.assertRaisesRegex(ValueError,'fresh_debug_document_required'):await self.capture()
  self.assertFalse(any(m=='Worker.enable' for m,_ in self.s.calls))
if __name__=='__main__':unittest.main()
