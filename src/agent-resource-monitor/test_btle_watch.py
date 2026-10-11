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
            with patch.object(b,'measure',sample), patch.object(b,'processes',return_value=([],'ok')), patch.object(b.watcher,'light_sample',return_value={}), patch.object(b.time,'sleep'):
                b.watch(root,count=40)
            episodes=list(root.glob('episode-*.json'))
            self.assertEqual(len(episodes),1)
            episode=json.loads(episodes[0].read_text())
            self.assertEqual(episode['samples'][0]['monotonic'],1)
            self.assertEqual(b.status(root)['state'],'watching')
            self.assertFalse(b.status(root)['preflight_warning'])
    def test_stale(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            b.watcher.write_json(root/'status.json',dict(timestamp='2020-01-01T00:00:00+00:00'))
            self.assertTrue(b.status(root)['preflight_warning'])

if __name__=='__main__':unittest.main()
