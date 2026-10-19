import sys,unittest
from types import SimpleNamespace as Obj
from unittest.mock import patch
import device_observer as observer

class ShortcutHome(unittest.IsolatedAsyncioTestCase):
 async def test_fixed_phone_shortcut_is_one_activation_without_termination(self):
  calls=[]
  class Service:
   def __init__(self,rsd):pass
   async def __aenter__(self):return self
   async def __aexit__(self,*args):calls.append('close')
   async def invoke(self,name,payload):calls.append((name,payload));return {'processToken':{'processIdentifier':7}}
  with patch.dict(sys.modules,{'pymobiledevice3.remote.core_device.app_service':Obj(AppServiceService=Service)}),patch.object(observer,'owned'):
   r={};result=await observer.shortcut_home(r,None)
  name,payload=calls[0];self.assertEqual(name,'com.apple.coredevice.feature.launchapplication')
  self.assertEqual(payload['applicationSpecifier']['bundleIdentifier']['_0'],'com.apple.shortcuts')
  self.assertEqual(payload['options']['payloadURL'],{'relative':'shortcuts://run-shortcut?name=Runner%20Home'})
  self.assertTrue(payload['options']['activates']);self.assertFalse(payload['options']['terminateExisting'])
  self.assertEqual(calls[-1],'close');self.assertFalse(result['homeVerified']);self.assertEqual(r['_launchSent'],True)
 async def test_caller_cannot_change_shortcut_or_pass_arguments(self):
  for key in ['url','target','browser','profile','shortcut','arguments']:
   with patch.object(observer,'payload_launch') as launch,self.assertRaisesRegex(ValueError,'fixed_home_shortcut_required'):
    await observer.shortcut_home({key:'other'},None)
   launch.assert_not_called()
 async def test_unknown_dispatch_is_not_retried_and_closes_service(self):
  calls=[]
  class Service:
   def __init__(self,rsd):pass
   async def __aenter__(self):return self
   async def __aexit__(self,*args):calls.append('close')
   async def invoke(self,*args):calls.append('sent');raise ConnectionError()
  with patch.dict(sys.modules,{'pymobiledevice3.remote.core_device.app_service':Obj(AppServiceService=Service)}),patch.object(observer,'owned'):
   r={}
   with self.assertRaises(ConnectionError):await observer.shortcut_home(r,None)
  self.assertEqual(r['_launchSent'],'unknown');self.assertEqual(calls,['sent','close'])
if __name__=='__main__':unittest.main()
