import json,sys,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace as Obj
from unittest.mock import patch
import device_observer as observer

class BrowserLaunch(unittest.IsolatedAsyncioTestCase):
 def fixture(self,directory,**updates):
  p=Path(directory)/'dev-runtime.json';p.write_text(json.dumps({'webURL':'https://dev.tail.ts.net:10446'}));p.chmod(0o600)
  return dict(state=directory,browser='safari',profile='call-rig',url='https://dev.tail.ts.net:10520/dev/ios-agent#ios-agent='+'A'*43,**updates)
 def test_only_fixed_browser_private_origin_and_enrollment_fragment(self):
  with tempfile.TemporaryDirectory() as d:
   q=self.fixture(d);self.assertEqual(observer.browser_launch_arguments(q)[1],'com.apple.mobilesafari')
   for k,v in [('browser','other'),('profile','staging'),('url','https://dev.tail.ts.net.evil:10520/'),('url','https://dev.tail.ts.net:10446/'),('url','https://user@dev.tail.ts.net:10520/'),('url','https://dev.tail.ts.net:10520/#other=value'),('url','https://dev.tail.ts.net:10520//evil')]:
    with self.subTest(k=k,v=v),self.assertRaises(ValueError):observer.browser_launch_arguments({**q,k:v})
 async def test_payload_dictionary_activation_nontermination_and_no_secret_result(self):
  calls=[]
  class Service:
   def __init__(self,rsd):pass
   async def __aenter__(self):return self
   async def __aexit__(self,*args):calls.append('close')
   async def invoke(self,name,payload):calls.append(payload);return {'processToken':{'processIdentifier':7}}
  with tempfile.TemporaryDirectory() as d,patch.dict(sys.modules,{'pymobiledevice3.remote.core_device.app_service':Obj(AppServiceService=Service)}),patch.object(observer,'owned'):
   q=self.fixture(d);result=await observer.browser_launch(q,None)
  options=calls[0]['options'];self.assertEqual(options['payloadURL'],{'relative':q['url']});self.assertTrue(options['activates']);self.assertFalse(options['terminateExisting']);self.assertEqual(calls[-1],'close')
  self.assertEqual(result['pid'],7);self.assertFalse(result['foregroundVerified']);self.assertNotIn('ios-agent=',json.dumps(result))
 async def test_unknown_failure_closes_without_replay(self):
  calls=[]
  class Service:
   def __init__(self,rsd):pass
   async def __aenter__(self):return self
   async def __aexit__(self,*args):calls.append('close')
   async def invoke(self,*args):calls.append('sent');raise ConnectionError()
  with tempfile.TemporaryDirectory() as d,patch.dict(sys.modules,{'pymobiledevice3.remote.core_device.app_service':Obj(AppServiceService=Service)}),patch.object(observer,'owned'):
   q=self.fixture(d)
   with self.assertRaises(ConnectionError):await observer.browser_launch(q,None)
   self.assertEqual(q['_launchSent'],'unknown')
  self.assertEqual(calls,['sent','close'])
if __name__=='__main__':unittest.main()
