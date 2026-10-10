#!/usr/bin/env python3
"""Compare covering versus nearest source-time choices against retained counters.

Numeric private source-index input is produced from current exact mux/source
joins plus previously decoded authored counters. No images, capture or UI here.
Counter agreement is a diagnostic, not full-image or spatial registration proof.
"""
import argparse
import bisect
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path


def quantiles(values):
    values = sorted(values)
    if not values:
        return None
    return {key: values[min(len(values)-1, int((len(values)-1)*fraction))]
            for key, fraction in [('p50', .5), ('p95', .95), ('max', 1)]}


def compare(primary, backup, start, stop, limit):
    frames, other = primary['frames'], backup['frames']
    outputs = [int(f['output_host_ns']) for f in other]
    first_by_source = {}
    for f in other:
        first_by_source.setdefault(int(f['content_host_ns']), f)
    times = sorted(first_by_source)
    by_tick = defaultdict(list)
    for f in other:
        if f['projection_available']:
            by_tick[f['tick']].append(int(f['content_host_ns']))
    for values in by_tick.values():
        values.sort()
    rows = []
    for f in frames:
        stamp = int(f['content_host_ns'])
        phase = ('moving' if start+250_000_000 <= stamp <= stop-250_000_000
                 else 'static' if stamp >= stop+250_000_000 else 'boundary_or_initial')
        n = bisect.bisect_right(outputs, stamp)-1
        covering = other[n] if n >= 0 and stamp < int(other[n]['end_host_ns']) else None
        reason = None
        if covering is None:
            reason = 'outside_measured_backup_packet_coverage'
        elif not covering['projection_available']:
            reason = 'covering_projection_unavailable'
        choices = {}
        if reason is None:
            j = bisect.bisect_left(times, stamp)
            candidates = [first_by_source[times[k]] for k in [j-1, j] if 0 <= k < len(times)]
            nearest = min(candidates, key=lambda a: (abs(int(a['content_host_ns'])-stamp), a['index']))
            if abs(int(covering['content_host_ns'])-stamp) == abs(int(nearest['content_host_ns'])-stamp):
                nearest = covering
            for name, candidate in [('covering', covering), ('nearest', nearest)]:
                delta = int(candidate['content_host_ns'])-stamp
                available = candidate['projection_available'] and abs(delta) <= limit
                choices[name] = {
                    'backup_index': candidate['index'], 'delta_ns': delta,
                    'available': available,
                    'reason': None if available else 'selected_projection_unavailable'
                    if not candidate['projection_available'] else 'content_delta_exceeded',
                    'tick': candidate['tick'],
                    'signed_counter_delta_mod4096': (candidate['tick']-f['tick']+2048) % 4096-2048,
                }
        candidates = by_tick.get(f['tick'], [])
        k = bisect.bisect_left(candidates, stamp-limit)
        oracle_possible = reason is None and k < len(candidates) and candidates[k] <= stamp+limit
        rows.append({'primary_index': f['index'], 'primary_tick': f['tick'],
                     'primary_content_host_ns': f['content_host_ns'],
                     'primary_output_host_ns': f['output_host_ns'],
                     'primary_output_end_host_ns': f['end_host_ns'],
                     'phase': phase, 'refusal': reason, 'choices': choices,
                     'counter_oracle_match_available': oracle_possible})
    summary = {}
    for phase in ['moving', 'static', 'boundary_or_initial', 'all']:
        selected = [r for r in rows if phase == 'all' or r['phase'] == phase]
        metrics = {'primary_frames': len(selected),
                   'coverage_or_projection_refusals': dict(Counter(r['refusal'] for r in selected if r['refusal'])),
                   'counter_oracle_match_available': sum(r['counter_oracle_match_available'] for r in selected)}
        for policy in ['covering', 'nearest']:
            available = [r['choices'][policy] for r in selected if policy in r['choices'] and r['choices'][policy]['available']]
            metrics[policy] = {'available': len(available),
                'refusals': dict(Counter(r['choices'][policy]['reason'] for r in selected
                                        if policy in r['choices'] and not r['choices'][policy]['available'])),
                'exact_counter_matches': sum(a['signed_counter_delta_mod4096'] == 0 for a in available),
                'counter_delta_histogram': dict(sorted(Counter(a['signed_counter_delta_mod4096'] for a in available).items())),
                'absolute_source_delta_ns': quantiles([abs(a['delta_ns']) for a in available])}
        common = [r for r in selected if all(r['choices'].get(p, {}).get('available') for p in ['covering', 'nearest'])]
        transitions = Counter()
        for r in common:
            before = abs(r['choices']['covering']['signed_counter_delta_mod4096'])
            after = abs(r['choices']['nearest']['signed_counter_delta_mod4096'])
            transitions['improved' if after < before else 'regressed' if after > before else 'unchanged'] += 1
        metrics['paired_counter_error_changes'] = dict(transitions)
        metrics['changed_backup_selection'] = sum(r['choices']['covering']['backup_index'] != r['choices']['nearest']['backup_index'] for r in common)
        summary[phase] = metrics
    runs, run = [], []
    for r in rows + [None]:
        bad = r and r['phase'] == 'moving' and r['choices'].get('nearest', {}).get('available') and r['choices']['nearest']['signed_counter_delta_mod4096'] != 0
        if bad:
            run.append(r)
        elif run:
            runs.append({'frames': len(run), 'first_primary_index': run[0]['primary_index'],
                         'last_primary_index': run[-1]['primary_index'],
                         'output_duration_ns': str(int(run[-1]['primary_output_end_host_ns'])-int(run[0]['primary_output_host_ns']))})
            run = []
    return rows, {'primary_recording_id': primary['recording_id'], 'backup_recording_id': backup['recording_id'],
                  'phases': summary, 'largest_nearest_counter_mismatch_runs': sorted(runs, key=lambda r: int(r['output_duration_ns']), reverse=True)[:8]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('index', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--max-delta-ns', type=int, default=50_000_000)
    args = parser.parse_args()
    if not 0 <= args.max_delta_ns <= 250_000_000 or args.index.stat().st_size > 64*1024*1024:
        raise ValueError('Bounded content delta and source-index file required')
    data = json.loads(args.index.read_text())
    if data['schema'] != 'retained-counter-source-index/v1' or len(data['tracks']) != 2 or data['clock_alignment']['qualified'] is not True:
        raise ValueError('Two indexed tracks and qualified retained clocks required')
    if int(data['motion_stop_ns']) <= int(data['motion_start_ns']):
        raise ValueError('Motion stop must follow the selected motion start')
    for track in data['tracks']:
        if not 1 <= len(track['frames']) <= 120_000:
            raise ValueError('Packet budget exceeded')
        previous = None
        for n, f in enumerate(track['frames']):
            now = int(f['output_host_ns'])
            if f['index'] != n or previous is not None and now <= previous or int(f['end_host_ns']) <= now or not 0 <= f['tick'] < 4096:
                raise ValueError('Invalid indexed packet/counter')
            previous = now
    summaries = []
    rows_path = args.output.with_suffix('.comparisons.jsonl')
    with rows_path.open('x') as out:
        for primary, backup in [data['tracks'], data['tracks'][::-1]]:
            rows, summary = compare(primary, backup, int(data['motion_start_ns']), int(data['motion_stop_ns']), args.max_delta_ns)
            summaries.append(summary)
            for row in rows:
                out.write(json.dumps({'primary_recording_id': primary['recording_id'], **row})+'\n')
    result = {'schema': 'retained-counter-content-comparison/v1', 'max_delta_ns': str(args.max_delta_ns),
              'source_index_sha256': hashlib.sha256(args.index.read_bytes()).hexdigest(), 'directions': summaries,
              'limits': ['Reuses previously decoded authored counters; this pass checks current exact packet/source joins, without decoding all pixels again.',
                         'Counter-oracle availability is an authored diagnostic upper bound within the same time limit, not a deployed selector or proof that whole-frame content can be recovered.',
                         'A twelve-bit counter is a small diagnostic patch, not whole-frame content, spatial alignment or actor/physical presentation proof.',
                         'Nearest selection occurs by source timestamps only; counter values never choose a candidate.',
                         'Counter differences do not identify app drawing coalescence versus capture omissions. Continuous registration remains unqualified.']}
    with args.output.open('x') as out:
        json.dump(result, out, indent=2)
        out.write('\n')
    print(json.dumps({'directions': [{'primary': s['primary_recording_id'], 'moving': s['phases']['moving']} for s in summaries], 'output': str(args.output)}))


if __name__ == '__main__':
    main()
