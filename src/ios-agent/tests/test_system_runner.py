import asyncio
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace as Obj
import unittest
from unittest.mock import patch
import system_runner as runner

class SystemRunnerBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_cleanup_kills_only_a_matching_owned_runner(self):
        for current,started,expected in [(88,{77},False),(77,{77},True),(0,{77},True)]:
            calls=[]
            class Context:
                async def __aenter__(self):return self
                async def __aexit__(self,*args):pass
            class Control(Context):
                def __init__(self,d):self.pid=current
                async def process_identifier_for_bundle_identifier(self,bundle):return self.pid
                async def kill(self,pid):calls.append(pid);self.pid=0
            fakes={'pymobiledevice3.remote.native_tunnel':Obj(NativeRemotedTunnel=lambda **args:Context()),
                   'pymobiledevice3.services.dvt.instruments.dvt_provider':Obj(DvtProvider=lambda r:Context()),
                   'pymobiledevice3.services.dvt.instruments.process_control':Obj(ProcessControl=Control)}
            with patch.dict(sys.modules,fakes):self.assertEqual(await runner.verify_stopped('configured',started),expected)
            self.assertEqual(calls,[77] if current==77 else [])

    async def test_runner_log_rollover_keeps_owned_pid_and_bounds_storage(self):
        with tempfile.TemporaryDirectory() as d:
            log=Path(d)/'log';log.touch();reader=asyncio.StreamReader()
            reader.feed_data(b'WebDriverAgentRunner-Runner[77:123] start\n'+b'x'*(2*1024*1024));reader.feed_eof();started=set()
            await runner.collect_runner_output(reader,log,started)
            self.assertEqual(started,{77});self.assertLessEqual(log.stat().st_size,1024*1024)

    def test_stale_owner_fails_before_any_device_or_broker_request(self):
        with tempfile.TemporaryDirectory() as d:
            owner=Path(d)/'owner.json';owner.write_text(json.dumps({'active':True,'heartbeatAt':0,'activityAt':0,'pid':1}))
            with patch.object(runner,'request') as request:
                self.assertFalse(runner.owned({'ownerFile':str(owner)}));request.assert_not_called()

if __name__=='__main__':unittest.main()
