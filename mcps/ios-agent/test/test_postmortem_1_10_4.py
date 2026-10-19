import asyncio,sys,unittest
from types import SimpleNamespace as Obj
from unittest.mock import patch
import device_foreground as foreground
from verify import Verifier, failed_predicate

class UsagePatch(unittest.TestCase):
 def test_missing_native_feedback_is_distinct_from_host_ownership(self):
  self.assertEqual(failed_predicate('idle',{'hostIdle':True,'deviceFeedbackKnown':False}),'native_feedback_unavailable')
  self.assertEqual(failed_predicate('idle',{'hostIdle':False,'deviceFeedbackKnown':False}),'host_cleanup_pending')
  self.assertEqual(failed_predicate('idle',{'hostIdle':True,'deviceFeedbackKnown':True,'nativeLeaseOff':True,'nativeIndicatorOff':False}),'native_indicator_off_unconfirmed')
 def test_idle_still_fails_without_native_evidence_but_host_idle_passes(self):
  clock=[0]
  def exchange(*args):return {'epoch':'fixture','lease':None,'reactFrontendRunning':False,'reactFrontendCleanupPending':False,'device':None}
  def sleep(n):clock[0]+=n
  v=Verifier('/unused',exchange,lambda:clock[0],sleep)
  r=v.run('idle',timeout=1)
  self.assertEqual(r['status'],'failed');self.assertEqual(r['reason'],'deadline_exceeded');self.assertEqual(r['failedPredicate'],'native_feedback_unavailable')
  self.assertEqual(v.run('host-idle',timeout=1)['status'],'passed')

class ForegroundFailure(unittest.IsolatedAsyncioTestCase):
 async def test_dispatch_failure_phase_survives_successful_or_failed_cleanup(self):
  for cleanup_fails in [False,True]:
   r={};calls=[]
   class Audit:
    def __init__(self,rsd):pass
    async def __aenter__(self):return self
    async def set_app_monitoring_enabled(self,v):
     calls.append(v)
     if not v and cleanup_fails:raise ConnectionError('cleanup')
    async def set_monitored_event_type(self):pass
    async def iter_events(self,**args):
     await asyncio.Event().wait();yield
    async def _invoke(self,*a,**k):calls.append('final-cleanup')
    async def close(self):calls.append('closed')
   async def dispatch():r['_phase']='browser_url_launch';r['_launchSent']='unknown';raise RuntimeError('fixture-dispatch')
   with patch.dict(sys.modules,{'pymobiledevice3.services.accessibilityaudit':Obj(AccessibilityAudit=Audit)}):
    with self.assertRaisesRegex(RuntimeError,'fixture-dispatch'):await foreground.launch_observed(r,Obj(peer_info={'Services':{foreground.SERVICE:{}}}),'com.apple.mobilesafari',dispatch,lambda:None)
   self.assertEqual(r['_failurePhase'],'browser_url_launch');self.assertEqual(r['_launchSent'],'unknown');self.assertEqual(calls[-2:],['final-cleanup','closed'])
   self.assertEqual(r.get('_cleanupFailure'), 'foreground_cleanup_unconfirmed' if cleanup_fails else None)
if __name__=='__main__':unittest.main()
