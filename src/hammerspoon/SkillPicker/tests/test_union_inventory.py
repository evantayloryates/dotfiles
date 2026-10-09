import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).parents[1]))
from union_inventory import DirectoryProvider, UnionInventory, reconcile
from test_catalog_service import Fixture

class UnionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.home = Path(self.temp.name)
        self.config = self.home/'harnesses.json'
        self.root = self.home/'.claude/skills'
        self.add(self.home/'.codex/skills', 'common'); self.add(self.root, 'common'); self.add(self.root, 'claude-only')
        self.entries = [{'id':'codex','provider':'codex-native'}, {'id':'claude','provider':'directory','root':'~/.claude/skills'}]
        self.configure(); self.service = UnionInventory(Fixture, self.home, self.config)
    def tearDown(self): self.service.dispose(); self.temp.cleanup()
    def configure(self): self.config.write_text(json.dumps({'harnesses':self.entries}))
    def add(self, root, name):
        p=root/name/'SKILL.md';p.parent.mkdir(parents=True, exist_ok=True);p.write_text('---\nname: '+name+'\n---\nbody');return p
    def test_union_provenance_and_noop(self):
        r=self.service.refresh();self.assertEqual(r['count'],2)
        common=next(s for s in r['skills'] if s['name']=='common')
        self.assertEqual(common['harnesses'],['claude','codex']);self.assertEqual(len(common['sources']),2)
        self.assertFalse(self.service.refresh()['changed'])
        self.assertEqual(self.service.providers[0][1].calls,1)
    def test_remove_one_harness_preserves_identity(self):
        old=next(s for s in self.service.refresh()['skills'] if s['name']=='common')
        (self.root/'common/SKILL.md').unlink()
        new=next(s for s in self.service.refresh()['skills'] if s['name']=='common')
        self.assertEqual(old['id'],new['id']);self.assertEqual(new['harnesses'],['codex'])
    def test_third_harness_and_config_resync(self):
        self.service.refresh();self.add(self.home/'other','common')
        self.entries.append({'id':'third','provider':'directory','root':str(self.home/'other')});self.configure()
        common=next(s for s in self.service.refresh()['skills'] if s['name']=='common')
        self.assertEqual(common['harnesses'],['claude','codex','third'])
    def test_failed_source_never_publishes_partial_union(self):
        self.service.refresh(); old=self.service.catalog.copy()
        (self.root/'common/SKILL.md').write_text('broken header')
        with self.assertRaises(ValueError): self.service.refresh()
        self.assertEqual(old,self.service.catalog)
        self.add(self.root,'common');self.assertEqual(self.service.refresh()['count'],2)
    def test_duplicate_ids_and_unknown_provider_rejected(self):
        self.service.refresh();old=self.service.catalog.copy()
        self.entries.append(self.entries[0]);self.configure()
        with self.assertRaises(ValueError):self.service.refresh()
        self.assertEqual(old,self.service.catalog)
    def test_collision_keeps_source_owners(self):
        def snap(paths):return {'skills':[{'name':'helper','path':p} for p in paths]}
        rows=reconcile([('codex',snap(['/codex/a/helper/SKILL.md','/codex/b/helper/SKILL.md'])),('claude',snap(['/claude/a/helper/SKILL.md']))])
        self.assertEqual(len(rows),2);self.assertTrue(all(s['ambiguous'] for s in rows))
        self.assertEqual(next(s for s in rows if s['owner']=='a')['harnesses'],['claude','codex'])
    def test_duplicate_owner_does_not_merge_same_harness_sources(self):
        rows=reconcile([('codex',{'skills':[{'name':'helper','path':'/custom/a/helper/SKILL.md'},{'name':'helper','path':'/plugin/a/helper/SKILL.md'}]}),('claude',{'skills':[{'name':'helper','path':'/claude/a/helper/SKILL.md'}]})])
        self.assertEqual(len(rows),3);self.assertEqual(len({r['id'] for r in rows}),3)
        self.assertTrue(all(len(r['sources'])==1 and r['ambiguous'] for r in rows))
    def test_symlink_cycles_and_additions(self):
        (self.root/'cycle').symlink_to(self.root,target_is_directory=True)
        self.assertEqual(self.service.refresh()['count'],2)
        self.add(self.root,'new');self.assertEqual(self.service.refresh()['count'],3)
    def test_hidden_children_do_not_reappear_from_other_harness(self):
        child=self.add(self.root,'common')
        child.write_text('---\nname: common\nuser-invocable: false\n---\nparent reads me')
        row=next(r for r in self.service.refresh()['skills'] if r['name']=='common')
        self.assertEqual(row['harnesses'],['codex']);self.assertEqual(len(row['sources']),1)
        self.assertTrue(child.exists());self.assertIn('parent reads me',child.read_text())
    def test_policy_edit_refreshes_without_renaming_or_restart(self):
        self.service.refresh()
        p=self.root/'claude-only/SKILL.md'
        p.write_text('---\nname: claude-only\nuser-invocable: false # internal child\n---\n')
        self.assertNotIn('claude-only',[r['name'] for r in self.service.refresh()['skills']])
        self.assertFalse(self.service.refresh()['changed'])
        p.write_text('---\nname: claude-only\nuser-invocable: true\n---\n')
        self.assertIn('claude-only',[r['name'] for r in self.service.refresh()['skills']])
    def test_visible_implicit_policy_is_not_manual_visibility(self):
        p=self.root/'claude-only/SKILL.md'
        p.write_text('---\nname: claude-only\nallow_implicit_invocation: false\n---\n')
        self.assertIn('claude-only',[r['name'] for r in self.service.refresh()['skills']])
    def test_body_or_nested_mentions_do_not_hide_entry(self):
        p=self.root/'claude-only/SKILL.md'
        p.write_text('---\nname: claude-only\nmetadata:\n  user-invocable: false\n---\nuser-invocable: false')
        self.assertIn('claude-only',[r['name'] for r in self.service.refresh()['skills']])
    def test_invalid_invocation_policy_never_publishes_partial_union(self):
        self.service.refresh();old=self.service.catalog.copy()
        p=self.root/'common/SKILL.md';p.write_text('---\nname: common\nuser-invocable: maybe\n---\n')
        with self.assertRaises(ValueError):self.service.refresh()
        self.assertEqual(self.service.catalog,old)
    def test_missing_optional_name_uses_directory(self):
        p=self.root/'common/SKILL.md';p.write_text('---\ndescription: example\n---\nbody')
        self.assertEqual(DirectoryProvider.name(p),'common')
    def test_unclosed_header_is_rejected(self):
        p=self.root/'common/SKILL.md';p.write_text('---\nname: common\nbody')
        with self.assertRaises(ValueError):DirectoryProvider.name(p)
    def test_quoted_name_and_missing_directory(self):
        p=self.root/'common/SKILL.md';p.write_text('---\nname: "common"\n---\n')
        self.assertEqual(DirectoryProvider.name(p),'common')
        self.assertEqual(DirectoryProvider(self.home/'missing').refresh()['skills'],[])

if __name__=='__main__':unittest.main()
