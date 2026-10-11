import fcntl
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import build_jobs as jobs

class BuildJobsTests(unittest.TestCase):
 def test_start_is_fixed_private_and_process_lock_blocks_second_client(self):
  with tempfile.TemporaryDirectory() as directory:
   state=Path(directory);base=jobs.private_base(state);locks=state/'locks';seen=[]
   config={'mobile':'/fixed/mobile'}
   def popen(args,**kw):
    seen.append((args,kw));fd=kw['pass_fds'][0];other=os.open(locks/'native-build.lock',os.O_RDWR)
    try:
     with self.assertRaises(BlockingIOError):fcntl.flock(other,fcntl.LOCK_EX|fcntl.LOCK_NB)
    finally:os.close(other)
    return SimpleNamespace(pid=12345)
   with patch.object(jobs,'LOCK_ROOT',locks),patch.object(jobs,'load_config',return_value=config),patch.object(jobs.subprocess,'Popen',side_effect=popen):r=jobs.start(base)
   self.assertTrue(r['ok']);self.assertFalse(r['installed']);self.assertFalse(r['replay'])
   folder=base/r['jobId'];self.assertEqual((folder/'runtime.json').stat().st_mode&0o777,0o600)
   self.assertEqual(json.loads((folder/'runtime.json').read_text()),config)
   self.assertEqual(seen[0][0][:3],[jobs.sys.executable,'-B',str(jobs.ROOT/'build_jobs.py')]);self.assertTrue(seen[0][1]['start_new_session'])
   with patch.object(jobs,'LOCK_ROOT',locks):
    fd=os.open(locks/'native-build.lock',os.O_RDWR);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    try:
     with patch.object(jobs,'load_config') as config_call:
      r=jobs.start(base);self.assertEqual(r['reason'],'build_job_already_running');config_call.assert_not_called()
    finally:os.close(fd)
 def test_status_recovers_across_clients_without_restarting_and_dead_worker_is_unconfirmed(self):
  with tempfile.TemporaryDirectory() as directory:
   base=jobs.private_base(Path(directory));job='a'*32;folder=base/job;folder.mkdir(mode=0o700);jobs.write(folder/'request.json',{'startedAt':1,'workerPid':12345})
   with patch.object(jobs.subprocess,'check_output',return_value=f'{jobs.ROOT}/build_jobs.py --worker {job}'):
    self.assertEqual(jobs.status(base,job)['state'],'running')
   with patch.object(jobs.subprocess,'check_output',return_value='unrelated'):
    self.assertEqual(jobs.status(base,job)['state'],'unconfirmed')
   jobs.write(folder/'result.json',{'ok':True,'state':'completed','jobId':job,'installed':False})
   self.assertEqual(jobs.status(base,job)['state'],'completed');self.assertEqual(len(jobs.status(base)['jobs']),1)
   with self.assertRaisesRegex(ValueError,'invalid_job_id'):jobs.status(base,'../escape')
 def test_terminal_build_requires_stable_sources_and_keeps_lock_in_consumer(self):
  import hashlib,plistlib
  for changed,stale in [(False,False),(True,False),(False,True)]:
   with tempfile.TemporaryDirectory() as directory:
    base=jobs.private_base(Path(directory));job='b'*32;folder=base/job;folder.mkdir(mode=0o700)
    jobs.write(folder/'runtime.json',{'mobile':'/fixed/mobile'})
    jobs.write(folder/'request.json',{'startedAt':0,'runtimeHash':hashlib.sha256((folder/'runtime.json').read_bytes()).hexdigest()})
    product=folder/'DerivedData/Build/Products/Debug-iphoneos/Kickoff.app';product.mkdir(parents=True)
    (product/'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier':'com.dev.kudos.fit','CFBundleExecutable':'Kickoff'}));(product/'Kickoff').write_bytes(b'fixture-binary')
    jobs.write(folder/'DerivedData/ios-agent-build.json',{'product':str(product),'agentBinaryVerified':True,'signatureVerified':True,'devCallbackRegistered':True,'sourceChangedDuringBuild':changed,'sources':{'fixture':'stable'}})
    if stale:jobs.write(folder/'request.json',{'startedAt':jobs.time.time()+1,'runtimeHash':hashlib.sha256((folder/'runtime.json').read_bytes()).hexdigest()})
    fd=os.open(folder/'lock',os.O_RDWR|os.O_CREAT,0o600)
    def popen(args,**kw):
     self.assertIn('--generic-destination',args);self.assertEqual(kw['pass_fds'],(fd,));self.assertTrue(kw['start_new_session'])
     return SimpleNamespace(pid=123,wait=lambda timeout:0,poll=lambda:0)
    with patch.object(jobs,'load_config',return_value={'mobile':'/fixed/mobile'}),patch.object(jobs.subprocess,'Popen',side_effect=popen),patch.object(jobs.signal,'signal'):
     jobs.work(base,job,fd)
    r=json.loads((folder/'result.json').read_text());self.assertEqual(r['ok'],not changed and not stale);self.assertFalse(r['installed']);self.assertFalse(r['phoneInputSent']);self.assertEqual(r['buildManifestFresh'],not stale)
    if not stale:self.assertEqual(r['sourceChangedDuringBuild'],changed)
 def test_retry_refuses_nonterminal_or_changed_runtime(self):
  with tempfile.TemporaryDirectory() as directory:
   base=jobs.private_base(Path(directory));locks=Path(directory)/'locks';job='c'*32;folder=base/job;folder.mkdir(mode=0o700)
   jobs.write(folder/'request.json',{'startedAt':1,'runtimeHash':'old'})
   jobs.write(folder/'result.json',{'state':'running'})
   with patch.object(jobs,'LOCK_ROOT',locks),patch.object(jobs,'load_config',return_value={'mobile':'/fixed'}),patch.object(jobs.subprocess,'Popen') as popen:
    self.assertEqual(jobs.start(base,job)['reason'],'retry_requires_terminal_failed_build');popen.assert_not_called()
    jobs.write(folder/'result.json',{'state':'failed'})
    self.assertEqual(jobs.start(base,job)['reason'],'retry_runtime_changed_start_fresh');popen.assert_not_called()
 def test_nonprivate_directory_is_refused(self):
  with tempfile.TemporaryDirectory() as directory:
   base=Path(directory)/'build-jobs';base.mkdir();base.chmod(0o755)
   with self.assertRaisesRegex(ValueError,'private_build_directory_required'):jobs.private_base(Path(directory))
 def test_retry_cannot_overwrite_a_newer_successful_cached_product(self):
  import hashlib
  with tempfile.TemporaryDirectory() as directory:
   base=jobs.private_base(Path(directory));job='d'*32;folder=base/job;folder.mkdir(mode=0o700);config={'mobile':'/fixed'}
   jobs.write(folder/'request.json',{'startedAt':1,'runtimeHash':hashlib.sha256(json.dumps(config).encode()).hexdigest()});jobs.write(folder/'result.json',{'state':'failed'})
   newer=base/('e'*32);newer.mkdir(mode=0o700);jobs.write(newer/'request.json',{'startedAt':2,'derivedDataJob':job});jobs.write(newer/'result.json',{'state':'completed'})
   with patch.object(jobs,'LOCK_ROOT',Path(directory)/'locks'),patch.object(jobs,'load_config',return_value=config),patch.object(jobs.subprocess,'Popen') as popen:
    self.assertEqual(jobs.start(base,job)['reason'],'retry_superseded_job_use_latest_receipt');popen.assert_not_called()

if __name__=='__main__':unittest.main()
