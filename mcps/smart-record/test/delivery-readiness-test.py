#!/usr/bin/env python3
"""Deterministic read-only assessment boundaries; no live engine or mutation."""
from copy import deepcopy
import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('readiness',Path(__file__).with_name('delivery-readiness.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
s={'engine':{'pid':1,'build':'test'},'viewfinder':{'lanes':[],'retiring':0,'quarantined':0},'capture_health':{'recordings':{'unfinished':0,'quarantined':0},'discovery':{'inflight':False,'quarantined':False},'export_child':{'pending':False,'quarantined':False}},'input_timeline':{'subscribers':0,'queued':0},'action_timeline':{'active':0},'permission':{'screen_recording':'granted'},'overlays':[]}
checks=0
def check(value):
 global checks
 assert value
 checks+=1
check(m.assess(s,{'total':0},s)['known_diagnostics_idle'])
check(not m.assess(s,{'total':1},s)['known_diagnostics_idle'])
legacy={**s,'capture_health':None,'input_timeline':None,'action_timeline':None}
check(not m.assess(legacy,{'total':0},legacy)['known_diagnostics_idle'])
check(bool(m.assess(legacy,{'total':0},legacy)['unobservable_fields']))
changed=deepcopy(s);changed['engine']['pid']=2
check(not m.assess(s,{'total':0},changed)['observed_visible_idle'])
changed=deepcopy(s);changed['engine']['build']='changed'
check(not m.assess(s,{'total':0},changed)['same_engine'])
q=deepcopy(s);q['capture_health']['recordings']['unfinished']=1
check(not m.assess(q,{'total':0},q)['known_diagnostics_idle'])
check(not m.assess(s,{},s)['known_diagnostics_idle'])
check(m.assess(s,{'total':0},s)['admission_fenced'] is False)
check(m.assess(s,{'total':0},s)['automatic_restart_authorized'] is False)
for value in [False,0.0,'0',[],None]:
 q=deepcopy(s);q['capture_health']['recordings']['unfinished']=value
 check(not m.assess(q,{'total':0},q)['known_diagnostics_idle'])
q=deepcopy(s);q['capture_health']['discovery']['inflight']=0
check(not m.assess(q,{'total':0},q)['known_diagnostics_idle'])
check(not m.assess(s,{'total':False},s)['known_diagnostics_idle'])
print('{"passed":'+str(checks)+',"scope":"busy, missing, changed, typed diagnostics, unfenced and unauthorized automatic restart; no live mutation"}')
