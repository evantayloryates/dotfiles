import asyncio
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace as Obj
import unittest
from unittest.mock import patch

import device_observer as observer

class ObserverBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_private_origin_busy_inactive_and_old_targets_are_not_attached(self):
        calls=[]
        def target(id_,url,active=True,busy=''):
            return Obj(application=Obj(bundle='com.apple.mobilesafari',active=active,id_='app'),
                page=Obj(id_=id_,web_url=url,web_connection_id=busy))
        origin='https://dev.example.ts.net:10446'
        targets=[target(1,origin+'/old'),target(9,origin+'/current'),
            target(12,origin+'/busy',busy='someone'),target(15,origin+'/inactive',active=False),
            target(99,'https://dev.example.ts.net.evil.test:10446/unrelated')]
        async def command(method,**args):
            calls.append(method)
            self.assertFalse(args['userGesture'])
            return {'params':{'message':json.dumps({'result':{'result':{'value':{'originMatches':True,'visible':True}}}})}}
        class Inspector:
            def __init__(self,rsd):pass
            async def connect(self):pass
            async def get_open_application_pages(self,timeout):return targets
            async def inspector_session(self,app,page):
                calls.append(('attach',page.id_))
                async def enable():calls.append('runtime_enable')
                return Obj(runtime_enable=enable,send_command=command,
                    _receive_task=asyncio.create_task(asyncio.sleep(100)),protocol=Obj(id_='owned'))
            async def teardown_inspector_socket(self,*args):calls.append('detach')
            async def close(self):calls.append('close')
        with tempfile.TemporaryDirectory() as directory:
            runtime=Path(directory)/'dev-runtime.json'
            runtime.write_text(json.dumps({'webURL':origin}));runtime.chmod(0o600)
            fake=Obj(WebinspectorService=Inspector)
            with patch.dict(sys.modules,{'pymobiledevice3.services.webinspector':fake}),patch.object(observer,'owned'):
                result=await observer.browser_debug({'state':directory},None)
        self.assertEqual(result['devTargets'],2)
        self.assertEqual(result['busyTargets'],1)
        self.assertEqual([x for x in calls if isinstance(x,tuple)],[('attach',9)])
        self.assertEqual(calls[-2:],['detach','close'])
        self.assertTrue(result['pages'][0]['readConfirmed'])

    async def test_inactive_owner_is_refused_before_broker_or_device(self):
        with tempfile.TemporaryDirectory() as directory:
            owner=Path(directory)/'owner.json';owner.write_text('{"active":false}')
            with patch.object(observer,'request') as broker:
                with self.assertRaisesRegex(ValueError,'observer_owner_expired'):
                    observer.owned({'ownerFile':str(owner)})
                broker.assert_not_called()

if __name__=='__main__':unittest.main()
