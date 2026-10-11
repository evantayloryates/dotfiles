#!/usr/bin/env python3
"""Independent packet/pixel proof for the authored uniform-grey VFR fixture.

Decode in software with two threads. Never validates arbitrary app footage by
appearance or uses source writer submissions as actual muxed coverage.
"""
import argparse
import bisect
import json
import statistics
import subprocess
from fractions import Fraction
from pathlib import Path


def probe(path):
    return json.loads(subprocess.check_output([
        '/opt/homebrew/bin/ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_packets', '-show_streams', '-show_entries',
        'stream=width,height,time_base:packet=pts,duration', '-of', 'json', str(path)
    ], timeout=30))


def means(path, width, height):
    raw = subprocess.check_output([
        '/opt/homebrew/bin/ffmpeg', '-v', 'error', '-nostdin', '-threads', '2',
        '-i', str(path), '-map', '0:v:0', '-fps_mode', 'passthrough',
        '-pix_fmt', 'gray', '-f', 'rawvideo', '-'
    ], timeout=30)
    size = width * height
    assert len(raw) % size == 0
    return [statistics.mean(raw[i:i + size]) for i in range(0, len(raw), size)]


def verify(source, results):
    parent = probe(source)
    parent_stream = parent['streams'][0]
    parent_tb = Fraction(parent_stream['time_base'])
    packets = sorted(parent['packets'], key=lambda p: p['pts'])
    parent_pts = [p['pts'] for p in packets]
    parent_times = [p * parent_tb for p in parent_pts]
    parent_means = means(source, parent_stream['width'], parent_stream['height'])
    assert len(parent_means) == len(packets)
    proofs = []
    for result in results['exports']:
        manifest = json.loads(Path(result['derivative_source']['path']).read_text())
        child = probe(result['path'])
        stream = child['streams'][0]
        child_packets = sorted(child['packets'], key=lambda p: p['pts'])
        child_tb = Fraction(stream['time_base'])
        brightness = means(result['path'], stream['width'], stream['height'])
        rate = manifest['sampling']['fps']
        first = int(manifest['sampling']['first_parent_tick'])
        assert len(brightness) == len(child_packets) == len(manifest['frames'])
        errors = []
        padded = 0
        for i, (packet, row, actual_mean) in enumerate(zip(child_packets, manifest['frames'], brightness)):
            sample = Fraction(first + i, rate)
            index = max(0, bisect.bisect_right(parent_times, sample) - 1)
            assert int(row['parent_pts']) == parent_pts[index]
            assert row['parent_packet_index'] == index
            assert int(row['pts']) == packet['pts']
            assert int(row['duration']) == packet['duration']
            assert Fraction(int(row['nominal_parent_tick']), rate) == sample
            expected_padding = sample < parent_times[0]
            assert row['padded_before_first_source'] == expected_padding
            padded += int(expected_padding)
            # The fixture IDs are separated enough to identify actual held
            # content independently of the generated metadata.
            inferred = min(range(len(parent_means)), key=lambda k: abs(parent_means[k] - actual_mean))
            assert inferred == index, (result['path'], i, inferred, index)
            errors.append(abs(actual_mean - parent_means[index]))
            assert abs(Fraction(packet['pts']) * child_tb - Fraction(i, rate)) <= Fraction(11, 1000)
        assert max(errors) <= 3
        geometry = manifest['geometry']
        assert geometry['pixels'] == [stream['width'], stream['height']]
        assert geometry['parent_pixels_to_derivative_pixels'] == [stream['width'] / parent_stream['width'], 0, 0, stream['height'] / parent_stream['height'], 0, 0]
        assert Path(result['path']).stat().st_mode & 0o777 == 0o600
        assert Path(result['derivative_source']['path']).stat().st_mode & 0o777 == 0o600
        proofs.append({'path': result['path'], 'actual_packets': len(child_packets),
                       'pixel_matched_parent_packets': len(brightness), 'max_grey_error': max(errors),
                       'padded_before_first_source': padded, 'time_base': str(child_tb),
                       'limits': 'Authored uniform-grey source; software codec only; no live capture or GIF viewer scheduler proof'})
    return {'parent': str(source), 'parent_packet_pts': parent_pts,
            'proofs': proofs, 'matched_pixels': sum(p['actual_packets'] for p in proofs)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--results', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    proof = verify(args.source, json.loads(args.results.read_text()))
    args.output.write_text(json.dumps(proof, indent=2) + '\n')
    print(json.dumps({'output': str(args.output), 'matched_pixels': proof['matched_pixels'], 'exports': len(proof['proofs'])}))
