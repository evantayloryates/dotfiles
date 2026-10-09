#!/usr/bin/env python3
"""Exact mux/source QA and authored motion-to-static coverage; no composition."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
from collections import Counter
import math

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--recording', type=Path, required=True)
parser.add_argument('--motion-log', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--scale', type=int, choices=[1,2], default=1)
parser.add_argument('--minimum-motion-s', type=float, default=0)
parser.add_argument('--minimum-static-s', type=float, default=0)
parser.add_argument('--minimum-duration-s', type=float, default=100)
parser.add_argument('--decode-timeout-s', type=int, choices=range(1,181), default=60)
args = parser.parse_args()
if any(not math.isfinite(v) or v<0 for v in [args.minimum_motion_s,args.minimum_static_s,args.minimum_duration_s]):
    raise ValueError('Finite nonnegative phase thresholds required')
if args.output.exists():
    raise ValueError('Fresh output required; preserve prior proof')
spec = importlib.util.spec_from_file_location('journal', Path(__file__).with_name('verify-journal.py'))
journal = importlib.util.module_from_spec(spec); spec.loader.exec_module(journal)
record = json.loads(args.recording.read_text())
proof, sources, geometries, encoded = journal.verify(Path(record['source_packet']['path']), Path(record['video']['path']))
if not proof['passed'] or record['state'] != 'done':
    raise ValueError('Successful actual mux/source correspondence is required')
used = {sources[row['source_frame']]['geometry_segment'] for row in encoded}
for k in used:
    g=geometries[k]['geometry'];r=g['screen_points'];scale=args.scale
    if g['source_pixels']!=[1000*scale,732*scale] or r['w']!=1000 or r['h']!=732 or \
       g['desktop_points_to_source_pixels']!=[scale,0,0,scale,-scale*r['x'],-scale*r['y']]:
        raise ValueError('Authored unfitted window/rect counter map and declared scale required')
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
    '-vf', f'crop={288*args.scale}:{20*args.scale}:{24*args.scale}:{116*args.scale},scale=12:1:flags=neighbor', '-pix_fmt', 'gray',
    '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], capture_output=True, check=True, timeout=args.decode_timeout_s)
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
duration = (int(timeline[-1]['host_ns'])-epoch)/1e9
moving_span=(int(moving[-1]['host_ns'])-int(moving[0]['host_ns']))/1e9 if moving else 0
static_span=(int(static[-1]['host_ns'])-int(static[0]['host_ns']))/1e9 if static else 0
if duration < args.minimum_duration_s: errors.append('Actual packet-time span shorter than requested qualification')
if moving_span < args.minimum_motion_s: errors.append('Sustained changing-source interval shorter than required')
if static_span < args.minimum_static_s: errors.append('Stopped-source interval shorter than required')
steps=Counter((b['tick']-a['tick'])%4096 for a,b in zip(moving,moving[1:]) if a['tick'] is not None and b['tick'] is not None)
summary = {'schema':'authored-motion-duration-proof/v1','passed':not errors,'errors':errors,
    'recording_id':record['recording_id'],'muxed_source_proof':proof,'duration_observed_s':duration,
    'motion_start_ns':str(begin),'motion_stop_ns':str(end),'moving_samples':len(moving),
    'changing_transitions':changes,'static_samples':len(static),'static_tick':expected_static,
    'moving_span_s':moving_span,'static_span_s':static_span,'declared_scale':args.scale,
    'phase_requirements':{'minimum_motion_s':args.minimum_motion_s,'minimum_static_s':args.minimum_static_s,'minimum_duration_s':args.minimum_duration_s},
    'moving_observed_packets_per_s':(len(moving)-1)/moving_span if moving_span>0 else None,
    'counter_change_fraction':changes/(len(moving)-1) if len(moving)>1 else None,
    'counter_step_counts_modulo4096':dict(steps),
    'held_semantics':'Inspect journal reasons separately; unchanged pixels from a fresh source are not labeled held-buffer padding',
    'limits':['Authored decoded counter and fixture lifecycle only; not physical presentation latency',
              'Declared-scale source duration; pair recovery, thermal capacity and production P80 require separate evidence',
              'Counter steps reflect observed encoded content; app drawing/coalescing vs capture omissions not causally distinguished',
              'Quarter-second boundary margins; no inferred event-provider clock equivalence']}
args.output.with_suffix('.timeline.json').write_text(json.dumps(timeline)+'\n')
args.output.write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:summary[k] for k in ['passed','errors','duration_observed_s','moving_samples','changing_transitions','static_samples','moving_span_s','static_span_s']}))
raise SystemExit(0 if summary['passed'] else 1)
