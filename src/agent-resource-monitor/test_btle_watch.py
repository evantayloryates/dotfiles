import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import btle_watch as b

class WatchTests(unittest.TestCase):
    def test_episode_and_preflight(self):
        tick = [0]
        def sample(previous):
            tick[0] += 1
            return dict(timestamp=b.watcher.monitor.now(),monotonic=tick[0],collection_health='ok',
                        targets=[dict(pid=123,cpu_percent=98 if tick[0]<=7 else 0)]), []
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            with patch.object(b,'diagnose'), patch.object(b,'measure',sample), patch.object(b,'processes',return_value=([],'ok')), patch.object(b.watcher,'light_sample',return_value={}), patch.object(b.time,'sleep'):
                b.watch(root,count=40)
            episodes=list(root.glob('episode-*.json'))
            self.assertEqual(len(episodes),1)
            episode=json.loads(episodes[0].read_text())
            self.assertEqual(episode['samples'][0]['monotonic'],1)
            self.assertEqual(b.status(root)['state'],'watching')
            self.assertFalse(b.status(root)['preflight_warning'])
    def test_moderate_work_and_short_spike(self):
        for cpus,expected in [([40]*35,1),([95]*4+[0]*35,0),([0]*40,0)]:
            tick=[0]
            def sample(previous):
                n=tick[0];tick[0]+=1
                return dict(timestamp=b.watcher.monitor.now(),monotonic=n,collection_health='ok',targets=[dict(pid=123,cpu_percent=cpus[n])]), []
            with tempfile.TemporaryDirectory() as folder:
                root=Path(folder)
                with patch.object(b,'diagnose'),patch.object(b,'measure',sample),patch.object(b,'processes',return_value=([],'ok')),patch.object(b.watcher,'light_sample',return_value={}),patch.object(b.time,'sleep'):
                    b.watch(root,count=len(cpus))
                self.assertEqual(len(list(root.glob('episode-*.json'))),expected)

    def test_redaction(self):
        text=b.redact("AA:BB:CC:DD:EE:FF J23P6QB926JY 2294894D-7918-3325-96AD-8A61E3BCCBD1")
        self.assertEqual(text,"[address] [identifier] [uuid]")

    def test_stale(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            b.watcher.write_json(root/'status.json',dict(timestamp='2020-01-01T00:00:00+00:00'))
            self.assertTrue(b.status(root)['preflight_warning'])

if __name__=='__main__':unittest.main()
