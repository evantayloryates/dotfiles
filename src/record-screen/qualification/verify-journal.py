#!/usr/bin/env python3
"""Compare a local source journal with actual muxed packets; no UI or capture.

Bulk rows remain on disk. Output is compact proof, never raw frame telemetry.
Requires ffprobe; optional authored-fixture pixel checks also need ffmpeg/Pillow.
"""
import argparse
import collections
import json
import subprocess
from fractions import Fraction
from pathlib import Path


def verify(journal, video):
    rows = [json.loads(line) for line in journal.open() if line.strip()]
    counts = collections.Counter(row['kind'] for row in rows)
    encoded = [row for row in rows if row['kind'] == 'encoded_frame' and row['accepted']]
    sources = {row['source_frame']: row for row in rows if row['kind'] == 'source_frame'}
    geometry = {row['segment']: row for row in rows if row['kind'] == 'geometry'}
    probe = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_packets',
        '-show_entries', 'stream=time_base,start_time,duration:packet=pts,dts,duration',
        '-of', 'json', str(video)], timeout=30))
    base = Fraction(probe['streams'][0]['time_base'])
    actual = [Fraction(packet['pts']) * base * 10**9 for packet in probe['packets']]
    delta = [value - int(row['relative_ns']) for value, row in zip(actual, encoded)]
    clock_delta = [int(row['display_host_ns']) - int(row['pts_host_ns'])
                   for row in sources.values() if 'display_host_ns' in row and row['pts_host_ns']]
    footer = rows[-1] if rows and rows[-1]['kind'] == 'footer' else None
    errors = []
    if len(actual) != len(encoded):
        errors.append('encoded decisions and muxed packet counts differ')
    if any(value != 0 for value in delta):
        errors.append('actual packet time differs from journal time')
    if any(row['source_frame'] not in sources for row in encoded):
        errors.append('encoded decision references missing source metadata')
    if any(row['geometry_segment'] not in geometry for row in sources.values()):
        errors.append('source frame references missing geometry')
    if not footer or not footer.get('complete'):
        errors.append('journal incomplete or missing footer')
    result = {'schema': 'source-journal-qualification/v1', 'passed': not errors, 'errors': errors,
              'rows_by_kind': dict(counts), 'encoded_decisions': len(encoded),
              'actual_muxed_packets': len(actual), 'actual_timebase': str(base),
              'muxed_minus_journal_ns': {'min': str(min(delta)), 'max': str(max(delta))} if delta else None,
              'display_minus_pts_ns': {'min': min(clock_delta), 'max': max(clock_delta)} if clock_delta else None,
              'journal_lost_rows': footer.get('rows_lost') if footer else None,
              'geometry_segments': len(geometry),
              'limits': ['Metadata equality does not prove physical presentation or action latency',
                         'Source callback completeness is not an OS source-drop measurement']}
    return result, sources, geometry, encoded


def fixture_pixels(video, sources, geometry, encoded, output):
    from PIL import Image
    proofs = []
    for segment, row in geometry.items():
        sample = next((e for e in encoded if e['source_frame'] >= row['first_source_frame'] + 6), None)
        if not sample:
            continue
        index = sample['encoded_sequence']
        frame = output.with_name(output.stem + f'-geometry-{segment}.png')
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(video), '-vf', f"select='eq(n,{index})'",
                        '-fps_mode', 'vfr', '-frames:v', '1', '-y', str(frame)], check=True, timeout=30)
        image = Image.open(frame).convert('RGB')
        candidates = [[], [], []]
        for y in range(image.height):
            for x in range(image.width):
                r, g, b = image.getpixel((x, y))
                if r > 150 and g < 100 and b < 100: candidates[0].append((x, y))
                if g > 150 and r < 100 and b < 100: candidates[1].append((x, y))
                if b > 150 and r < 100 and g < 100: candidates[2].append((x, y))
        def largest_component(points):
            remaining = set(points); largest = []
            while remaining:
                start = remaining.pop(); component = [start]; queue = [start]
                while queue:
                    x, y = queue.pop()
                    for neighbor in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
                        if neighbor in remaining:
                            remaining.remove(neighbor); queue.append(neighbor); component.append(neighbor)
                if len(component) > len(largest): largest = component
            return largest
        components = [largest_component(points) for points in candidates]
        color = max(range(3), key=lambda i: len(components[i]))
        points = components[color]
        if not points:
            proofs.append({'segment': segment, 'passed': False, 'error': 'authored marker absent'}); continue
        bounds = [min(x for x, y in points), min(y for x, y in points),
                  max(x for x, y in points) + 1, max(y for x, y in points) + 1]
        g = row['geometry']; screen = g['screen_points']; a, b, c, d, tx, ty = g['desktop_points_to_source_pixels']
        # Fixture's known marker: x=24..124, y=220..244 in content; 32pt titlebar.
        desktop = [screen['x'] + 24, screen['y'] + 252, screen['x'] + 124, screen['y'] + 276]
        expected = [a*desktop[0]+c*desktop[1]+tx, b*desktop[0]+d*desktop[1]+ty,
                    a*desktop[2]+c*desktop[3]+tx, b*desktop[2]+d*desktop[3]+ty]
        error = max(abs(x-y) for x, y in zip(bounds, expected))
        proofs.append({'segment': segment, 'encoded_sequence': index, 'marker': color,
                       'bounds': bounds, 'expected_bounds': expected, 'max_edge_error_px': error,
                       'passed': error <= 1.5, 'evidence_png': str(frame)})
    return proofs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--journal', type=Path, required=True)
    parser.add_argument('--video', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--authored-fixture-pixels', action='store_true')
    args = parser.parse_args()
    result, sources, geometry, encoded = verify(args.journal, args.video)
    if args.authored_fixture_pixels:
        result['fixture_pixel_proofs'] = fixture_pixels(args.video, sources, geometry, encoded, args.output)
        result['passed'] = result['passed'] and bool(result['fixture_pixel_proofs']) and all(p['passed'] for p in result['fixture_pixel_proofs'])
    args.output.write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
    raise SystemExit(0 if result['passed'] else 1)


if __name__ == '__main__':
    main()
