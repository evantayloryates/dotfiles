#!/usr/bin/env python3
"""Exact mux/source QA and authored motion-to-static coverage; no composition."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--recording', type=Path, required=True)
parser.add_argument('--motion-log', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
if args.output.exists():
    raise ValueError('Fresh output required; preserve prior proof')
spec = importlib.util.spec_from_file_location('journal', Path(__file__).with_name('verify-journal.py'))
journal = importlib.util.module_from_spec(spec); spec.loader.exec_module(journal)
record = json.loads(args.recording.read_text())
proof, sources, geometries, encoded = journal.verify(Path(record['source_packet']['path']), Path(record['video']['path']))
if not proof['passed'] or record['state'] != 'done':
    raise ValueError('Successful actual mux/source correspondence is required')
used = {sources[row['source_frame']]['geometry_segment'] for row in encoded}
if any(geometries[k]['geometry']['source_pixels'] != [1000, 732] or
       geometries[k]['geometry']['desktop_points_to_source_pixels'] != [1, 0, 0, 1, -120, -110] for k in used):
    raise ValueError('Authored point-resolution counter map required')
events = [json.loads(line) for line in args.motion_log.read_text().splitlines() if line]
starts = [r for r in events if r['kind'] == 'motion_start']
if len(starts) != 1:
    raise ValueError('One independently logged motion start required')
begin = int(starts[0]['host_ns'])
stops = [r for r in events if r['kind'] == 'motion_stop' and int(r['host_ns']) > begin]
if not stops:
    raise ValueError('Independently logged motion stop required')
end = int(stops[0]['host_ns']); expected_static = stops[0]['tick'] % 4096
epoch = int(record['source_packet']['epoch_host_ns'])
decoded = subprocess.run(['ffmpeg', '-v', 'error', '-i', record['video']['path'],
    '-vf', 'crop=288:20:24:116,scale=12:1:flags=neighbor', '-pix_fmt', 'gray',
    '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], capture_output=True, check=True, timeout=60)
args.output.with_suffix('.decode-stderr.txt').write_bytes(decoded.stderr)
if len(decoded.stdout) != len(encoded) * 12:
    raise ValueError('Actual decoded counter count differs from muxed source packets')
timeline = []
for i, row in enumerate(encoded):
    cells = decoded.stdout[i*12:(i+1)*12]
    tick = sum(1 << bit for bit, value in enumerate(cells) if value > 128) if all(v < 55 or v > 205 for v in cells) else None
    host = epoch + int(row['relative_ns'])
    timeline.append({'index': i, 'host_ns': str(host), 'tick': tick, 'held': row.get('held')})
moving = [r for r in timeline if begin + 250_000_000 <= int(r['host_ns']) <= end - 250_000_000]
static = [r for r in timeline if int(r['host_ns']) >= end + 250_000_000]
changes = sum(a['tick'] != b['tick'] for a,b in zip(moving,moving[1:]))
errors = []
if any(r['tick'] is None for r in timeline): errors.append('Authored counter unreadable in actual footage')
if len(moving) < 1000 or changes < .85 * (len(moving)-1): errors.append('Motion phase did not establish sustained changing pixels')
if len(static) < 100 or any(r['tick'] != expected_static for r in static): errors.append('Static phase differs from independently logged stopped counter')
duration = float(record['duration_s']) if 'duration_s' in record else (int(timeline[-1]['host_ns'])-epoch)/1e9
if duration < 100: errors.append('Longer take coverage shorter than requested qualification')
summary = {'schema':'authored-motion-duration-proof/v1','passed':not errors,'errors':errors,
    'recording_id':record['recording_id'],'muxed_source_proof':proof,'duration_observed_s':duration,
    'motion_start_ns':str(begin),'motion_stop_ns':str(end),'moving_samples':len(moving),
    'changing_transitions':changes,'static_samples':len(static),'static_tick':expected_static,
    'moving_span_s':(int(moving[-1]['host_ns'])-int(moving[0]['host_ns']))/1e9 if moving else None,
    'static_span_s':(int(static[-1]['host_ns'])-int(static[0]['host_ns']))/1e9 if static else None,
    'held_semantics':'Inspect journal reasons separately; unchanged pixels from a fresh source are not labeled held-buffer padding',
    'limits':['Authored decoded counter and fixture lifecycle only; not physical presentation latency',
              'Point-resolution single-window duration; not paired rescue, thermal capacity or production P80',
              'Quarter-second boundary margins; no inferred event-provider clock equivalence']}
args.output.with_suffix('.timeline.json').write_text(json.dumps(timeline)+'\n')
args.output.write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:summary[k] for k in ['passed','errors','duration_observed_s','moving_samples','changing_transitions','static_samples','moving_span_s','static_span_s']}))
raise SystemExit(0 if summary['passed'] else 1)
