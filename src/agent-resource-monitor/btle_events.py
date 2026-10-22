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

def receipt_health(root, state):
    """Match callback receipt by exact client ID; queue acceptance is separate."""
    receipts=set()
    for path in (root/'event-receipts.json',root.parent/'focus/event-receipts.json'):
        try:
            data=json.loads(path.read_text())
        except (FileNotFoundError, ValueError):
            continue
        records=data if isinstance(data,list) else data.get('receipts',[data] if data.get('clientUserMessageId') else []) if isinstance(data,dict) else []
        for item in records:
            if isinstance(item,dict) and item.get('clientUserMessageId'):
                receipts.add(item['clientUserMessageId'])
    for item in state.get('deliveries',[]):
        item['receipt_status']='received' if item['client_id'] in receipts else 'not_verified'
    state['delivery_health']={
        'accepted':len(state.get('deliveries',[])),
        'received':sum(x['receipt_status']=='received' for x in state.get('deliveries',[])),
        'unverified':sum(x['receipt_status']!='received' for x in state.get('deliveries',[])),
        'pending':len(state.get('pending',{})),
        'limits':'Queue acceptance is not chat receipt. Missing receipts never trigger a resend; reconcile pending sends by exact client ID.'}

def focus_events(root, state):
    try:
        return _focus_events(root,state)
    except (OSError,ValueError,KeyError,TypeError):
        state['focus_health']='unreadable focus evidence'
        if 'focus:health:failure' in state.get('acknowledged',[]):return {}
        return {'focus:health':[dict(id='focus:health:failure',kind='monitoring_failure',
                                   source='pressure-focus',incident='focus:health',status='unreadable evidence')]}


def _focus_events(root, state):
    """One completed pressure capture and one recovery per incident, not per rotation."""
    focus=root.parent/'focus'
    if not (focus/'status.json').exists():return {}
    groups={};ack=set(state.get('acknowledged',[]))
    status=json.loads((focus/'status.json').read_text())
    age=(dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(status['timestamp'])).total_seconds()
    health='healthy' if 0<=age<60 and status.get('health')=='ok' else 'stale or degraded'
    state['focus_health']=health
    if health!='healthy' and 'focus:health:failure' not in ack:
        groups['focus:health']=[dict(id='focus:health:failure',kind='monitoring_failure',source='pressure-focus',
                                    incident='focus:health',status=status.get('health',status.get('state')))]
    if health=='healthy' and 'focus:health:failure' in ack:
        state['acknowledged'].remove('focus:health:failure')
    path=focus/'incidents.json'
    if not path.exists():return groups
    for incident in json.loads(path.read_text()).get('incidents',[]):
        group='focus:'+incident['id'];events=[]
        for directory in incident.get('captures',[]):
            capture=pathlib.Path(directory)
            if capture.parent.resolve()!=(focus/'captures').resolve():continue
            report=capture/'analysis.json'
            if not report.exists():continue
            d=json.loads(report.read_text())
            if d.get('state')!='captured':continue
            eid=group+':capture'
            if eid not in ack:
                events.append(dict(id=eid,kind='pressure_capture',source='pressure-focus',incident=group,
                    bundle=str(capture),last_sample=d.get('last_sample'),pressure_peak=d.get('pressure_peak'),
                    limitation='Ranked counters and stack symbols are evidence for investigation, not causal attribution.'))
            break
        if incident.get('recovered_at') and group+':recovery' not in ack:
            events.append(dict(id=group+':recovery',kind='recovery',source='pressure-focus',incident=group,
                               recovered_at=incident['recovered_at']))
        if events:groups[group]=events
    return groups

def evaluate(root, state):
    """Rotations stay one incident until 30 consecutive quiet samples."""
    # Retention can remove the first bundle of an active incident. Reuse the
    # original incident ID when a retained diagnostic was already acknowledged;
    # otherwise the oldest remaining bundle looks like a second onset.
    diagnostic_owner={}
    for event_id in state.get('acknowledged',[]):
        incident, separator, checked_at=event_id.partition(':diagnostics:')
        if separator:
            diagnostic_owner.setdefault(checked_at,incident)
    records=[]
    for p in root.glob('episode-*.json'):
        if p.name.endswith('.diagnostics.json'): continue
        d=json.loads(p.read_text())
        if d['started_at'] < state['created_at']: continue
        records.append((d['started_at'],p,d))
    chunks=[]; current=[]; previous=None
    for _,p,d in sorted(records):
        # A sampling gap is unknown coverage, not 30 verified quiet samples.
        if previous is None or previous['recovered']:
            if current: chunks.append(current)
            current=[]
        samples=d.get('samples',[]); quiet=0
        for row in reversed(samples):
            if row.get('collection_health','ok')!='ok':break
            targets=row.get('targets',[])
            if any(t.get('cpu_percent') is None or t['cpu_percent']>=30 for t in targets):break
            quiet+=1
        recovered=quiet>=30
        current.append((p,d,samples,recovered))
        previous=dict(recovered=recovered,last=d.get('last_sample_at',d['started_at']))
    if current: chunks.append(current)
    events=[]
    for chunk in chunks:
        group=chunk[0][0].stem
        # A diagnostic retained within this group ties a pruned first bundle
        # back to its acknowledged incident. Prefer the oldest acknowledged ID
        # if a prior relay already emitted an accidental duplicate onset.
        for p,_,_,_ in chunk:
            diag=p.with_suffix('.diagnostics.json')
            if not diag.exists():continue
            checked_at=str(json.loads(diag.read_text()).get('checked_at'))
            if checked_at in diagnostic_owner:
                group=diagnostic_owner[checked_at]
                break
        for p,d,samples,recovered in chunk:
            evidence=dict(incident=group,bundle=str(p),last_sample=d.get('last_sample_at'),
                          peak_cpu=max((t.get('cpu_percent') or 0 for row in samples for t in row.get('targets',[])),default=0))
            events.append(dict(id=group+':onset',kind='onset',**evidence))
            diag=p.with_suffix('.diagnostics.json')
            if diag.exists():
                diagnostic=json.loads(diag.read_text())
                capture=diagnostic.get('stack_capture',{})
                events.append(dict(id=group+':diagnostics:'+str(diagnostic.get('checked_at',capture.get('status'))),kind='diagnostics',stack_status=capture.get('status'),**evidence))
            if recovered:events.append(dict(id=group+':recovery',kind='recovery',**evidence))
    # Coalesce onset + diagnostics + recovery found together into one callback per incident.
    grouped={}
    acknowledged=set(state.get('acknowledged',[]))
    acknowledged_diagnostics={eid.partition(':diagnostics:')[2] for eid in acknowledged
                              if ':diagnostics:' in eid}
    for event in {e['id']:e for e in events}.values():
        if event['id'] in acknowledged:continue
        # An earlier false onset may have accepted this same diagnostic under
        # a rotated bundle ID. Its exact callback must not be queued again.
        if event['kind']=='diagnostics' and event['id'].partition(':diagnostics:')[2] in acknowledged_diagnostics:continue
        grouped.setdefault(event['incident'],[]).append(event)
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
        groups.update(focus_events(root,state))
        if state['watcher_health']!='healthy' and 'health:failure' not in state['acknowledged']:
            groups['health']=[dict(id='health:failure',kind='monitoring_failure',incident='health')]
        if state['watcher_health']=='healthy' and 'health:failure' in state['acknowledged']:
            state['acknowledged'].remove('health:failure')
        # A prepared health alert has never reached queue/add. If health recovered,
        # retain its identity in history but do not deliver a stale startup warning.
        # Submitting/accepted/uncertain identities must still reconcile unchanged.
        for incident,pending in list(state['pending'].items()):
            health=state.get('focus_health') if incident=='focus:health' else state['watcher_health'] if incident=='health' else None
            if health=='healthy' and pending.get('phase')=='prepared' and all(e.get('kind')=='monitoring_failure' for e in pending['events']):
                state.setdefault('resolved_without_send',[]).append(dict(client_id=pending['client_id'],incident=incident,
                    resolved_at=now,reason='health recovered before any queue submission'))
                state['resolved_without_send']=state['resolved_without_send'][-1000:]
                del state['pending'][incident]
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
                    state.setdefault('deliveries',[]).append(dict(client_id=pending['client_id'],
                        queue_id=pending.get('queue_id'),incident=incident,accepted_at=now,
                        event_ids=[e['id'] for e in pending['events']]))
                    state['deliveries']=state['deliveries'][-1000:]
                    state['acknowledged']+= [e['id'] for e in pending['events']]
                    del state['pending'][incident]
            except (subprocess.TimeoutExpired,ValueError) as error:
                state=json.loads(path.read_text())
                pending=state['pending'][incident]
                pending['last_error']=type(error).__name__
        state['acknowledged']=list(dict.fromkeys(state['acknowledged']))[-1000:]
        receipt_health(root,state)
        watcher.write_json(path,state)
        return state

if __name__=='__main__':
    print(json.dumps(run()))
