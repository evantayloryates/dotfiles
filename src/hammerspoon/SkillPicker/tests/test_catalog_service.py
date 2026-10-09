import importlib.util
from pathlib import Path
import tempfile
import unittest
import json
import time

spec=importlib.util.spec_from_file_location('catalog_service',Path(__file__).parents[1]/'catalog_service.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Fixture(m.NativeInventory):
    def start(self): pass
    def call(self, method, params, timeout=5):
        self.calls=getattr(self,'calls',0)+1
        rows=[{'name':p.parent.name,'path':str(p),'enabled':True}
              for p in (self.home/'.codex/skills').glob('*/SKILL.md')]
        if getattr(self,'incomplete',False): return {'data':[{'skills':rows,'errors':['fixture']} ]}
        return {'data':[{'skills':rows,'errors':[]} ]}

class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.home=Path(self.temp.name)
        self.root=self.home/'.codex/skills';self.root.mkdir(parents=True)
        self.add('taylor-alpha');self.add('taylor-pr-review')
        self.s=Fixture(home=self.home)
    def tearDown(self): self.s.sel.close();self.temp.cleanup()
    def add(self,name):
        p=self.root/name;p.mkdir();(p/'SKILL.md').write_text('---\nname: '+name+'\n---\n')
    def test_unchanged_queries_reuse_confirmed_inventory(self):
        self.s.refresh();self.s.refresh('pr review');self.s.refresh('taylor-')
        self.assertEqual(self.s.calls,1)
    def test_addition_removal_detected_without_restart(self):
        self.s.refresh();self.add('taylor-new');self.assertEqual(self.s.refresh()['count'],3)
        (self.root/'taylor-new/SKILL.md').unlink();self.assertEqual(self.s.refresh()['count'],2)
    def test_file_edit_invalidates(self):
        self.s.refresh();(self.root/'taylor-alpha/SKILL.md').write_text('changed')
        self.assertTrue(self.s.refresh()['changed'])
    def test_unrelated_home_changes_do_not_invalidate(self):
        self.s.refresh();(self.home/'unrelated').mkdir();(self.home/'.codex/unrelated').mkdir()
        self.assertFalse(self.s.refresh()['changed'])
    def test_native_error_does_not_commit_new_signature(self):
        self.s.refresh();previous=self.s.signature;self.add('taylor-new');self.s.incomplete=True
        with self.assertRaises(RuntimeError):self.s.refresh()
        self.assertEqual(self.s.signature,previous)
    def test_spaces_case_hyphens(self):
        self.assertEqual(self.s.refresh('PR review')['skills'][0]['name'],'taylor-pr-review')
    def test_symlink_cycle_is_bounded(self):
        (self.root/'cycle').symlink_to(self.root, target_is_directory=True)
        start=time.perf_counter();self.s.fingerprint();self.assertLess(time.perf_counter()-start,.5)
    def test_disabled_native_registrations_are_never_selectable(self):
        def call(method,params,timeout=5):
            return {'data':[{'skills':[
                {'name':'entry','path':'/entry/SKILL.md','enabled':True},
                {'name':'internal','path':'/internal/SKILL.md','enabled':False}], 'errors':[]}]}
        self.s.call=call
        self.assertEqual([r['name'] for r in self.s.refresh()['skills']],['entry'])
    def test_codex_configuration_edit_invalidates_cached_visibility(self):
        self.s.refresh()
        p=self.home/'.codex/config.toml';p.write_text('[skills]\n')
        self.assertTrue(self.s.refresh()['changed']);self.assertEqual(self.s.calls,2)
    def test_new_plugin_collection_parent_is_observed(self):
        p=self.home/'.codex/plugins/cache/vendor/plugin/1/skills/example/SKILL.md';p.parent.mkdir(parents=True);p.write_text('x')
        self.s.catalog=[{'name':'example','path':str(p)}]
        a=self.s.fingerprint();(p.parent.parent/'another').mkdir()
        self.assertNotEqual(a,self.s.fingerprint())

if __name__=='__main__':unittest.main()
