#!/usr/bin/env python3
"""Join authored keyboard app deliveries to a saved recorder source; no UI/input.

Retains raw rows on disk; output contains counts and mechanical scope findings.
Related mode expects every oracle key and shortcut to survive, with window
uncertainty explicit. Cross-app-shortcuts expects unmodified keys excluded and
bounded modifier/shortcut candidates retained. Does not authenticate actors.
"""
import argparse
from collections import Counter
import json
from pathlib import Path


def verify(recording, delivered, actions, mode):
    rows = [json.loads(line) for line in Path(recording['source_packet']['path']).open() if line.strip()]
    scope = next(row for row in rows if row['kind'] == 'input_scope')
    events = [row for row in rows if row['kind'] == 'input_event' and row['type'] in (10, 11, 12)]
    errors, matches, shortcuts = [], [], []
    for action in actions:
        if action['state'] != 'closed' or action['end_ns'] is None:
            errors.append('requires a closed exact action interval')
            continue
        start, end = int(action['start_ns']), int(action['end_ns'])
        oracle = [row for row in delivered if row['kind'] in ('key_delivery', 'shortcut_executed')
                  and start <= int(row['received_host_ns']) <= end]
        for row in oracle:
            found = [event for event in events
                     if event['event_timestamp_ns'] == row['event_timestamp_ns']
                     and event['type'] == row['cg_type'] and event['key_code'] == row['key_code']
                     and event['flags'] == row['flags'] and event['destination_pid'] == row['destination_pid']
                     and event['source_pid'] == row['source_pid']
                     and start <= int(event['received_host_ns']) <= end]
            expected = mode == 'related' or row['cg_type'] == 12 or int(row['flags']) & ((1 << 18) | (1 << 19) | (1 << 20)) != 0
            if len(found) != (1 if expected else 0):
                errors.append('oracle transition retention differs from requested policy')
            for event in found:
                if event['ownership'] != 'unknown':
                    errors.append('ownership was promoted')
                if mode == 'related':
                    if event['scope_certainty'] != 'app_delivery_window_unresolved':
                        errors.append('keyboard window uncertainty was promoted')
                    token_expected = action['target']['window_id'] == scope['scope_window_id']
                    if (action['action_token'] in event['action_ids']) != token_expected:
                        errors.append('action association crossed recording window')
                elif event['scope_certainty'] != 'candidate' or event['relevance_reasons'] != ['declared_action_keyboard_candidate']:
                    errors.append('known other-app keyboard claimed foreground or stronger relevance')
            result = {'window_matches_recording': row['window_number'] == scope['scope_window_id'],
                      'expected_retained': expected, 'matching_source_rows': len(found)}
            (shortcuts if row['kind'] == 'shortcut_executed' else matches).append(result)
    if not matches or not shortcuts:
        errors.append('requires actual key delivery and semantic shortcut execution')
    if mode == 'cross-app-shortcuts' and not any(not row['expected_retained'] for row in matches):
        errors.append('requires an actual unrelated unmodified transition')
    return {'schema': 'keyboard-delivery-qualification/v1', 'passed': not errors, 'errors': errors,
            'mode': mode, 'app_key_deliveries': len(matches), 'semantic_shortcut_executions': len(shortcuts),
            'expected_retained': sum(row['expected_retained'] for row in matches),
            'matched_retained': sum(row['matching_source_rows'] == 1 for row in matches),
            'expected_excluded': sum(not row['expected_retained'] for row in matches),
            'verified_excluded': sum(not row['expected_retained'] and row['matching_source_rows'] == 0 for row in matches),
            'same_app_other_window_deliveries': sum(not row['window_matches_recording'] for row in matches) if mode == 'related' else 0,
            'retained_key_types': dict(Counter(row['type'] for row in events)),
            'input_gaps': recording['source_packet']['input_gaps_observed'],
            'journal_rows_lost': recording['source_packet']['rows_lost'],
            'limits': ['Authored native oracle; not physical/global shortcut completeness or actor identity.',
                       'Same-app keyboard window ownership remains unresolved in recorder rows.',
                       'Raw CG equality is delivery provenance, not physical latency.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recording', type=Path, required=True, help='Saved public recording reply JSON')
    parser.add_argument('--delivered', type=Path, required=True)
    parser.add_argument('--action', type=Path, required=True, action='append', help='Saved terminal action reply')
    parser.add_argument('--mode', choices=['related', 'cross-app-shortcuts'], required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    proof = verify(json.loads(args.recording.read_text()), [json.loads(line) for line in args.delivered.open() if line.strip()],
                   [json.loads(path.read_text()) for path in args.action], args.mode)
    args.output.write_text(json.dumps(proof, indent=2))
    print(json.dumps(proof))
    raise SystemExit(0 if proof['passed'] else 1)


if __name__ == '__main__':
    main()
