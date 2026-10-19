import fcntl
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import fixture_jobs as jobs


class FixtureJobsTests(unittest.TestCase):
    def test_live_worker_is_observed_without_restart_and_missing_worker_is_unconfirmed(self):
        with tempfile.TemporaryDirectory() as d:
            base = jobs.private_base(Path(d)); folder = base / ('a'*32);folder.mkdir()
            jobs.write(folder/'request.json', {'workerPid':123,'startedAt':1})
            with patch.object(jobs.subprocess,'check_output',return_value=f'python {jobs.ROOT}/fixture_jobs.py --worker {folder.name}'):
                self.assertEqual(jobs.status(base,folder.name)['state'],'running')
            with patch.object(jobs.subprocess,'check_output',side_effect=subprocess.CalledProcessError(1,'ps')):
                self.assertEqual(jobs.status(base,folder.name)['state'],'unconfirmed')
            done={'ok':True,'state':'completed','cleanupVerified':True}
            jobs.write(folder/'result.json',done)
            with patch.object(jobs.subprocess,'check_output') as ps:
                self.assertEqual(jobs.status(base,folder.name),done);ps.assert_not_called()
            self.assertEqual(len(jobs.status(base)['jobs']),1)
            self.assertEqual((folder/'result.json').stat().st_mode&0o777,0o600)

    def test_start_lock_fences_concurrent_clients_and_transfers_to_durable_worker(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);base=jobs.private_base(root);lockroot=root/'locks'; inherited=[]
            def spawn(*args,**kwargs):
                inherited.append(os.dup(kwargs['pass_fds'][0]));return SimpleNamespace(pid=456)
            device={'name':jobs.NAME,'state':'Shutdown'}
            with patch.object(jobs,'LOCK_ROOT',lockroot),patch.object(jobs,'inventory',return_value=device),patch.object(jobs.subprocess,'Popen',side_effect=spawn) as launch:
                a=jobs.start(base);self.assertTrue(a['ok']);self.assertEqual(a['state'],'started')
                b=jobs.start(base);self.assertEqual(b['reason'],'fixture_job_already_running');self.assertEqual(launch.call_count,1)
                self.assertTrue(launch.call_args.kwargs['start_new_session']);self.assertEqual(launch.call_args.kwargs['stdin'],subprocess.DEVNULL)
                os.close(inherited.pop())
                with patch.object(jobs,'inventory',return_value={'name':'Personal simulator','state':'Booted'}):
                    self.assertEqual(jobs.start(base)['reason'],'dedicated_simulator_unavailable')
                self.assertEqual(launch.call_count,1)

    def test_success_requires_runner_exit_cleanup_readback_and_all_gates(self):
        for code,state,gates,expected in [(0,'Shutdown',{'a':True},True),(1,'Shutdown',{'a':True},False),(0,'Booted',{'a':True},False),(0,'Shutdown',{'a':False},False)]:
            with self.subTest(code=code,state=state,gates=gates),tempfile.TemporaryDirectory() as d:
                base=jobs.private_base(Path(d));folder=base/('b'*32);folder.mkdir()
                jobs.write(folder/'request.json',{'initialState':'Shutdown'})
                jobs.write(folder/'evidence.json',{'gates':gates,'passed':True})
                fd=os.open(folder/'lock',os.O_CREAT|os.O_RDWR,0o600)
                child=SimpleNamespace(wait=lambda **kw:code)
                with patch.object(jobs.subprocess,'Popen',return_value=child) as launch,patch.object(jobs,'inventory',return_value={'state':state}),patch.object(jobs.signal,'signal'):
                    jobs.work(base,folder.name,fd)
                result=json.loads((folder/'result.json').read_text());self.assertEqual(result['passed'],expected)
                self.assertEqual(result['cleanupVerified'],code==0 and state=='Shutdown')
                self.assertIn('--lock-fd',launch.call_args.args[0]);self.assertEqual(launch.call_args.kwargs['pass_fds'],(fd,))

    def test_path_traversal_and_nonprivate_directory_refused(self):
        with tempfile.TemporaryDirectory() as d:
            base=jobs.private_base(Path(d))
            with self.assertRaises(RuntimeError):jobs.status(base,'../request')
            base.chmod(0o755)
            with self.assertRaises(RuntimeError):jobs.private_base(Path(d))

if __name__=='__main__':unittest.main()
