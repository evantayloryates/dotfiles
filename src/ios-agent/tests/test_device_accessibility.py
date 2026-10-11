import asyncio,sys,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace as Obj
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import device_accessibility as a
class Tests(unittest.IsolatedAsyncioTestCase):
 def test_arguments_allow_only_static_fixed_checks(self):
  self.assertEqual(a.arguments({})[2],['hit-region','text-clipped'])
  for value in [{'target':'settings'},{'checks':['dynamic-text']},{'checks':['contrast','contrast']},{'checks':[]},{'profile':'call-rig','target':'kickoff-dev'},{'pid':55}]:
   with self.assertRaises(ValueError):a.arguments(value)
 async def test_native_foreground_uses_fresh_sdk_status_not_another_surface_command(self):
  messages=[]
  def status(message,*args,**kwargs):
   messages.append(message);return {'device':{'bundle':'com.dev.kudos.fit','boot':'b'},'deviceAgeMs':10,'deviceFeedback':{'foreground':True},'epoch':'e'}
  with patch('cli.request',side_effect=status):
   r=await a.foreground({'state':'/tmp'},'kickoff-dev','app',lambda:None,None)
  self.assertEqual(r['boot'],'b');self.assertEqual(messages,[{'op':'status'}])
  for age,active in [(4000,True),(0,False),(None,True)]:
   with patch('cli.request',return_value={'device':{'bundle':'com.dev.kudos.fit','boot':'b'},'deviceAgeMs':age,'deviceFeedback':{'foreground':active}}):
    with self.assertRaisesRegex(ValueError,'foreground_dev_surface_required'):await a.foreground({'state':'/tmp'},'kickoff-dev','app',lambda:None,None)
 async def test_browser_requires_current_visible_dev_document(self):
  async def read(r):return {'pages':[{'readConfirmed':True,'state':{'visible':True},'debug':{'documentRef':'doc'}}]}
  self.assertEqual((await a.foreground({},'safari','call-rig',lambda:None,read))['documentRef'],'doc')
  async def hidden(r):return {'pages':[{'readConfirmed':True,'state':{'visible':False}}]}
  with self.assertRaisesRegex(ValueError,'foreground_dev_surface_required'):await a.foreground({},'safari','app',lambda:None,hidden)
 async def exercise(self,mode='ok'):
  events=[];lost=False
  class Context:
   async def __aenter__(self):return self
   async def __aexit__(self,*args):events.append('closed')
  class Control(Context):
   def __init__(self,*args):pass
   async def process_identifier_for_bundle_identifier(self,bundle):assert bundle=='com.dev.kudos.fit';return 44
  class Audit(Context):
   RSD_SERVICE_NAME='ax-audit'
   def __init__(self,*args):pass
   async def supported_audits_types(self):return list(a.CHECKS.values()) if mode!='unsupported' else []
   async def _invoke(self,method,*args,**kwargs):
    events.append(method)
    if mode=='cleanup' and method=='devicePerformFinalCleanup':raise OSError('fixture')
   async def run_audit(self,types):
    nonlocal lost
    events.append('run')
    if mode=='timeout':raise asyncio.TimeoutError()
    if mode=='owner':lost=True
    return [Obj(json=lambda:{'issue_classification':'testTypeHitRegion','element_rect_value':'{{0,0},{10,10}}','authorization':'sensitive-secret','unknown':'omit'}) for _ in range(300)]
  calls=0
  async def fore(*args):
   nonlocal calls
   calls+=1
   return {'surface':'kickoff-dev','boot':'changed' if mode=='changed' and calls==2 else 'original'}
  def check():
   if lost:raise ValueError('owner-expired')
  fake={'pymobiledevice3.services.accessibilityaudit':Obj(AccessibilityAudit=Audit),
   'pymobiledevice3.services.dvt.instruments.dvt_provider':Obj(DvtProvider=lambda rsd:Context()),
   'pymobiledevice3.services.dvt.instruments.process_control':Obj(ProcessControl=Control)}
  r={'audit':{}};rsd=Obj(peer_info={'Services':{'ax-audit':{}}})
  with patch.dict(sys.modules,fake),patch.object(a,'foreground',side_effect=fore):
   try:result=await a.capture(r,rsd,check,None)
   except (ValueError,asyncio.TimeoutError) as e:result=e
  return result,events,r
 async def test_bounded_projection_and_cleanup(self):
  r,e,q=await self.exercise();self.assertEqual(r['issueCount'],256);self.assertEqual(r['droppedIssues'],44)
  self.assertNotIn('authorization',r['issues'][0]);self.assertNotIn('unknown',r['issues'][0]);self.assertTrue(r['noIssuesIsNotAccessibilityCertification']);self.assertEqual(e[-2:],['devicePerformFinalCleanup','closed'])
 async def test_timeout_always_cleans_up_and_never_reruns(self):
  r,e,q=await self.exercise('timeout');self.assertIsInstance(r,asyncio.TimeoutError);self.assertEqual(e.count('run'),1);self.assertEqual(e[-2:],['devicePerformFinalCleanup','closed']);self.assertTrue(q['_auditRequested'])
 async def test_unsupported_check_does_not_start_or_set_target(self):
  r,e,q=await self.exercise('unsupported');self.assertIsInstance(r,ValueError);self.assertNotIn('run',e);self.assertNotIn('deviceSetAuditTargetPid:',e);self.assertNotIn('_auditRequested',q)
 async def test_owner_loss_cleans_up_before_refusing(self):
  r,e,q=await self.exercise('owner');self.assertRegex(str(r),'owner-expired');self.assertEqual(e[-2:],['devicePerformFinalCleanup','closed'])
 async def test_cleanup_failure_cannot_pass(self):
  r,e,q=await self.exercise('cleanup');self.assertRegex(str(r),'accessibility_cleanup_unconfirmed');self.assertEqual(e[-1],'closed')
 async def test_changed_surface_cannot_pass(self):
  r,e,q=await self.exercise('changed');self.assertRegex(str(r),'accessibility_surface_changed');self.assertIn('devicePerformFinalCleanup',e)
if __name__=='__main__':unittest.main()
