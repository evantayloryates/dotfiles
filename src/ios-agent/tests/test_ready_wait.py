import threading
import time
import unittest
from service import Broker,Rejected

class ReadyWaitTests(unittest.TestCase):
    def setUp(self):self.b=Broker({'device':'phone','bundle':'com.dev.kudos.fit'})
    def test_native_event_wakes_waiter_without_owner_or_runtime_claim(self):
        result=[];thread=threading.Thread(target=lambda:result.append(self.b.control({'op':'ready_wait','surface':'native','timeoutSeconds':2})))
        thread.start();time.sleep(.03)
        self.b.device_request({'op':'hello','device':'phone','bundle':'com.dev.kudos.fit','boot':'boot','feedback':{'foreground':True}})
        thread.join(.5);self.assertFalse(thread.is_alive());self.assertTrue(result[0]['readyToAcquire']);self.assertFalse(result[0]['runtimeVerified']);self.assertIsNone(self.b.lease)
    def test_web_event_filters_browser_and_hides_stale_or_background_documents(self):
        origin='https://fixture.ts.net:10446';grant=self.b.control({'op':'web_enroll','origin':origin});identity=self.b.web.page_request({'op':'join','token':grant['token'],'boot':'doc'},origin)
        request={'op':'ready_wait','surface':'web','timeoutSeconds':0}
        self.assertFalse(self.b.control(request)['readyToAcquire'])
        self.b.web.page_request({**identity,'op':'poll','boot':'doc','visible':True,'ready':True,'browser':'ios-safari'},origin)
        self.assertTrue(self.b.control(request)['readyToAcquire']);self.assertFalse(self.b.control({**request,'browser':'ios-chrome'})['readyToAcquire'])
        self.b.web.pages[identity['page']]['seen']-=6;self.assertFalse(self.b.control(request)['readyToAcquire'])
        self.assertEqual(self.b.control(request)['lockState'],'unknown')
    def test_another_owner_not_displaced_and_wait_bound_enforced(self):
        self.b.lease={'id':'other','thread':'other','turn':'other','expires':self.b.clock()+100}
        result=self.b.control({'op':'ready_wait','timeoutSeconds':0});self.assertEqual(result['reason'],'another_owner');self.assertEqual(self.b.lease['id'],'other')
        for value in (-1,56,True):
            with self.assertRaises(Rejected):self.b.control({'op':'ready_wait','timeoutSeconds':value})

    def test_idle_timeout_names_launch_but_another_owner_never_does(self):
        idle=self.b.control({'op':'ready_wait','timeoutSeconds':0})
        self.assertEqual(idle['reason'],'no_fresh_foreground_bridge');self.assertIn('ios_device_launch target=kickoff-dev',idle['next'])
        self.b.lease={'id':'other','thread':'other','turn':'other','expires':self.b.clock()+100}
        busy=self.b.control({'op':'ready_wait','timeoutSeconds':0})
        self.assertEqual(busy['reason'],'another_owner');self.assertNotIn('ios_device_launch',busy['next'])

    def test_any_with_browser_filter_cannot_return_native(self):
        self.b.device_request({'op':'hello','device':'phone','bundle':'com.dev.kudos.fit','boot':'boot','feedback':{'foreground':True}})
        self.assertFalse(self.b.control({'op':'ready_wait','browser':'ios-safari','timeoutSeconds':0})['readyToAcquire'])
    def test_idle_worker_prunes_expired_capture_only(self):
        import tempfile,json
        from pathlib import Path
        from service import prune_captures
        with tempfile.TemporaryDirectory() as state:
            root=Path(state)/'rich-captures';expired=root/('a'*32);expired.mkdir(parents=True);(expired/'retention.json').write_text(json.dumps({'expiresAt':1}));(expired/'audio.audio').write_bytes(b'fixture')
            keep=root/('b'*32);keep.mkdir();(keep/'retention.json').write_text(json.dumps({'expiresAt':100}))
            outside=Path(state)/'outside';outside.mkdir();(root/('c'*32)).symlink_to(outside)
            (keep/'retention.json').write_text(json.dumps({'expiresAt':9999999999999}));self.b.state=Path(state);self.b.tick();self.assertIsNone(self.b.lease);self.assertFalse(expired.exists());self.assertTrue(keep.exists());self.assertTrue(outside.exists())
