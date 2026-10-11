#!/usr/bin/env python3
"""Check an authored popup crop through the recorder's declared spatial map.

Source QA only: not a compositor, semantic detector or ownership classifier.
The cropped reference and catalog ID must be independently observed by the caller.
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path
import subprocess
from PIL import Image


def verify(args):
    if args.ignore_top_reference_pixels < 0:
        raise ValueError('ignored reference extent must be nonnegative')
    record = json.loads(args.recording.read_text())
    catalog = json.loads(args.catalog.read_text())
    if catalog['truncated'] or catalog['anchor_window_id'] != record['target']['window_id']:
        raise ValueError('unbounded or mismatched anchor catalog')
    popup = next(v for v in catalog['candidates'] if v['window_id'] == args.popup_window)
    if not popup['same_pid'] or popup['pid'] != catalog['anchor_pid']:
        raise ValueError('this authored proof requires the observed target-app candidate')
    journal, video = Path(record['source_packet']['path']), Path(record['video']['path'])
    spec = importlib.util.spec_from_file_location('journal', Path(__file__).with_name('verify-journal.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    coverage = module.verify(journal, video)[0]
    if not coverage['passed'] or not 0 <= args.frame_index < coverage['actual_muxed_packets']:
        raise ValueError('actual source/mux coverage or requested frame is unavailable')
    geometries = [json.loads(line)['geometry'] for line in journal.read_text().splitlines()
                  if json.loads(line).get('kind') == 'geometry']
    if len(geometries) != 1:
        raise ValueError('single-geometry fixture proof only')
    geometry = geometries[0]
    a,b,c,d,tx,ty = geometry['desktop_points_to_source_pixels']
    if not all(math.isfinite(v) for v in [a,b,c,d,tx,ty,args.reference_scale]) or a <= 0 or a != d or b != 0 or c != 0 or args.reference_scale <= 0:
        raise ValueError('positive uniform recorder/reference map required')
    box = popup['frame']
    x,y,w,h = box['x']*a+tx, box['y']*d+ty, box['w']*a, box['h']*d
    crop = tuple(round(v) for v in [x,y,x+w,y+h])
    width,height = geometry['source_pixels']
    if crop[0] < 0 or crop[1] < 0 or crop[2] > width or crop[3] > height or crop[2]-crop[0] < 8 or crop[3]-crop[1] < 8:
        raise ValueError('popup region is clipped or outside encoded canvas')
    reference = Image.open(args.reference_menu).convert('RGB')
    if reference.size != (round(box['w']*args.reference_scale),round(box['h']*args.reference_scale)):
        raise ValueError('reference dimensions differ from the supplied popup')
    preview, menu = args.output.with_suffix('.frame.png'), args.output.with_suffix('.menu.png')
    if any(p.exists() for p in [args.output,preview,menu]):
        raise ValueError('use a fresh proof name; preserve earlier evidence')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run(['ffmpeg','-v','error','-i',str(video),'-vf',f'select=eq(n\\,{args.frame_index})',
                    '-frames:v','1',str(preview)],check=True,capture_output=True,timeout=30)
    actual = Image.open(preview).convert('RGB').crop(crop)
    actual.save(menu)
    # Apply the saved map including fractional origin. No fitted shift/search.
    s = args.reference_scale
    expected = reference.transform(actual.size,Image.Transform.AFFINE,
        (s/a,0,s*(crop[0]-x)/a,0,s/d,s*(crop[1]-y)/d),resample=Image.Resampling.BICUBIC)
    top = max(4,round(args.ignore_top_reference_pixels*a/s))
    if top < 0 or top >= actual.height-8:
        raise ValueError('invalid authored glyph comparison bounds')
    roi = (4,top,actual.width-4,actual.height-4)
    expected_bits = [min(v)>165 for v in expected.crop(roi).getdata()]
    actual_bits = [min(v)>165 for v in actual.crop(roi).getdata()]
    union = sum(e or v for e,v in zip(expected_bits,actual_bits))
    iou = sum(e and v for e,v in zip(expected_bits,actual_bits))/union if union else 0
    passed = sum(expected_bits)>100 and (iou <= .20 if args.expect_absent else iou >= .85)
    result = {'schema':'authored-popup-affine-proof/v1','passed':passed,'expect_absent':args.expect_absent,
      'recording_id':record['recording_id'],'popup_candidate':popup,'source_geometry':geometry,
      'muxed_packets':coverage['actual_muxed_packets'],'decoded_frame':args.frame_index,
      'predicted_source_rect':[x,y,w,h],'decoded_crop':crop,'glyph_iou':iou,
      'reference_glyph_pixels':sum(expected_bits),'menu_crop':str(menu),
      'reference_resampling':'declared recorder affine; bicubic; no fitted translation',
      'ignored_top_reference_pixels':args.ignore_top_reference_pixels,
      'limits':['Supplied authored candidate/reference; PID is not semantic parent ownership',
                'Single geometry and selected decoded frame; not arbitrary tracking or full-shot coverage',
                'Bright-on-dark fixture glyphs only; absence threshold is not a general menu detector']}
    args.output.write_text(json.dumps(result,indent=2)+'\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['recording','catalog','reference-menu','output']:
        parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--popup-window',type=int,required=True)
    parser.add_argument('--reference-scale',type=float,required=True)
    parser.add_argument('--frame-index',type=int,required=True)
    parser.add_argument('--ignore-top-reference-pixels',type=int,default=0)
    parser.add_argument('--expect-absent',action='store_true')
    result = verify(parser.parse_args())
    print(json.dumps({k:result[k] for k in ['passed','muxed_packets','glyph_iou','menu_crop']}))
    raise SystemExit(0 if result['passed'] else 1)
