#!/usr/bin/env python3
"""Count native CUA calls from JSON metadata; never publish message/output bodies."""
import argparse
import collections
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--sessions', type=Path, required=True)
parser.add_argument('--since', required=True, help='ISO date/time inclusive')
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
sessions = []
total = collections.Counter()
for path in sorted(args.sessions.rglob('*.jsonl')):
    counts = collections.Counter()
    first = last = session_id = None
    try:
        for line in path.open():
            try:
                row = json.loads(line)
            except ValueError:
                continue
            value = row.get('payload', {})
            timestamp = row.get('timestamp', '')
            if row.get('type') == 'session_meta':
                session_id = value.get('id')
            if timestamp < args.since or row.get('type') != 'response_item':
                continue
            if value.get('type') not in ('function_call', 'custom_tool_call'):
                continue
            namespace, name = value.get('namespace', ''), value.get('name', '')
            if 'cua_repl' not in namespace and 'cua_repl' not in name:
                continue
            counts[f'{namespace}.{name}'.strip('.')] += 1
            first = first or timestamp
            last = timestamp
    except OSError:
        continue
    if counts:
        sessions.append(dict(session_id=session_id, path=str(path), first=first, last=last,
                             calls=sum(counts.values()), tools=dict(counts)))
        total.update(counts)
result = dict(since=args.since, session_count=len(sessions), call_count=sum(total.values()),
              tool_names=dict(total), sessions=sessions,
              limit='Tool metadata only; neither skill invocation proof nor task success evidence.')
args.output.write_text(json.dumps(result, indent=2))
print(json.dumps({key: value for key, value in result.items() if key != 'sessions'}))
