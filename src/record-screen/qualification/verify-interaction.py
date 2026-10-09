#!/usr/bin/env python3
"""Match an owned app-local delivery oracle against a retained input journal.

No capture, synthesis, UI, text reconstruction or actor inference. Exact raw
timestamp/type matches are evidence for this delivered sample, not calibration
of every provider or proof of events that neither observer received.
"""
import argparse
import collections
import json
from pathlib import Path


def bounds(values):
    values = sorted(values)
    return ({'count': len(values), 'min': str(values[0]),
             'median': str(values[len(values)//2]), 'max': str(values[-1])}
            if values else None)


def verify(oracle, journal):
    header = journal[0] if journal else {}
    end = next((r for r in reversed(journal) if r['kind'] == 'input_scope_end'), None)
    if header.get('kind') != 'header' or not end:
        raise ValueError('A retained input scope and its terminal bound are required')
    begin_ns, end_ns = int(header['epoch_host_ns']), int(end['host_ns'])
    all_delivered = [r for r in oracle if 'event_timestamp_ns' in r]
    delivered = [r for r in all_delivered
                 if begin_ns <= int(r['received_host_ns']) < end_ns]
    retained = [r for r in journal if r['kind'] == 'input_event']
    index = collections.defaultdict(list)
    for row in retained:
        index[(row['event_timestamp_ns'], row['type'])].append(row)
    groups = {}
    failures = []
    for event in delivered:
        key = (event['event_timestamp_ns'], event['cg_type'])
        matches = index[key]
        lane = event['lane']
        group = groups.setdefault(lane, {'delivered': 0, 'matched_once': 0,
            'event_kinds': collections.Counter(), 'certainty': collections.Counter(),
            'relevance_reasons': collections.Counter(), 'with_action_tags': 0,
            'without_action_tags': 0, 'recorder_receipt_minus_event_ns': [],
            'app_delivery_minus_recorder_receipt_ns': [], 'pointer_errors': [],
            'position_promoted': 0, 'matched_key_codes': 0})
        group['delivered'] += 1
        group['event_kinds'][event['kind']] += 1
        if len(matches) != 1:
            failures.append({'lane': lane, 'event_kind': event['kind'],
                             'exact_match_count': len(matches)})
            continue
        row = matches[0]
        if event['cg_type'] in [10, 11, 12]:
            if event['key_code'] != row.get('key_code'):
                failures.append({'lane': lane, 'event_kind': event['kind'],
                                 'error': 'matched stamp/type disagrees on key code'})
            else:
                group['matched_key_codes'] += 1
        group['matched_once'] += 1
        group['certainty'][row['scope_certainty']] += 1
        group['relevance_reasons'].update(row['relevance_reasons'])
        group['with_action_tags' if row.get('action_ids') else 'without_action_tags'] += 1
        group['recorder_receipt_minus_event_ns'].append(
            int(row['received_host_ns']) - int(event['event_timestamp_ns']))
        group['app_delivery_minus_recorder_receipt_ns'].append(
            int(event['received_host_ns']) - int(row['received_host_ns']))
        position = row.get('raw_position')
        if position and len(event.get('cg_position', [])) == 2:
            group['pointer_errors'].append(max(abs(position['x']-event['cg_position'][0]),
                                                abs(position['y']-event['cg_position'][1])))
        group['position_promoted'] += row.get('position_for_composition') is not None
    for group in groups.values():
        for field in ['recorder_receipt_minus_event_ns', 'app_delivery_minus_recorder_receipt_ns']:
            group[field] = bounds(group[field])
        errors = group.pop('pointer_errors')
        group['matched_pointer_positions'] = len(errors)
        group['max_raw_pointer_disagreement_points'] = max(errors) if errors else None
    footer = next((r for r in reversed(journal) if r['kind'] == 'footer'), None)
    if not footer or not footer.get('complete') or footer.get('rows_lost') != 0:
        failures.append({'error': 'input journal completeness/loss does not establish this sample'})
    return {'schema': 'owned-interaction-qualification/v1',
        'exact_delivery_sample_passed': bool(delivered) and not failures,
        'delivered': len(delivered), 'retained': len(retained), 'groups': groups,
        'oracle_delivery_interval_host_ns': [str(begin_ns), str(end_ns)],
        'oracle_outside_delivery_interval': len(all_delivered) - len(delivered),
        'failures': failures, 'journal_lost_rows': footer.get('rows_lost') if footer else None,
        'limits': ['Same-app sibling activity is deliberately retained with window uncertainty.',
            'Action tags declare intent intervals; absence or presence does not authenticate the actor.',
            'Raw CG timestamp identity is scoped sample evidence, not external clock calibration.',
            'Oracle selection uses app receipt within the terminal input scope; boundary delivery may differ from tap receipt.',
            'Raw positions are not promoted; separate source-pixel qualification remains required.',
            'This sample measures no physical input density, touchpad phases or unseen event loss.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--oracle', type=Path, required=True)
    parser.add_argument('--journal', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    def rows(path):
        return [json.loads(line) for line in path.open() if line.strip()]
    result = verify(rows(args.oracle), rows(args.journal))
    with args.output.open('x') as output:
        args.output.chmod(0o600)
        json.dump(result, output, indent=2); output.write('\n')
    print(json.dumps(result))
    raise SystemExit(0 if result['exact_delivery_sample_passed'] else 1)
