"""Extract allowlisted incident metadata; never persist or print raw logs."""
import json, sys
from pathlib import Path
sys.path.insert(0, '/Users/taylor/dotfiles/src/onepassword')
import keepalive
labels = {a['label']:i for i,a in enumerate(keepalive.load_config()['accounts'])}
rows = []
for p in keepalive.LOG_DIR.glob('keepalive-2026-10.jsonl'):
    for line in p.open():
        try: r = json.loads(line)
        except ValueError: continue
        if r.get('ts','') < '2026-10-21T20:30': continue
        if r.get('event') not in ('keepalive','fault_started','fault_resolved','app_relaunch','app_lock','app_lock_event','onepassword_log_unreadable','recovery_kick'): continue
        row = {k:r[k] for k in ('ts','event','status','seconds','exit','locked') if k in r}
        if r.get('account') in labels: row['slot'] = labels[r['account']]
        if r.get('detail') in ('error','authorization timeout','broker_unavailable'): row['detail_category'] = r['detail']
        rows.append(row)
Path(__file__).with_suffix('.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps(rows[-6:]))
