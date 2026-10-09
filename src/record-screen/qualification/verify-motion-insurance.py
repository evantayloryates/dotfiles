#!/usr/bin/env python3
"""Qualify paired authored counter footage; no UI or general occlusion detector.

Counter: twelve black/white 24px cells at source (24,116), point resolution.
An owned magenta cover makes that counter unreadable in the display source.
Raw timelines and selected diagnostic frames remain beside the private output.
"""
import argparse
import bisect
import json
import subprocess
from datetime import datetime
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec

spec = spec_from_file_location('journal', Path(__file__).with_name('verify-journal.py'))
journal = module_from_spec(spec)
spec.loader.exec_module(journal)


def lane(manifest, output, name):
    rec = json.loads(manifest.read_text())
    proof, sources, geometry, encoded = journal.verify(Path(rec['source_packet']['path']), Path(rec['video']['path']))
    output.with_name(output.stem + '-' + name + '-journal.json').write_text(json.dumps(proof, indent=2))
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', rec['video']['path'],
        '-vf', 'crop=288:20:24:116,scale=12:1:flags=neighbor', '-pix_fmt', 'gray',
        '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], timeout=60)
    # A failed fragmented writer can lose its accepted tail. Never use that
    # tail as pixels; only accept an independently verified exact muxed prefix.
    count = proof['actual_muxed_packets']
    prefix_only = (rec['state'] == 'failed' and proof['errors'] == ['encoded decisions and muxed packet counts differ']
                   and count < len(encoded) and proof['muxed_minus_journal_ns'] == {'min': '0', 'max': '0'})
    if not proof['passed'] and not prefix_only:
        raise ValueError('muxed timestamps do not establish an exact source prefix')
    encoded = encoded[:count]
    if len(raw) != count * 12:
        raise ValueError('decoded counter count differs from actual muxed packets')
    used = {sources[row['source_frame']]['geometry_segment'] for row in encoded}
    geometry = {key: value for key, value in geometry.items() if key in used}
    epoch = int(rec['source_packet']['epoch_host_ns'])
    rows = []
    for index, row in enumerate(encoded):
        cells = raw[index * 12:(index + 1) * 12]
        tick = sum(1 << bit for bit, value in enumerate(cells) if value > 128) if all(v < 55 or v > 205 for v in cells) else None
        rows.append({'encoded_sequence': index, 'host_ns': str(epoch + int(row['relative_ns'])), 'tick': tick})
    output.with_name(output.stem + '-' + name + '-timeline.json').write_text(json.dumps(rows))
    return rec, proof, geometry, rows


def verify(primary, backup, cover_log, output, diagnostics):
    p, pp, pg, pr = lane(primary, output, 'primary')
    b, bp, bg, br = lane(backup, output, 'backup')
    errors = []
    if not bp['passed']:
        errors.append('backup mux/source proof failed')
    maps = []
    for geom in [pg, bg]:
        if not geom:
            errors.append('oracle requires known geometry for encoded sources')
        declared = [r['geometry'].get('desktop_points_to_source_pixels') for r in geom.values()]
        maps.append([json.loads(value) for value in sorted({json.dumps(value) for value in declared})])
        if any(r['geometry'].get('source_pixels') != [1000, 732] for r in geom.values()):
            errors.append('oracle requires 1000x732 point source')
    if maps[0] != maps[1] or maps[0] != [[1, 0, 0, 1, -120, -110]]:
        errors.append('paired source maps differ from authored fixture map')
    events = [json.loads(line) for line in cover_log.read_text().splitlines() if line.strip()]
    intervals = []
    shown = None
    for event in events:
        if event['kind'] == 'cover_shown': shown = int(event['host_ns'])
        elif event['kind'] == 'cover_removed' and shown is not None:
            intervals.append((shown, int(event['host_ns']))); shown = None
    intervals = [(a, z) for a, z in intervals if int(br[0]['host_ns']) < a and z < int(br[-1]['host_ns'])]
    if len(intervals) != 1:
        raise ValueError('need exactly one complete logged cover interval inside backup footage')
    begin, end = intervals[0]
    times = [int(row['host_ns']) for row in br]
    def nearest(host):
        i = bisect.bisect_left(times, host)
        indices = [j for j in [i - 1, i] if 0 <= j < len(times)]
        return min(indices, key=lambda j: abs(times[j] - host))
    repaired = []
    common_deltas = []
    offsets = []
    covered = []
    before, after = [], []
    for row in pr:
        host = int(row['host_ns']); i = nearest(host); alt = br[i]
        offset = abs(times[i] - host)
        middle = begin + 200_000_000 <= host <= end - 200_000_000
        if middle:
            covered.append(row)
            if row['tick'] is not None: errors.append('primary counter readable inside opaque-cover interval')
        if host < begin - 200_000_000: before.append(row)
        if host > end + 200_000_000: after.append(row)
        if row['tick'] is not None and alt['tick'] is not None and offset <= 25_000_000:
            delta = (row['tick'] - alt['tick'] + 2048) % 4096 - 2048
            common_deltas.append(abs(delta))
        if row['tick'] is None:
            offsets.append(offset)
            if alt['tick'] is None or offset > 25_000_000:
                errors.append('unreadable primary frame has no usable backup within25ms')
            repaired.append({'primary_sequence': row['encoded_sequence'], 'backup_sequence': i,
                             'offset_ns': str(offset), 'tick': alt['tick']})
    failed_primary = p['state'] == 'failed'
    if not before: errors.append('no primary matching footage before cover')
    if not failed_primary:
        span = (int(covered[-1]['host_ns']) - int(covered[0]['host_ns'])) / 1e9 if covered else 0
        if len(covered) < 10 or span < (end-begin)/1e9 - 3 or not after:
            errors.append('insufficient sparse primary before/cover/after coverage')
    if not common_deltas or max(common_deltas) > 3: errors.append('unobstructed sources do not match moving counter within3ticks')
    selected_backup = [r for r in br if begin + 200_000_000 <= int(r['host_ns']) <= end - 200_000_000]
    unique = len({r['tick'] for r in selected_backup if r['tick'] is not None})
    if unique < 100 or any(r['tick'] is None for r in selected_backup): errors.append('backup not continuously readable/changing under cover')
    if any(r['tick'] is None for r in before + after): errors.append('unexpected obstruction outside cover')
    if failed_primary:
        # Persisted primary ends early; do not invent absent primary samples or
        # keep stretching its final image. Switch to the verified backup clock.
        last = int(pr[-1]['host_ns'])
        repaired.extend({'backup_sequence': row['encoded_sequence'], 'host_ns': row['host_ns'],
                         'tick': row['tick'], 'reason': 'primary_media_ended'} for row in br if int(row['host_ns']) > last)
        if any(row['tick'] is None for row in br): errors.append('full-shot backup contains unreadable counter')
        if p['start_at'] != b['start_at'] or p['end_at'] != b['end_at']: errors.append('planned take bounds differ')
        planned = (int(br[-1]['host_ns']) - int(br[0]['host_ns'])) / 1e9
        requested = (datetime.fromisoformat(b['end_at'].replace('Z', '+00:00')) - datetime.fromisoformat(b['start_at'].replace('Z', '+00:00'))).total_seconds()
        if requested - planned > 0.04: errors.append('backup lacks planned take coverage within40ms')
    else:
        planned = (int(br[-1]['host_ns']) - int(br[0]['host_ns'])) / 1e9
        bad = [row for row in pr if row['tick'] is None]
        if bad:
            # A static obstruction is encoded sparsely. Preserve the backup's
            # dense source clock, rather than replacing only those sparse
            # primary samples and inadvertently reducing recovery to1fps.
            first_bad, last_bad = int(bad[0]['host_ns']), int(bad[-1]['host_ns'])
            following = next((int(row['host_ns']) for row in pr if int(row['host_ns']) > last_bad and row['tick'] is not None), None)
            if following is None:
                errors.append('primary has no observed recovery after obstruction')
            else:
                repaired = [{'backup_sequence': row['encoded_sequence'], 'host_ns': row['host_ns'],
                             'tick': row['tick'], 'reason': 'primary_obstruction_interval'}
                            for row in br if first_bad <= int(row['host_ns']) < following]
    longest = run = 0
    previous = None
    for row in br:
        run = run + 1 if row['tick'] == previous else 1
        previous = row['tick']; longest = max(longest, run)
    if longest > 3: errors.append('backup counter freezes for more than3encoded frames')
    recovery_path = output.with_name(output.stem + '-recovery-map.json')
    recovery_path.write_text(json.dumps(repaired))
    if diagnostics:
        alt = nearest((begin+end)//2)
        picks = [('recovered-backup', b, alt), ('before-primary', p, before[len(before)//2]['encoded_sequence']),
                 ('after-backup', b, nearest((end+int(br[-1]['host_ns']))//2))]
        if covered: picks.append(('covered-primary', p, covered[len(covered)//2]['encoded_sequence']))
        else: picks.append(('last-primary', p, pr[-1]['encoded_sequence']))
        for name, rec, index in picks:
            subprocess.run(['ffmpeg', '-v', 'error', '-i', rec['video']['path'], '-vf', f"select='eq(n,{index})'",
                            '-fps_mode', 'vfr', '-frames:v', '1', '-y', str(output.with_name(output.stem + '-' + name + '.png'))], check=True, timeout=30)
    result = {'schema': 'authored-motion-insurance/v1', 'passed': not errors, 'errors': sorted(set(errors)),
              'muxed_samples': [pp['actual_muxed_packets'], bp['actual_muxed_packets']],
              'primary_state': p['state'], 'primary_mux_complete': pp['passed'],
              'scope': 'full-shot backup after primary writer failure' if failed_primary else 'occlusion sample replacement',
              'covered_primary_samples': len(covered), 'recovery_samples': len(repaired),
              'backup_media_coverage_s': planned,
              'backup_longest_same_tick_run': longest,
              'backup_distinct_ticks_under_cover': unique, 'cover_duration_s': (end-begin)/1e9,
              'recovery_max_offset_ns': str(max(offsets)) if offsets else None,
              'common_counter_max_delta': max(common_deltas) if common_deltas else None,
              'recovery_map': str(recovery_path), 'maps': maps,
              'limits': ['Authored point-resolution counter/opaque cover only; no arbitrary-app obstruction detector',
                         'Nearest source samples, not physical presentation or interpolation',
                         'No final composition recipe, menu backup, HDR or GPU capacity guarantee']}
    output.write_text(json.dumps(result, indent=2))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--primary', type=Path, required=True)
    parser.add_argument('--backup', type=Path, required=True)
    parser.add_argument('--cover-log', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--diagnostics', action='store_true')
    args = parser.parse_args()
    try:
        result = verify(args.primary, args.backup, args.cover_log, args.output, args.diagnostics)
    except (ValueError, KeyError, IndexError) as error:
        result = {'schema': 'authored-motion-insurance/v1', 'passed': False, 'errors': [str(error)]}
        args.output.write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
    raise SystemExit(0 if result['passed'] else 1)
