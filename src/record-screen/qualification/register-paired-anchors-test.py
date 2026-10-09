#!/usr/bin/env python3
"""Offline registration acceptance and refusal boundaries; authored pixels only."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image
import numpy as np

SPEC=importlib.util.spec_from_file_location('anchors',Path(__file__).with_name('register-paired-anchors.py'))
REG=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(REG)

class RegistrationTests(unittest.TestCase):
    def setUp(self):
        rng=np.random.default_rng(6021)
        self.backup=Image.fromarray(rng.integers(0,256,(150,220,3),dtype=np.uint8))
        self.primary=Image.new('RGB',(400,250));self.primary.paste(self.backup,(40,30))
        self.anchors=[dict(id='first',x=20,y=20,w=32,h=32),dict(id='second',x=170,y=90,w=40,h=36)]
    def run_candidate(self,**kwargs):
        return REG.register(kwargs.get('primary',self.primary),kwargs.get('backup',self.backup),kwargs.get('scale',1),kwargs.get('affine',[1,0,0,1,0,0]),kwargs.get('anchors',self.anchors))
    def refused(self,result,reason):
        self.assertFalse(result['candidate_transform_available']);self.assertIsNone(result['candidate_desktop_to_primary_pixels']);self.assertIn(reason,result['reasons'])
    def test_translation_recovers_held_out_point(self):
        r=self.run_candidate();self.assertTrue(r['candidate_transform_available']);self.assertEqual(r['candidate_desktop_to_primary_pixels'],[1,0,0,1,40.0,30.0])
        # This third point was excluded from either anchor; its original pixel survives.
        self.assertEqual(self.primary.getpixel((150,100)),self.backup.getpixel((110,70)))
        self.assertFalse(r['production_source_map_changed'])
    def test_repeated_scene_ambiguous(self):
        p=Image.new('RGB',(800,300));p.paste(self.backup,(20,20));p.paste(self.backup,(480,100))
        self.refused(self.run_candidate(primary=p),'anchor_match_ambiguous')
    def test_inconsistent_scene_translation(self):
        p=self.primary.copy();a=self.anchors[1];box=(a['x'],a['y'],a['x']+a['w'],a['y']+a['h'])
        p.paste((0,0,0),(210,120,250,156));p.paste(self.backup.crop(box),(222,120))
        self.refused(self.run_candidate(primary=p),'anchors_disagree')
    def test_flat_anchor_refuses(self):
        self.refused(self.run_candidate(backup=Image.new('RGB',self.backup.size,'white')),'anchor_unavailable')
    def test_missing_second_anchor_refuses(self):
        p=Image.new('RGB',self.primary.size);a=self.anchors[0];p.paste(self.backup.crop((20,20,52,52)),(60,50))
        self.refused(self.run_candidate(primary=p),'anchor_match_weak')
    def test_clipped_backup_refuses(self):
        a=copy.deepcopy(self.anchors);a[1]['x']=205
        self.refused(self.run_candidate(anchors=a),'anchor_unavailable')
    def test_wrong_scale_refuses(self):
        self.refused(self.run_candidate(scale=1.2),'anchor_match_weak')
    def test_dependent_overlapping_anchors_refuse(self):
        a=[dict(id='a',x=10,y=10,w=110,h=32),dict(id='b',x=90,y=10,w=110,h=32)]
        self.refused(self.run_candidate(anchors=a),'anchors_overlap')
    def test_duplicate_id_refuses(self):
        a=copy.deepcopy(self.anchors);a[1]['id']='first';self.refused(self.run_candidate(anchors=a),'anchor_ids_duplicate')
    def test_oversize_template_checked_before_allocation(self):
        with patch.object(Image.Image,'transform',side_effect=AssertionError('must not allocate')):
            r=self.run_candidate(scale=8)
        self.refused(r,'anchor_unavailable')
    def test_invalid_numbers_and_shapes(self):
        for kwargs in [dict(scale=True),dict(scale=10**400),dict(scale=float('nan')),dict(affine=[1,0,0,1,0,True]),dict(affine=[1e-12,0,0,1e-12,0,0]),dict(anchors='wrong'),dict(anchors=[None,None])]:
            with self.subTest(kwargs=kwargs),self.assertRaises(ValueError):self.run_candidate(**kwargs)
    def test_search_budget_checked_before_array(self):
        with patch.object(REG,'gray',side_effect=AssertionError('must not allocate')),self.assertRaises(ValueError):
            self.run_candidate(primary=Image.new('RGB',(1100,1000)))
    def test_fft_budget_refuses(self):
        # Search area fits, but elongated convolution would need >2M FFT cells.
        r=REG.match(np.zeros((100,9000),dtype=np.float32),np.arange(512*32,dtype=np.float32).reshape(32,512))
        self.assertFalse(r['available']);self.assertEqual(r['reason'],'fft_budget')
    def test_cli_fresh_output_and_symlink_refusal(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);p=root/'p.png';b=root/'b.png';self.primary.save(p);self.backup.save(b)
            config=root/'config.json';config.write_text(json.dumps(dict(primary_image=str(p),backup_image=str(b),primary_scale=1,backup_affine=[1,0,0,1,0,0],anchors=self.anchors)))
            output=root/'result.json';cmd=[sys.executable,str(Path(REG.__file__)),str(config),'--output',str(output)]
            good=subprocess.run(cmd,capture_output=True,timeout=15);self.assertEqual(good.returncode,0,good.stderr)
            original=output.read_bytes();again=subprocess.run(cmd,capture_output=True,timeout=15);self.assertNotEqual(again.returncode,0);self.assertEqual(output.read_bytes(),original)
            linked=root/'linked.json';linked.symlink_to(config);refusal=subprocess.run([*cmd[:2],str(linked),'--output',str(root/'new.json')],capture_output=True,timeout=15)
            self.assertNotEqual(refusal.returncode,0);self.assertFalse((root/'new.json').exists())
    def test_image_symlink_refusal(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'p.png';self.primary.save(p);q=Path(folder)/'q.png';q.symlink_to(p)
            with self.assertRaises(OSError):REG.bounded_image(q)
    def test_oversized_config_refuses_before_image_read(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);config=root/'large.json';config.write_text(' '*65537)
            run=subprocess.run([sys.executable,str(Path(REG.__file__)),str(config),'--output',str(root/'result.json')],capture_output=True,timeout=15)
            self.assertNotEqual(run.returncode,0);self.assertIn(b'bounded regular config',run.stderr);self.assertFalse((root/'result.json').exists())

if __name__=='__main__':unittest.main(verbosity=2)
