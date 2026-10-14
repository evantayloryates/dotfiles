import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest

from archive_scan import scan

NOW = dt.datetime(2026, 10, 14, tzinfo=dt.timezone.utc)


class ArchiveScan(unittest.TestCase):
    def test_cold_warm_append_partial_and_expired_coverage(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); source=root/'sessions'; folder=source/'one'; folder.mkdir(parents=True)
            path=folder/'process_samples.jsonl'; cache=root/'cache.json'
            def row(days, sid):
                return json.dumps(dict(timestamp=(NOW-dt.timedelta(days=days)).isoformat(), processes=[dict(sid=sid)]))+'\n'
            path.write_text(row(8,'old')+row(2,'present'))
            group=lambda p:p['sid']
            first=scan(source,cache,group,'v1',NOW)
            self.assertEqual(first[2],1);self.assertEqual(first[3]['rows_read'],2)
            warm=scan(source,cache,group,'v1',NOW)
            self.assertEqual(warm[:3],first[:3]);self.assertEqual(warm[3]['bytes_read'],0)
            # A new complete row is indexed; an incomplete row is not consumed.
            with path.open('a') as stream:stream.write(row(1,'new')+'{"timestamp":')
            appended=scan(source,cache,group,'v1',NOW)
            self.assertEqual(appended[2],2);self.assertEqual(appended[3]['rows_read'],1)
            self.assertIn('new',appended[0])
            with path.open('a') as stream:
                stream.write(json.dumps(NOW.isoformat())+',"processes":[{"sid":"tail"}]}\n')
            completed=scan(source,cache,group,'v1',NOW)
            self.assertEqual(completed[2],3);self.assertIn('tail',completed[0])
            expired=scan(source,cache,group,'v1',NOW+dt.timedelta(days=9))
            self.assertEqual(expired[2],0);self.assertEqual(expired[0],completed[0])

    def test_replacement_truncation_identity_change_and_removed_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);source=root/'sessions';folder=source/'one';folder.mkdir(parents=True)
            path=folder/'process_samples.jsonl';cache=root/'cache.json';group=lambda p:p['sid']
            def content(sid):return json.dumps(dict(timestamp=NOW.isoformat(),processes=[dict(sid=sid)]))+'\n'
            path.write_text(content('before'));scan(source,cache,group,'v1',NOW)
            replacement=folder/'replacement';replacement.write_text(content('after'));replacement.replace(path)
            self.assertEqual(set(scan(source,cache,group,'v1',NOW)[0]),{'after'})
            path.write_text(content('x'))
            self.assertEqual(set(scan(source,cache,group,'v1',NOW)[0]),{'x'})
            self.assertEqual(set(scan(source,cache,lambda p:'mapped','v2',NOW)[0]),{'mapped'})
            path.unlink()  # Own temporary fixture only.
            self.assertEqual(scan(source,cache,group,'v2',NOW)[:3],({},None,0))


if __name__=='__main__':unittest.main()
