import asyncio,sys,unittest
from types import SimpleNamespace as Obj
from unittest.mock import patch
import device_foreground as foreground
class ForegroundEvents(unittest.IsolatedAsyncioTestCase):
 async def exercise(self,mode):
  calls=[];sent=asyncio.Event();bundle='com.apple.mobilesafari'
  class Audit:
   def __init__(self,rsd):pass
   async def __aenter__(self):calls.append('open');return self
   async def set_app_monitoring_enabled(self,v):
    calls.append(('monitor',v))
    if mode=='cleanup' and v is False:raise ConnectionError('disable failed')
   async def set_monitored_event_type(self):calls.append('event-type')
   async def _invoke(self,name,**args):calls.append(name)
   async def close(self):calls.append('close')
   async def iter_events(self,**args):
    await sent.wait()
    rows=[{'displayID':bundle,'state':8}]
    if mode=='wrong':rows=[{'displayID':'com.example.unrelated','state':8}]
    if mode=='background':rows.append({'displayID':bundle,'state':4})
    for d in rows:yield Obj(name='hostAppStateChanged:',data=d)
    await asyncio.Event().wait()
  async def dispatch():
   calls.append('dispatch');sent.set()
   if mode=='unknown':raise ConnectionError('unknown')
   return 7
  with patch.dict(sys.modules,{'pymobiledevice3.services.accessibilityaudit':Obj(AccessibilityAudit=Audit)}):
   if mode=='cleanup':
    with self.assertRaisesRegex(ValueError,'foreground_cleanup_unconfirmed'):await foreground.launch_observed({},Obj(peer_info={'Services':{foreground.SERVICE:{}}}),bundle,dispatch,lambda:None)
    result=None
   elif mode=='unknown':
    with self.assertRaises(ConnectionError):await foreground.launch_observed({},Obj(peer_info={'Services':{foreground.SERVICE:{}}}),bundle,dispatch,lambda:None)
    result=None
   else:result=await foreground.launch_observed({},Obj(peer_info={'Services':{foreground.SERVICE:{}}}),bundle,dispatch,lambda:None)
  self.assertEqual(calls.count('dispatch'),1);self.assertEqual(calls[-3:],[('monitor',False),'devicePerformFinalCleanup','close'])
  self.assertFalse(any('Visual' in str(x) or 'Focus' in str(x) or 'press' in str(x) for x in calls))
  return result
 async def test_actual_fixed_target_foreground_event_has_bounded_evidence(self):
  pid,result=await self.exercise('accepted');self.assertEqual(pid,7);self.assertTrue(result['foregroundVerified']);self.assertEqual(result['foregroundEvidence']['bundle'],'com.apple.mobilesafari');self.assertEqual(result['foregroundEvidence']['state'],8)
 async def test_wrong_app_or_subsequent_background_does_not_prove_foreground(self):
  for mode in ['wrong','background']:
   pid,result=await self.exercise(mode);self.assertFalse(result['foregroundVerified']);self.assertNotIn('foregroundEvidence',result)
 async def test_unknown_dispatch_is_not_retried_and_monitor_is_cleaned(self):await self.exercise('unknown')
 async def test_failed_disable_still_attempts_final_cleanup_and_closes_without_claiming_success(self):await self.exercise('cleanup')
 async def test_missing_service_keeps_one_fixed_launch_without_fallback(self):
  calls=[]
  async def dispatch():calls.append('dispatch');return 7
  pid,result=await foreground.launch_observed({},Obj(peer_info={}), 'com.apple.mobilesafari',dispatch,lambda:None)
  self.assertEqual(calls,['dispatch']);self.assertFalse(result['foregroundVerified'])
 async def test_lost_owner_does_not_get_swallowed_as_optional_observer_failure(self):
  calls=[]
  class Audit:
   def __init__(self,rsd):pass
   async def __aenter__(self):calls.append('open');return self
   async def close(self):calls.append('close')
  def check():
   if 'open' in calls:raise ValueError('observer_owner_expired')
  async def dispatch():self.fail('owner lost before dispatch')
  with patch.dict(sys.modules,{'pymobiledevice3.services.accessibilityaudit':Obj(AccessibilityAudit=Audit)}),self.assertRaisesRegex(ValueError,'observer_owner_expired'):
   await foreground.launch_observed({},Obj(peer_info={'Services':{foreground.SERVICE:{}}}),'com.apple.mobilesafari',dispatch,check)
  self.assertEqual(calls,['open','close'])
 async def test_arbitrary_target_is_refused_before_service_or_launch(self):
  async def dispatch():self.fail('not allowed')
  with self.assertRaisesRegex(ValueError,'fixed_foreground_target_required'):await foreground.launch_observed({},None,'com.example.other',dispatch,lambda:None)
if __name__=='__main__':unittest.main()
