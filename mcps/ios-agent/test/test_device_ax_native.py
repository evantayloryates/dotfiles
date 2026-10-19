import asyncio,sys,unittest
from types import SimpleNamespace as Obj
from unittest.mock import patch
import device_ax_native as ax
class NativeAX(unittest.IsolatedAsyncioTestCase):
 def test_corrected_handle_nesting_and_fixed_activate_metadata(self):
  element,action=ax.element_payload(b'x'*20)
  self.assertEqual(element['Value']['Value']['PlatformElementValue_v1']['Value'],b'x'*20)
  self.assertEqual(action['Value']['Value']['AttributeNameValue_v1']['Value'],'AXAction-2010')
  for bad in [None,'arbitrary',b'x'*15,b'x'*65]:
   with self.assertRaises(ValueError):ax.element_payload(bad)
 async def scenario(self,mode):
  calls=[]
  class Focus:
   def __init__(self,caption):self.caption=caption;self.element=Obj(identifier=b'x'*20)
  class Audit:
   def __init__(self):self._event_queue=asyncio.Queue();self.step=0
   async def set_app_monitoring_enabled(self,v):calls.append(('monitor',v))
   async def set_monitored_event_type(self):calls.append('event-type')
   def _extract_event_payload(self,args):return args[0]
   async def _invoke(self,name,*args,**kwargs):
    calls.append(name)
    if name=='deviceElement:performAction:withValue:':
     self.lastElement=args[0]
     if mode=='unknown':raise ConnectionError()
     if mode=='delivery':
      async def queued():await asyncio.sleep(.01);calls.append('effect-delivered')
      self.delivery=asyncio.create_task(queued())
    elif name=='devicePerformFinalCleanup' and mode=='delivery' and hasattr(self,'delivery'):
     if not self.delivery.done():self.delivery.cancel()
   async def move_focus(self,direction):
    calls.append('move')
    if direction==5:
     await self._event_queue.put(('hostInspectorCurrentElementChanged:',[Focus('DEV header')]))
     return
    caption=['Invite, tab, 4 of 4, Button','Nutrition, tab, 3 of 4, Button'][min(self.step,1)];self.step+=1
    if mode=='selected' and self.step==2:caption+=', Selected'
    if mode=='wrong':caption='Confirm Apple ID password, Button'
    if mode=='extension':await self._event_queue.put(('hostAppStateChanged:',[{'displayID':'com.example.helper-extension','state':8}]))
    if mode=='lost':await self._event_queue.put(('hostAppStateChanged:',[{'displayID':ax.BUNDLE,'state':4}]))
    await self._event_queue.put(('hostInspectorCurrentElementChanged:',[Focus(caption)]))
  audit=Audit();module=Obj(AXAuditInspectorFocus_v1=Focus,Direction=Obj(First=5,Last=6,Previous=3),deserialize_object=lambda v:v)
  with patch.dict(sys.modules,{'pymobiledevice3.services.accessibilityaudit':module}):
   if mode=='lost':
    with self.assertRaisesRegex(ValueError,'ax_native_surface_changed'):await ax.focus_press(audit,7,'nutrition',lambda:None)
    result=None
   else:result=await ax.focus_press(audit,7,'nutrition',lambda:None)
  self.assertEqual(calls[-2:],[('monitor',False),'devicePerformFinalCleanup'])
  self.assertEqual(calls.count('deviceElement:performAction:withValue:'),1 if mode in ['accepted','unknown','extension','delivery'] else 0)
  if mode=='delivery':self.assertLess(calls.index('effect-delivered'),calls.index('devicePerformFinalCleanup'))
  return result
 async def test_queued_activation_can_settle_before_cleanup_without_replay(self):
  r=await self.scenario('delivery');self.assertEqual(r['settleMs'],500);self.assertFalse(r['effectVerified'])
 async def test_fixed_observed_native_tab_activates_once_with_corrected_handle(self):
  r=await self.scenario('accepted');self.assertTrue(r['axPressSent']);self.assertFalse(r['effectVerified']);self.assertEqual(r['focusSteps'],2)
 async def test_another_foreground_running_extension_is_not_proof_the_target_backgrounded(self):
  self.assertTrue((await self.scenario('extension'))['axPressSent'])
 async def test_selected_tab_is_an_observed_no_input_result(self):
  r=await self.scenario('selected');self.assertTrue(r['alreadySelected']);self.assertFalse(r['axPressSent']);self.assertTrue(r['selectedAXObserved'])
 async def test_unknown_press_never_repeats(self):
  r=await self.scenario('unknown');self.assertEqual(r['axPressSent'],'unknown');self.assertFalse(r['replay'])
 async def test_unexpected_caption_and_foreground_loss_refuse_activation(self):
  self.assertFalse((await self.scenario('wrong'))['axPressSent']);await self.scenario('lost')
 async def test_disabled_candidate_or_unknown_tab_refuses_before_import_or_transport(self):
  for r in [{},{'experimentalAX':True,'axTab':'Allow'}]:
   with self.assertRaisesRegex(ValueError,'experimental_ax_native_tab_required'):await ax.native_tab(r,None,lambda:None)
if __name__=='__main__':unittest.main()
