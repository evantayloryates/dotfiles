#!/usr/bin/env python3
"""Measure native frame metadata against an independent child-placement oracle.

No map override: union-derived maps are experimental, using fixture knowledge
that the production source does not possess. Bulk packet/pixel rows stay on disk.
"""
import argparse
import bisect
from collections import defaultdict
import importlib.util
import json
import math
from pathlib import Path
import subprocess
import threading
from PIL import Image, ImageChops


def marker(image, channel):
    bands = image.split()
    mask = bands[channel].point(lambda v: 255 if v > 180 else 0)
    for index in range(3):
        if index != channel:
            mask = ImageChops.multiply(mask, bands[index].point(lambda v: 255 if v < 65 else 0))
    box = mask.getbbox()
    return None if box is None else [(box[0]+box[2])/2, (box[1]+box[3])/2]


def run(record_path, oracle_path, output, app_backup=False):
    if output.exists() or output.with_suffix('.timeline.json').exists() or output.with_suffix('.decode-stderr.txt').exists():
        raise ValueError('Fresh output required')
    record = json.loads(record_path.read_text())
    oracle = [json.loads(line) for line in oracle_path.read_text().splitlines() if line]
    phases = [r for r in oracle if r['kind'] == 'phase']
    expected = ['baseline', 'right', 'left', 'above', 'below', 'corner', 'restored']
    if [r['phase'] for r in phases] != expected or not any(r['kind'] == 'finished' for r in oracle):
        raise ValueError('One complete independently logged five-direction cycle required')
    starts = [int(r['host_ns']) for r in phases]
    if starts != sorted(set(starts)):
        raise ValueError('Strict phase order required')
    if any(r.get('clock_domain') != 'CLOCK_UPTIME_RAW' for r in phases):
        raise ValueError('Oracle host clock domain must be explicit')
    resolved = record['resolved']
    if record['state'] != 'done':
        raise ValueError('Completed source required')
    inclusions = resolved.get('capture_options', {}).get('resolved_inclusions', [])
    if app_backup:
        if resolved.get('kind') != 'rect' or len(inclusions) != 1 or any(r['pid'] != inclusions[0].get('pid') for r in phases):
            raise ValueError('Exact owned app-only fixed crop required')
    elif resolved.get('kind') != 'window' or resolved.get('window', {}).get('window_id') != phases[0]['window_id'] or any(r['pid'] != resolved['window']['pid'] for r in phases):
        raise ValueError('Completed source must match owned oracle')
    if resolved['capture_options'].get('include_child_windows_effective') is not True:
        raise ValueError('Actual child-enabled source required')
    spec = importlib.util.spec_from_file_location('journal', Path(__file__).with_name('verify-journal.py'))
    journal = importlib.util.module_from_spec(spec); spec.loader.exec_module(journal)
    proof, sources, geometries, encoded = journal.verify(Path(record['source_packet']['path']), Path(record['video']['path']))
    if not proof['passed'] or proof['journal_lost_rows']:
        raise ValueError('Exact complete mux/journal correspondence required')
    sizes = {tuple(geometries[sources[r['source_frame']]['geometry_segment']]['geometry']['source_pixels']) for r in encoded}
    if len(sizes) != 1:
        raise ValueError('One measured canvas required')
    width, height = sizes.pop(); size = width*height*3
    if not 0 < size <= 16*1024*1024:
        raise ValueError('Bounded decoder canvas required')
    stats = defaultdict(lambda: {'packets': 0, 'parent_present': 0, 'child_present': 0, 'raw_parent_max_error_px': 0,
        'oracle_union_parent_max_error_px': 0, 'oracle_union_child_max_error_px': 0, 'missing_expected_markers': 0,
        'bounding_equals_content': 0, 'unexpected_child_markers': 0, 'scales': set(), 'geometry_segments': set()})
    timeline = []
    with output.with_suffix('.decode-stderr.txt').open('wb') as stderr:
        proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', record['video']['path'], '-pix_fmt', 'rgb24',
            '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE, stderr=stderr)
        deadline = threading.Timer(60, proc.kill); deadline.start()
        try:
            for index, packet in enumerate(encoded):
                pixels = proc.stdout.read(size)
                if len(pixels) != size:
                    raise ValueError('Decoded count differs from actual packet count')
                source = sources[packet['source_frame']]
                # Held packets refer to original source content, never current state.
                host = int(source['pts_host_ns'])
                phase_index = bisect.bisect_right(starts, host)-1
                if phase_index < 0 or host-starts[phase_index] < 250_000_000 or (phase_index+1 < len(starts) and starts[phase_index+1]-host < 250_000_000):
                    continue
                row = phases[phase_index]; phase = row['phase']; g = geometries[source['geometry_segment']]['geometry']
                matrix = g['desktop_points_to_source_pixels']; a,b,c,d,tx,ty = matrix
                if not all(math.isfinite(v) for v in matrix) or a <= 0 or a != d or b or c:
                    raise ValueError('Finite isotropic candidate required')
                image = Image.frombytes('RGB', (width,height), pixels)
                base = row['base']; child = row['child']
                union = {'x': min(base['x'], child['x']) if child else base['x'], 'y': min(base['y'], child['y']) if child else base['y']}
                # The known union origin is an independent fixture-only hypothesis.
                utx = tx if app_backup else g['content_points']['x']*g['scale_factor']-union['x']*a
                uty = ty if app_backup else g['content_points']['y']*g['scale_factor']-union['y']*d
                checks = {}
                for name, owner, channel, bar in [('parent',base,0,row['base_titlebar_points']), ('child',child,1,0)]:
                    observed = marker(image,channel)
                    center = [owner['x']+40,owner['y']+bar+96] if owner else None
                    raw_error = max(abs(observed[j]-[center[0]*a+tx,center[1]*d+ty][j]) for j in range(2)) if observed and center else None
                    union_error = max(abs(observed[j]-[center[0]*a+utx,center[1]*d+uty][j]) for j in range(2)) if observed and center else None
                    checks[name] = {'observed_center':observed,'raw_error_px':raw_error,'oracle_union_error_px':union_error}
                s = stats[phase];s['packets']+=1;s['scales'].add(a);s['geometry_segments'].add(source['geometry_segment'])
                if g.get('bounding_points') == g.get('content_points'): s['bounding_equals_content']+=1
                for name in ['parent','child']:
                    v=checks[name]
                    if v['observed_center']:s[name+'_present']+=1
                    if name=='child' and not child and v['observed_center']:s['unexpected_child_markers']+=1
                    if name=='parent' or child:
                        if v['oracle_union_error_px'] is None:s['missing_expected_markers']+=1
                        else:s['oracle_union_'+name+'_max_error_px']=max(s['oracle_union_'+name+'_max_error_px'],v['oracle_union_error_px'])
                    if name=='parent' and v['raw_error_px'] is not None:s['raw_parent_max_error_px']=max(s['raw_parent_max_error_px'],v['raw_error_px'])
                timeline.append({'frame':index,'source_frame':packet['source_frame'],'source_host_ns':str(host),'phase':phase,
                    'held':packet.get('held'),'geometry_segment':source['geometry_segment'],'markers':checks})
                if s['packets']==1:image.save(output.with_name(output.stem+'-'+phase+'.png'))
            if proc.stdout.read(1):raise ValueError('Extra decoded data')
            if proc.wait(timeout=10):raise ValueError('Decoder failed')
        finally:
            deadline.cancel();proc.stdout.close()
            if proc.poll() is None:proc.kill();proc.wait(timeout=10)
    for s in stats.values():
        s['scales']=sorted(s['scales']);s['geometry_segments']=sorted(s['geometry_segments'])
    if app_backup:
        for s in stats.values():
            for name in ['parent','child']:
                s['declared_affine_'+name+'_max_error_px']=s.pop('oracle_union_'+name+'_max_error_px')
    result={'schema':'five-direction-origin-metadata-qa/v1','reference_mode':'app_fixed_crop_declared_affine' if app_backup else 'independent_authored_union_experiment','source_journal':proof,'phases':dict(stats),
        'all_phases_observed':set(stats)==set(expected),'minimum_phase_samples':min((s['packets'] for s in stats.values()),default=0),
        'marker_reference_check_pass':set(stats)==set(expected) and all(s['packets']>=20 and s['missing_expected_markers']==0 and s['unexpected_child_markers']==0 and
            s[('declared_affine_' if app_backup else 'oracle_union_')+'parent_max_error_px']<=1.25 and s[('declared_affine_' if app_backup else 'oracle_union_')+'child_max_error_px']<=1.25 for s in stats.values()),
        'raw_affine_fails_any_observed_parent':any(s['raw_parent_max_error_px']>1.25 for s in stats.values()),
        'production_map_changed':False,'boundary_margin_ns':'250000000',
        'limits':['Known app union is independent oracle knowledge, unavailable to production from these rows',
            'Authored no-shadow NSPanel cases only; not real app menu/shape/alpha or general recovery proof',
            'Every decoded packet inspected; stable phases keyed by referenced source PTS, not held packet time',
            'Geometry containment/marker centers do not verify all rendered content']}
    output.write_text(json.dumps(result,indent=2)+'\n');output.with_suffix('.timeline.json').write_text(json.dumps(timeline))
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--recording',type=Path,required=True)
    parser.add_argument('--oracle',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--app-backup',action='store_true',help='Verify the owned app-only crop using its actual declared affine, without an oracle union map')
    args=parser.parse_args();print(json.dumps(run(args.recording,args.oracle,args.output,args.app_backup)))
