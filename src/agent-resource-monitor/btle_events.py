#!/usr/bin/env python3
"""Deterministic incident relay. No model calls for idle/absent targets."""
import datetime as dt
import fcntl
import json
import pathlib
import subprocess
import uuid
import watcher
from btle_watch import ROOT

BASELINE = '2026-10-11T18:37:08.934414+00:00'
DISPATCH = pathlib.Path(__file__).with_name('btle_event_dispatch.mjs')

def evaluate(root, state):
    """Rotations stay one incident until 30 consecutive quiet samples."""
    records=[]
    for p in root.glob('episode-*.json'):
        if p.name.endswith('.diagnostics.json'): continue
        d=json.loads(p.read_text())
        if d['started_at'] < state['created_at']: continue
        records.append((d['started_at'],p,d))
    events=[]; previous=None; group=None
    for _,p,d in sorted(records):
        if previous is None or previous['recovered'] or (dt.datetime.fromisoformat(d['started_at'])-dt.datetime.fromisoformat(previous['last'])).total_seconds()>35:
            group=p.stem
        samples=d.get('samples',[]); quiet=0
        for row in reversed(samples):
            if any((t.get('cpu_percent') or 0)>=30 for t in row.get('targets',[])):break
            quiet+=1
        recovered=quiet>=30
        evidence=dict(incident=group,bundle=str(p),last_sample=d.get('last_sample_at'),
                      peak_cpu=max((t.get('cpu_percent') or 0 for row in samples for t in row.get('targets',[])),default=0))
        events.append(dict(id=group+':onset',kind='onset',**evidence))
        diag=p.with_suffix('.diagnostics.json')
        if diag.exists():
            diagnostic=json.loads(diag.read_text())
            capture=diagnostic.get('stack_capture',{})
            events.append(dict(id=group+':diagnostics:'+str(diagnostic.get('checked_at',capture.get('status'))),kind='diagnostics',stack_status=capture.get('status'),**evidence))
        if recovered:events.append(dict(id=group+':recovery',kind='recovery',**evidence))
        previous=dict(recovered=recovered,last=d.get('last_sample_at',d['started_at']))
    # Coalesce onset + diagnostics + recovery found together into one callback per incident.
    grouped={}
    for event in {e['id']:e for e in events}.values():
        if event['id'] not in state.get('acknowledged',[]):grouped.setdefault(event['incident'],[]).append(event)
    return grouped

def run(root=ROOT, send=True):
    root.mkdir(parents=True,exist_ok=True)
    with (root/'event-relay.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        path=root/'event-relay.json'
        state=json.loads(path.read_text()) if path.exists() else dict(created_at=BASELINE,acknowledged=[],pending={})
        now=watcher.monitor.now();state['checked_at']=now
        status=json.loads((root/'status.json').read_text())
        age=(dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(status['timestamp'])).total_seconds()
        state['watcher_health']='healthy' if age<15 and status.get('collection_health')=='ok' else 'stale or degraded'
        groups=evaluate(root,state)
        if state['watcher_health']!='healthy' and 'health:failure' not in state['acknowledged']:
            groups['health']=[dict(id='health:failure',kind='monitoring_failure',incident='health')]
        if state['watcher_health']=='healthy' and 'health:failure' in state['acknowledged']:
            state['acknowledged'].remove('health:failure')
        for incident,pending in state['pending'].items():
            groups.setdefault(incident,pending['events'])
        state['new_event_groups']=len(groups)
        for incident,events in groups.items():
            # Persist message identity BEFORE mutation; uncertain replies reconcile, never blind replay.
            pending=state['pending'].setdefault(incident,dict(client_id=str(uuid.uuid4()),events=events,phase='prepared'))
            watcher.write_json(path,state)
            if not send:continue
            node=subprocess.run(['/bin/sh',str(DISPATCH.parents[1]/'lib/resolve-binary.sh'),'node'],capture_output=True,text=True,timeout=5,check=True).stdout.strip()
            try:
                out=subprocess.run([node,str(DISPATCH),str(path),incident],capture_output=True,text=True,timeout=25)
                result=json.loads(out.stdout)
                state=json.loads(path.read_text())
                pending=state['pending'][incident]
                pending['result']=result
                if result.get('verified'):
                    state['acknowledged']+= [e['id'] for e in pending['events']]
                    del state['pending'][incident]
            except (subprocess.TimeoutExpired,ValueError) as error:
                state=json.loads(path.read_text())
                pending=state['pending'][incident]
                pending['last_error']=type(error).__name__
        state['acknowledged']=list(dict.fromkeys(state['acknowledged']))[-1000:]
        watcher.write_json(path,state)
        return state

if __name__=='__main__':
    print(json.dumps(run()))
