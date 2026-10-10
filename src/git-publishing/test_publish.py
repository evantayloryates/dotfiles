import contextlib
import importlib.util
import io
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)

class PublicationSmoke(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.remote = self.root / 'remote.git'
        subprocess.run(['git','init','--bare','--initial-branch=master',str(self.remote)],check=True,stdout=subprocess.DEVNULL)
        self.a = self.clone('a')
        self.commit(self.a,'base')
        self.git(self.a,'push','origin','master')
        self.b = self.clone('b')
    def git(self,repo,*args):
        return subprocess.run(['git','-C',str(repo),*args],check=True,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE).stdout.strip()
    def clone(self,name):
        repo=self.root/name
        subprocess.run(['git','clone',str(self.remote),str(repo)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        self.git(repo,'config','user.name','Synthetic Publisher')
        self.git(repo,'config','user.email','publisher@example.test')
        return repo
    def commit(self,repo,name):
        (repo/name).write_text(name)
        self.git(repo,'add',name);self.git(repo,'commit','-m',name)
    def test_real_divergence_rebases_and_preserves_both_clients(self):
        self.commit(self.a,'local');self.commit(self.b,'remote');self.git(self.b,'push','origin','master')
        publisher.publish(self.a)
        check=self.clone('readback')
        self.assertEqual({p.name for p in check.iterdir() if p.is_file()},{'base','local','remote'})
        self.assertEqual(self.git(self.a,'rev-parse','HEAD'),self.git(check,'rev-parse','HEAD'))
        self.assertFalse(self.git(self.a,'for-each-ref','refs/dotfiles-publish'))
    def test_real_competing_push_loses_lease_then_recovers(self):
        self.commit(self.a,'local');original=publisher.git; pushes=[]
        def race(repo,*args,**kwargs):
            if args[0]=='push':
                pushes.append(args)
                if len(pushes)==1:
                    self.commit(self.b,'race');self.git(self.b,'push','origin','master')
            return original(repo,*args,**kwargs)
        publisher.git=race
        try:publisher.publish(self.a)
        finally:publisher.git=original
        self.assertEqual(len(pushes),2)
        self.assertTrue(all(x[1].startswith('--force-with-lease=refs/heads/master:') for x in pushes))
        self.assertNotEqual(pushes[0][1],pushes[1][1])
        check=self.clone('readback');self.assertTrue((check/'race').exists());self.assertTrue((check/'local').exists())
    def test_dirty_tree_refused_without_hiding_edits(self):
        (self.a/'uncommitted').write_text('keep')
        with self.assertRaisesRegex(RuntimeError,'Commit shared changes'):publisher.publish(self.a)
        self.assertEqual((self.a/'uncommitted').read_text(),'keep')
        self.assertEqual(self.git(self.b,'rev-parse','HEAD'),self.git(self.a,'rev-parse','HEAD'))

if __name__=='__main__':unittest.main()
