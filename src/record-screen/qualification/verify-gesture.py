#!/usr/bin/env python3
"""Match the authored gesture fixture's app receipts, input rows and video.

No UI operations or input synthesis. Private journals and decoded frames stay
in the caller's output directory. Physical density and actor ownership are not
inferred. Run verify-journal.py separately for independent mux/source parity.
"""
import argparse
import json
import statistics
import subprocess
from pathlib import Path
from PIL import Image


def verify(recording, delivered, output, require_input=False):
    output.mkdir(parents=True, exist_ok=True)
    rows = [json.loads(s) for s in (recording / 'source.jsonl').read_text().splitlines()]
    encoded = [r for r in rows if r['kind'] == 'encoded_frame' and r['accepted']]
    assert encoded, 'No accepted encoded samples'
    epoch = int(next(r['epoch_host_ns'] for r in rows if r['kind'] == 'header'))
    end = max(int(r['host_ns']) for r in encoded)
    events = [r for r in map(json.loads, delivered.read_text().splitlines())
              if r['kind'] in ['down', 'drag', 'up', 'wheel']
              and epoch <= int(r['received_host_ns']) < end]
    assert {'down', 'drag', 'up', 'wheel'} <= {r['kind'] for r in events}, 'Incomplete app delivery'
    sources = {r['source_frame']: r for r in rows if r['kind'] == 'source_frame'}
    geometries = {r['segment']: r['geometry'] for r in rows if r['kind'] == 'geometry'}
    inputs = [r for r in rows if r['kind'] == 'input_event']
    matches = []
    for event in events:
        assert event['cg_position'] == event['expected_quartz'], 'App/CG position mismatch'
        found = [r for r in inputs if r['type'] == event['cg_type']
                 and r['event_timestamp_ns'] == event['event_timestamp_ns']]
        if not found and not require_input:
            continue
        assert len(found) == 1, 'Missing or ambiguous delivered-event input match'
        row = found[0]
        assert [row['raw_position']['x'], row['raw_position']['y']] == event['cg_position']
        if event['kind'] == 'wheel':
            expected = event['scroll']
            assert row['scroll'] == {'x': expected['cg_x'], 'y': expected['cg_y'],
                                    'phase': expected['cg_phase'],
                                    'momentum_phase': expected['cg_momentum_phase'],
                                    'continuous': bool(expected['cg_continuous'])}
        matches.append({'kind': event['kind'], 'raw_timestamp_and_position_match': True,
                        'recorder_receipt_minus_raw_ns': str(int(row['received_host_ns']) - int(row['event_timestamp_ns'])),
                        'app_receipt_minus_recorder_ns': str(int(event['received_host_ns']) - int(row['received_host_ns'])),
                        'relevance_reasons': row['relevance_reasons'],
                        'scope_certainty': row['scope_certainty'],
                        'action_ids': row['action_ids'], 'ownership': row['ownership']})
    pixels = []
    for kind in ['up', 'wheel']:
        event = next(r for r in reversed(events) if r['kind'] == kind)
        packet = next(r for r in encoded if int(r['host_ns']) >= int(event['received_host_ns']) + 100_000_000)
        if kind == 'up':
            assert not any(r['kind'] != 'wheel' and int(event['received_host_ns']) < int(r['received_host_ns'])
                           <= int(packet['host_ns']) for r in events), 'Later pointer replaced the marker'
            point = event['expected_quartz']
        else:
            wx, wy, _, _ = event['window_quartz_frame']
            # Authored canvas: content top=10, title=32, width=480.
            point = [wx + 10 + 480 - 22 + 6, wy + 32 + 10 + 20 + abs(event['scroll_total']) % 180 + 8]
        segment = sources[packet['source_frame']]['geometry_segment']
        m = geometries[segment]['desktop_points_to_source_pixels']
        expected = [m[0] * point[0] + m[2] * point[1] + m[4],
                    m[1] * point[0] + m[3] * point[1] + m[5]]
        path = output / f'{kind}-decoded.png'
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(recording / 'video.mp4'),
                        '-vf', f"select=eq(n\\,{packet['encoded_sequence']})",
                        '-frames:v', '1', '-y', str(path)], check=True, capture_output=True)
        image = Image.open(path).convert('RGB')
        points = []
        for y in range(max(0, int(expected[1]) - 14), min(image.height, int(expected[1]) + 15)):
            for x in range(max(0, int(expected[0]) - 14), min(image.width, int(expected[0]) + 15)):
                red, green, blue = image.getpixel((x, y))
                visible = (red > 180 and green > 180 and blue < 100) if kind == 'up' else (red < 100 and green > 180 and blue > 180)
                if visible:
                    points.append([x + .5, y + .5])
        assert len(points) > 20, 'Authored reference is missing at predicted position'
        center = [statistics.mean(p[axis] for p in points) for axis in range(2)]
        error = max(abs(a - b) for a, b in zip(expected, center))
        assert error <= 1, 'Authored reference exceeds one source-pixel tolerance'
        pixels.append({'kind': kind, 'encoded_sequence': packet['encoded_sequence'],
                       'geometry_segment': segment, 'expected_center': expected,
                       'decoded_center': center, 'max_error_pixels': error,
                       'reference_pixels': len(points), 'image_size': image.size})
    return {'schema': 'native-gesture-qualification/v1', 'pixels_passed': True,
            'delivered_events': len(events), 'matched_input_events': len(matches),
            'required_input': require_input, 'input': matches, 'pixels': pixels,
            'input_gaps': next(r for r in rows if r['kind'] == 'footer')['input_gaps_observed'],
            'limits': ['Authored fixture and CUA gestures only; physical event density and touchpad phases remain unqualified',
                       'App delivery and action brackets do not establish actor identity',
                       'Pixel checks cover drag endpoint and scroll stripe; no per-intermediate-sample latency claim']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recording', type=Path, required=True)
    parser.add_argument('--delivered', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--require-input', action='store_true')
    args = parser.parse_args()
    result = verify(args.recording, args.delivered, args.output, args.require_input)
    (args.output / 'gesture-proof.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({k: result[k] for k in ['pixels_passed', 'delivered_events', 'matched_input_events', 'required_input', 'input_gaps']}))
