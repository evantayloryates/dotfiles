#!/usr/bin/env python3
"""Structural CUA workflow audit; bodies stay on disk, no semantic labels.

Result presence and observation API references are protocol/code evidence only.
Neither an opaque tool result nor a subsequent observation proves task success.
"""
import argparse
import collections
import json
import re
from pathlib import Path


def audit(path, since):
    calls = {}
    order = []
    session_id = None
    counts = collections.Counter()
    for line in path.open():
        try:
            row = json.loads(line)
        except ValueError:
            counts['malformed_json_rows'] += 1
            continue
        p = row.get('payload', {})
        if row.get('type') == 'session_meta':
            session_id = p.get('id')
        if row.get('timestamp', '') < since or row.get('type') != 'response_item':
            continue
        kind = p.get('type')
        if kind in ('function_call', 'custom_tool_call') and 'cua_repl' in (p.get('namespace', '') + p.get('name', '')):
            code = p.get('input', '')
            if isinstance(p.get('arguments'), str):
                try:
                    code = json.loads(p['arguments']).get('code', '')
                except (ValueError, AttributeError):
                    code = ''
            if not isinstance(code, str):
                code = ''
            # Static API references, not classifications of page/output text.
            observe = bool(re.search(r'\.(getAXState(?:AndScreenshot)?|getScreenshot|getState|domSnapshot|screenshot)\s*\(', code))
            mutate = bool(re.search(r'\.(click|drag|scroll|typeText|pressKey|paste|setValue|fill|goto|reload|close|selectOption|performSecondaryAction)\s*\(', code))
            item = {'result_count': 0, 'observation_reference': observe, 'action_reference': mutate}
            calls[p.get('call_id')] = item
            order.append(item)
            counts['calls'] += 1
            counts['reset_calls'] += p.get('name', '').endswith('js_reset')
        elif kind in ('function_call_output', 'custom_tool_call_output') and p.get('call_id') in calls:
            item = calls[p['call_id']]
            item['result_count'] += 1
            out = p.get('output')
            counts['result_payload_' + type(out).__name__] += 1
            # Only a typed protocol error flag qualifies here. Do not infer
            # errors/success by keyword matching arbitrary returned text.
            if isinstance(out, dict) and out.get('isError') is True:
                counts['typed_error_results'] += 1
    for index, item in enumerate(order):
        counts['calls_with_result'] += item['result_count'] > 0
        counts['calls_without_result'] += item['result_count'] == 0
        counts['calls_with_multiple_results'] += item['result_count'] > 1
        counts['observation_reference_calls'] += item['observation_reference']
        counts['action_reference_calls'] += item['action_reference']
        if item['action_reference']:
            counts['action_with_same_call_observation_reference'] += item['observation_reference']
            counts['action_with_same_or_next_call_observation_reference'] += item['observation_reference'] or (index + 1 < len(order) and order[index + 1]['observation_reference'])
    return session_id, dict(counts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--inventory', type=Path, required=True)
    ap.add_argument('--output', type=Path, required=True)
    ap.add_argument('--qualification-session', required=True)
    args = ap.parse_args()
    inventory = json.loads(args.inventory.read_text())
    aggregate = collections.Counter()
    qualification = collections.Counter()
    sessions = []
    for entry in inventory['sessions']:
        sid, counts = audit(Path(entry['path']), inventory['since'])
        (qualification if sid == args.qualification_session else aggregate).update(counts)
        sessions.append({'session_id': sid, 'counts': counts})
    result = {'schema': 'computer-use-structural-audit/v1', 'since': inventory['since'],
              'historical_sessions': sum(s['session_id'] != args.qualification_session for s in sessions),
              'historical_counts': dict(aggregate), 'qualification_counts': dict(qualification),
              'sessions': sessions,
              'limits': ['Static API references are not proof of executed observation or delivery',
                         'Opaque text/list results have unknown success; no semantic text classification performed',
                         'Historical tool presence does not prove skill invocation, task completion or user alignment',
                         'This audit motivates future structured delivery, verification and cleanup receipts']}
    args.output.write_text(json.dumps(result, indent=2))
    print(json.dumps({k: v for k, v in result.items() if k != 'sessions'}))


if __name__ == '__main__':
    main()
