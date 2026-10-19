#!/usr/bin/env python3
"""Independent decoded-pixel proof for coordinate-color-fixture.swift only.

Uses ffmpeg and Pillow. This measures authored references, not arbitrary apps.
All journals and decoded images stay in the supplied private evidence directory.
"""
import argparse
import json
import statistics
import subprocess
from pathlib import Path
from PIL import Image


def verify(recording, delivered, output):
    output.mkdir(parents=True, exist_ok=True)
    rows = [json.loads(row) for row in (recording / 'source.jsonl').read_text().splitlines()]
    clicks = [json.loads(row) for row in delivered.read_text().splitlines()]
    assert clicks, 'No app-delivered clicks: provider readiness is unqualified'
    encoded = [row for row in rows if row['kind'] == 'encoded_frame' and row['accepted']]
    sources = {row['source_frame']: row for row in rows if row['kind'] == 'source_frame'}
    geometries = {row['segment']: row['geometry'] for row in rows if row['kind'] == 'geometry'}
    inputs = [row for row in rows if row['kind'] == 'input_event' and row.get('type') == 1]

    def decode(index, name):
        path = output / (name + '.png')
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(recording / 'video.mp4'),
                        '-vf', f'select=eq(n\\,{index})', '-frames:v', '1', '-y', str(path)],
                       check=True, capture_output=True)
        return Image.open(path).convert('RGB')

    points = []
    for index, click in enumerate(clicks):
        matches = [row for row in inputs if row['event_number'] == click['event_number']
                   and row['event_timestamp_ns'] == click['event_timestamp_ns']]
        assert len(matches) == 1, 'Delivered event is missing or has an ambiguous journal match'
        event = matches[0]
        raw = [event['raw_position']['x'], event['raw_position']['y']]
        assert raw == click['expected_quartz'] == click['cg_position'], 'Raw/app coordinate mismatch'
        packet = next(row for row in encoded if int(row['host_ns']) >= int(click['host_ns']) + 100_000_000)
        if index + 1 < len(clicks):
            assert int(packet['host_ns']) < int(clicks[index + 1]['host_ns']), 'Next click replaced this marker'
        segment = sources[packet['source_frame']]['geometry_segment']
        affine = geometries[segment]['desktop_points_to_source_pixels']
        x = affine[0] * raw[0] + affine[2] * raw[1] + affine[4]
        y = affine[1] * raw[0] + affine[3] * raw[1] + affine[5]
        image = decode(packet['encoded_sequence'], f'click-{index}')
        pixels = []
        for yy in range(max(0, int(y) - 12), min(image.height, int(y) + 13)):
            for xx in range(max(0, int(x) - 12), min(image.width, int(x) + 13)):
                red, green, blue = image.getpixel((xx, yy))
                if red > 180 and green > 180 and blue < 100:
                    pixels.append((xx + 0.5, yy + 0.5))
        assert len(pixels) > 20, 'Authored yellow marker not visible at the predicted position'
        center = [statistics.mean(point[axis] for point in pixels) for axis in range(2)]
        error = max(abs(center[0] - x), abs(center[1] - y))
        assert error <= 1, 'Authored marker exceeds one source-pixel alignment tolerance'
        points.append({'event_number': click['event_number'], 'scale': click['scale'],
                       'geometry_segment': segment, 'raw_matches_app_coordinates': True,
                       'raw_timestamp_matches_delivered': True, 'expected_source_point': [x, y],
                       'decoded_marker_center': center, 'marker_center_max_error_pixels': error,
                       'marker_pixels': len(pixels), 'sample_packet': packet['encoded_sequence'],
                       'receipt_minus_raw_event_ns': str(int(event['received_host_ns']) - int(event['event_timestamp_ns']))})

    references = [('red', [255, 0, 0]), ('green', [0, 255, 0]), ('blue', [0, 0, 255]),
                  ('gray', [128, 128, 128]), ('white', [255, 255, 255]), ('black', [0, 0, 0])]
    colors = []
    for segment in geometries:
        packets = [row for row in encoded if sources[row['source_frame']]['geometry_segment'] == segment]
        packet = packets[min(10, len(packets) - 1)]
        image = decode(packet['encoded_sequence'], f'colors-{segment}')
        assert image.size == (440, 312), 'This authored patch sampler requires the fixture at point resolution'
        samples = []
        for index, (name, reference) in enumerate(references):
            x, y = 80 + index % 3 * 140, int(32 + 52.5 + index // 3 * 85)
            pixels = list(image.crop((x - 4, y - 4, x + 5, y + 5)).getdata())
            rgb = [int(statistics.median(pixel[channel] for pixel in pixels)) for channel in range(3)]
            samples.append({'reference': name, 'declared_srgb_8bit': reference,
                            'decoded_rgb_8bit': rgb,
                            'max_channel_error': max(abs(a - b) for a, b in zip(reference, rgb))})
        colors.append({'geometry_segment': segment, 'scale_factor': geometries[segment]['scale_factor'], 'samples': samples})
    return {'schema': 'coordinate-color-qualification/v1', 'pointer_passed': True,
            'matched_clicks': len(points), 'pointer': points, 'colors': colors,
            'limits': ['Native CUA clicks only; physical cursor, other providers, scroll and drag remain unqualified',
                       'Provider screenshot coordinates are not assumed equal to delivered coordinates',
                       'RGB comparisons measure the current capture/decode path; no universal color fidelity claim']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--recording', required=True, type=Path)
    parser.add_argument('--delivered', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    proof = verify(args.recording, args.delivered, args.output)
    (args.output / 'coordinate-color-proof.json').write_text(json.dumps(proof, indent=2))
    print(json.dumps({'matched_clicks': proof['matched_clicks'], 'max_marker_error_pixels':
                      max(row['marker_center_max_error_pixels'] for row in proof['pointer']),
                      'max_declared_color_channel_error': max(row['max_channel_error'] for group in proof['colors'] for row in group['samples'])}))
