#!/usr/bin/env python3
"""Qualify a supplied transient region against actual video and a scoped screenshot.

This is an authored-fixture spatial proof, not an automatic menu detector,
simultaneous-source recovery proof or a general compositing recipe.
"""
import argparse
from fractions import Fraction
import json
import math
from pathlib import Path
import subprocess

from PIL import Image
import importlib.util


def run(args):
    record = json.loads(args.recording.read_text())
    video = Path(record['video']['path'])
    journal = Path(record['source_packet']['path'])
    spec = importlib.util.spec_from_file_location('journal_verifier', Path(__file__).with_name('verify-journal.py'))
    verifier = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(verifier)
    proof = verifier.verify(journal, video)[0]
    if not proof['passed']:
        raise ValueError('actual muxed/source correspondence failed')
    geometries = [json.loads(line)['geometry'] for line in journal.read_text().splitlines()
                  if json.loads(line).get('kind') == 'geometry']
    if len(geometries) != 1:
        raise ValueError('this fixture proof requires one geometry segment')
    geometry = geometries[0]
    matrix = geometry['desktop_points_to_source_pixels']
    if not isinstance(matrix, list) or len(matrix) != 6 or not all(math.isfinite(x) for x in matrix):
        raise ValueError('missing finite geometry map')
    a, b, c, d, tx, ty = matrix
    if a <= 0 or a != d or b != 0 or c != 0:
        raise ValueError('this fixture proof requires an axis-aligned uniform map')
    x, y, w, h = args.region
    width, height = geometry['source_pixels']
    if x < 0 or y < 0 or w < 8 or h < 8 or x+w > width or y+h > height:
        raise ValueError('supplied region is outside the source')
    global_region = [(x-tx)/a, (y-ty)/a, w/a, h/a]
    ox, oy, ow, oh = args.original_frame
    if not all(math.isfinite(v) for v in args.original_frame) or ow <= 0 or oh <= 0:
        raise ValueError('invalid original frame')
    gx, gy, gw, gh = global_region
    intersection = max(0, min(gx+gw, ox+ow)-max(gx, ox))*max(0, min(gy+gh, oy+oh)-max(gy, oy))
    if gw*gh <= intersection:
        raise ValueError('region does not extend beyond the original frame')
    media = json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0',
        '-show_frames','-show_streams','-show_entries','frame=pts:stream=time_base','-of','json',str(video)], timeout=30))
    index = len(media['frames']) // 2
    pts_ns = Fraction(media['frames'][index]['pts'])*Fraction(media['streams'][0]['time_base'])*10**9
    args.output.parent.mkdir(parents=True, exist_ok=True)
    preview = args.output.with_suffix('.menu.png')
    if args.output.exists() or preview.exists():
        raise ValueError('use a new proof name; preserve prior evidence')
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(video),'-vf',
        f'select=eq(n\\,{index}),crop={w}:{h}:{x}:{y}','-frames:v','1',str(preview)],check=True,capture_output=True,timeout=30)
    reference = Image.open(args.reference).convert('RGB')
    metadata = json.loads(args.reference_metadata.read_text())
    crop = metadata['crop']; scale = metadata['scale']
    if scale != a:
        raise ValueError('reference/source pixel scales differ; do not silently resample')
    rx, ry = (gx-crop['x'])*scale, (gy-crop['y'])*scale
    if rx != int(rx) or ry != int(ry):
        raise ValueError('reference region falls between pixels')
    rx, ry = int(rx), int(ry)
    if rx < 0 or ry < 0 or rx+w > reference.width or ry+h > reference.height:
        raise ValueError('supplied region is outside the reference screenshot')
    # Trim borders/shadows. Supplied authored popup glyphs are bright on dark.
    pad = 4
    expected = [min(v)>165 for v in reference.crop((rx+pad,ry+pad,rx+w-pad,ry+h-pad)).getdata()]
    candidate = Image.open(preview).convert('RGB')
    actual = [min(v)>165 for v in candidate.crop((pad,pad,w-pad,h-pad)).getdata()]
    common = sum(v and u for v,u in zip(expected,actual))
    union = sum(v or u for v,u in zip(expected,actual))
    agreement = common/union if union else 0
    passed = sum(expected)>100 and agreement >= .90
    result = {'schema':'authored-overflow-spatial-proof/v1','passed':passed,
        'recording_id':record['recording_id'],'muxed_packets':proof['actual_muxed_packets'],
        'journal_lost_rows':proof['journal_lost_rows'],'decoded_frame':index,
        'video_relative_ns':str(pts_ns),'source_region_pixels':args.region,
        'global_region_points':global_region,'original_frame_points':args.original_frame,
        'region_area_outside_original_points_squared':gw*gh-intersection,
        'glyph_intersection_over_union':agreement,'reference_glyph_pixels':sum(expected),
        'menu_crop':str(preview),'source_geometry':geometry,
        'limits':['supplied authored region, not automatic semantic/menu segmentation',
                  'single geometry and equal pixel scale only',
                  'spatial agreement does not prove simultaneous scene coverage or latency',
                  'display source can contain unrelated content and lose the base to occlusion']}
    args.output.write_text(json.dumps(result,indent=2)+'\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recording',type=Path,required=True)
    parser.add_argument('--reference',type=Path,required=True)
    parser.add_argument('--reference-metadata',type=Path,required=True)
    parser.add_argument('--region',type=int,nargs=4,required=True,metavar=('X','Y','W','H'))
    parser.add_argument('--original-frame',type=float,nargs=4,required=True,metavar=('X','Y','W','H'))
    parser.add_argument('--output',type=Path,required=True)
    result = run(parser.parse_args())
    print(json.dumps({k:result[k] for k in ['passed','muxed_packets','glyph_intersection_over_union','menu_crop']}))
    raise SystemExit(0 if result['passed'] else 1)
