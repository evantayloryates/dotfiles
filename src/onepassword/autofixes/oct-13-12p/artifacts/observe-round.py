"""Bounded passive observation only; does not invoke op or wake recovery."""
import json,time,datetime
from pathlib import Path
p=Path.home()/'Library/Caches/com.taylor.op-keepalive/state.json'
end=time.monotonic()+50
while time.monotonic()<end:
 s=json.loads(p.read_text())
 if all(a.get('last_status') in ('ok','ok_prompted','ok_queued') for a in s.get('accounts',[])) and not s.get('fault_episode'):
  print(json.dumps({'regularRoundRecovered':True,'updated':s['updated']}));break
 time.sleep(5)
else:print(json.dumps({'regularRoundRecovered':False,'updated':s['updated'],'observationOnly':True}))
