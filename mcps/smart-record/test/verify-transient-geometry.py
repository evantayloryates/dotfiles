#!/usr/bin/env python3
"""Actual source QA for the authored dynamic-transient fixture, not composition.

Checks every decoded parent marker against that packet's source geometry, and
child presence/absence in stable lifecycle intervals independently logged by
the fixture. The control must be independently captured with children disabled.
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path
import subprocess
import threading
from PIL import Image, ImageChops


def color_box(image, channel):
    bands = image.split()
    mask = bands[channel].point(lambda v: 255 if v > 180 else 0)
    for i in range(3):
        if i != channel:
            mask = ImageChops.multiply(mask, bands[i].point(lambda v: 255 if v < 65 else 0))
    return mask.getbbox(), mask.histogram()[255]


def verify(args):
    outputs = [args.output, args.output.with_suffix('.decode-stderr.txt'), args.output.with_suffix('.timeline.json')]
    outputs += [args.output.with_name(args.output.stem+'-'+phase+'.png') for phase in ['before', 'open', 'after']]
    if any(p.exists() for p in outputs):
        raise ValueError('Fresh output required; preserve earlier proof')
    record = json.loads(args.recording.read_text())
    oracle = [json.loads(line) for line in args.oracle.read_text().splitlines() if line]
    ready, opened, closed = [next(r for r in oracle if r['kind'] == k) for k in ['ready', 'opened', 'closed']]
    if [r['kind'] for r in oracle].count('opened') != 1 or [r['kind'] for r in oracle].count('closed') != 1:
        raise ValueError('One independently logged open/close cycle required')
    if not int(ready['host_ns']) < int(opened['host_ns']) < int(closed['host_ns']):
        raise ValueError('Ordered lifecycle required')
    if record['state'] != 'done' or record['target']['window_id'] != ready['window_id']:
        raise ValueError('Completed recording must target the authored anchor')
    expected_children = not args.expect_excluded
    if record['resolved']['capture_options']['include_child_windows_effective'] != expected_children:
        raise ValueError('Capture setting does not match the declared control')
    spec = importlib.util.spec_from_file_location('journal', Path(__file__).with_name('verify-journal.py'))
    journal = importlib.util.module_from_spec(spec); spec.loader.exec_module(journal)
    coverage, sources, geometries, encoded = journal.verify(Path(record['source_packet']['path']), Path(record['video']['path']))
    if not coverage['passed']:
        raise ValueError('Exact actual source/mux correspondence required')
    sizes = {tuple(geometries[sources[r['source_frame']]['geometry_segment']]['geometry']['source_pixels']) for r in encoded}
    if len(sizes) != 1:
        raise ValueError('One encoded canvas required for this fixture proof')
    width, height = sizes.pop(); frame_bytes = width * height * 3
    if not 0 < frame_bytes <= 16 * 1024 * 1024:
        raise ValueError('Authored decoder canvas exceeds the bounded frame contract')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    timeline, errors, used, phases = [], [], [], {'before': 0, 'open': 0, 'after': 0}
    epoch = int(record['source_packet']['epoch_host_ns'])
    with args.output.with_suffix('.decode-stderr.txt').open('wb') as stderr:
        process = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', record['video']['path'],
            '-pix_fmt', 'rgb24', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE, stderr=stderr)
        deadline = threading.Timer(30, process.kill); deadline.start()
        try:
            for index, packet in enumerate(encoded):
                data = process.stdout.read(frame_bytes)
                if len(data) != frame_bytes:
                    raise ValueError('Decoded frame count differs from exact mux packets')
                image = Image.frombytes('RGB', (width, height), data)
                segment = sources[packet['source_frame']]['geometry_segment']
                g = geometries[segment]['geometry']
                a,b,c,d,tx,ty = g['desktop_points_to_source_pixels']
                if not all(math.isfinite(v) for v in [a,b,c,d,tx,ty]) or a <= 0 or a != d or b or c:
                    raise ValueError('Finite positive uniform declared map required')
                if not used or used[-1] != segment:
                    used.append(segment)
                host = epoch + int(packet['relative_ns'])
                phase = None
                if host < int(opened['host_ns']) - 250_000_000: phase = 'before'
                elif int(opened['host_ns']) + 250_000_000 < host < int(closed['host_ns']) - 250_000_000: phase = 'open'
                elif host > int(closed['host_ns']) + 250_000_000: phase = 'after'
                if phase: phases[phase] += 1
                checks = {}
                for name, owner, marker, channel in [
                    ('parent', ready['base'], ready['base_marker_content'], 0),
                    ('child', opened['child'], opened['child_marker_content'], 1)]:
                    box, count = color_box(image, channel)
                    titlebar = ready['base_titlebar_points'] if name == 'parent' else 0
                    x,y,w,h = marker
                    center = [(owner['x']+x+w/2)*a+tx, (owner['y']+titlebar+y+h/2)*d+ty]
                    actual = [(box[0]+box[2])/2, (box[1]+box[3])/2] if box else None
                    error = max(abs(actual[i]-center[i]) for i in [0,1]) if actual else None
                    expected = name == 'parent' or (phase == 'open' and expected_children)
                    check_presence = name == 'parent' or phase is not None
                    passed = not check_presence or ((box is not None and error <= 1.25 and .70*w*h*a*d <= count <= 1.20*w*h*a*d) if expected else count == 0)
                    if not passed and len(errors) < 20:
                        errors.append({'frame': index, 'marker': name, 'phase': phase, 'error_px': error, 'pixels': count, 'expected': expected})
                    checks[name] = {'bbox': box, 'pixels': count, 'predicted_center': center, 'error_px': error, 'passed': passed}
                timeline.append({'index': index, 'source_frame': packet['source_frame'], 'geometry_segment': segment,
                    'host_ns': str(host), 'phase': phase, 'held': packet.get('held'), 'markers': checks})
                if phase and phases[phase] == 1:
                    image.save(args.output.with_name(args.output.stem+'-'+phase+'.png'))
            if process.stdout.read(1):
                raise ValueError('Extra decoded frames beyond exact mux packets')
            if process.wait(timeout=10) != 0:
                raise ValueError('Decoder failed; inspect retained stderr')
        finally:
            deadline.cancel()
            process.stdout.close()
            if process.poll() is None:
                process.kill(); process.wait(timeout=10)
    if any(n < 20 for n in phases.values()):
        errors.append({'coverage': 'Each stable phase must contain at least twenty actual packets', 'phases': phases})
    matrices = [geometries[s]['geometry']['desktop_points_to_source_pixels'] for s in used]
    if expected_children and (len(matrices) != 3 or matrices[0] != matrices[-1] or matrices[0] == matrices[1]):
        errors.append({'geometry': 'Included-child source must show expansion and restoration', 'matrices': matrices})
    if not expected_children and (len(matrices) != 1 or any(t['markers']['child']['pixels'] for t in timeline)):
        errors.append({'geometry': 'Excluded control must stay fixed and omit child pixels'})
    maximum = max((t['markers']['parent']['error_px'] for t in timeline if t['markers']['parent']['error_px'] is not None), default=None)
    summary = {'schema': 'authored-dynamic-transient-geometry-proof/v1', 'passed': not errors, 'errors': errors,
        'recording_id': record['recording_id'], 'include_children': expected_children, 'actual_mux': coverage,
        'geometry_sequence': used, 'matrices': matrices, 'phase_samples': phases, 'parent_max_error_px': maximum,
        'child_max_error_px': max((t['markers']['child']['error_px'] for t in timeline if t['phase'] == 'open' and t['markers']['child']['error_px'] is not None), default=None),
        'limits': ['Authored attached NSPanel and colored source markers only; not universal context menus or semantic ownership',
            'Every decoded parent marker uses its encoded-to-source geometry; stable child lifecycle uses quarter-second margins',
            'No physical display latency, input attribution, rendering/composition or shared-host capacity claim']}
    args.output.with_suffix('.timeline.json').write_text(json.dumps(timeline)+'\n')
    args.output.write_text(json.dumps(summary, indent=2)+'\n')
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['recording', 'oracle', 'output']: parser.add_argument('--'+name, type=Path, required=True)
    parser.add_argument('--expect-excluded', action='store_true')
    result = verify(parser.parse_args())
    print(json.dumps({k: result[k] for k in ['passed','errors','geometry_sequence','phase_samples','parent_max_error_px','child_max_error_px']}))
    raise SystemExit(0 if result['passed'] else 1)
