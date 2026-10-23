"""Read bounded incident history, emitting only sanitized metadata."""
import collections
import datetime
import json
from pathlib import Path

out = Path(__file__).parent
incident = json.loads((out.parent / 'incident.json').read_text())
start = datetime.datetime.fromisoformat(incident['createdAt'].replace('Z', '+00:00')) - datetime.timedelta(minutes=15)
config = json.loads((Path.home() / '.config/op-keepalive.json').read_text())
slots = {a['label']: i for i, a in enumerate(config['accounts'])}
counts = collections.Counter()
calls, resolutions = [], []
for line in (Path.home() / 'Library/Logs/op-broker/keepalive-2026-10.jsonl').open():
    try:
        row = json.loads(line)
        stamp = datetime.datetime.strptime(row['ts'], '%Y-%m-%dT%H:%M:%S%z')
    except (ValueError, KeyError):
        continue
    if stamp < start:
        continue
    kind = row.get('kind', row.get('event'))
    if kind not in ('keepalive', 'fault_started', 'fault_resolved', 'tick_error', 'app_relaunch', 'app_lock', 'recovery_kick'):
        continue
    counts[kind] += 1
    if kind == 'keepalive':
        calls.append({**{k: row.get(k) for k in ('ts', 'status', 'exit', 'seconds')}, 'slot': slots.get(row.get('account'))})
    if kind == 'fault_resolved':
        resolutions.append({'ts': row['ts'], 'incident_episode_matches': row.get('episode') == incident['episode']})
result = {'event_counts': dict(counts), 'calls': calls, 'resolutions': resolutions, 'raw_logs_saved': False}
(out / 'timeline.json').write_text(json.dumps(result, indent=2) + '\n')
state = json.loads((Path.home() / 'Library/Caches/com.taylor.op-keepalive/state.json').read_text())
resolution = {'incident_episode': incident['episode'], 'active_episode_matches': state.get('fault_episode') == incident['episode'], 'active_episode_present': bool(state.get('fault_episode')), 'resolutions': resolutions}
(out / 'episode-resolution.json').write_text(json.dumps(resolution, indent=2) + '\n')
print(json.dumps(result))
