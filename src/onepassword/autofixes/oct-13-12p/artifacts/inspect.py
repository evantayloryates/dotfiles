"""Read-only incident evidence; never persist raw logs or credential output."""
import sys,json,datetime,hashlib,subprocess
from pathlib import Path
ROOT=Path('/Users/taylor/dotfiles')
sys.path.insert(0,str(ROOT/'src/onepassword'))
import keepalive,recovery
OUT=Path(__file__).parent
HOME=Path.home()
def save(name,row):
 (OUT/name).write_text(json.dumps(row,indent=2)+'\n')
 return row
state=json.loads(keepalive.STATE.read_text())
broker=json.loads((HOME/'Library/Caches/com.taylor.op-agent/status.json').read_text())
snapshot={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'broker':broker,'keepalive':{k:state.get(k) for k in ('updated','started','pid','source_sha256','last_lock','app_locked','console_locked')},'diagnostics':recovery.diagnostics()}
print(json.dumps(save(sys.argv[1] if len(sys.argv)>1 else 'baseline.json',snapshot)))
rows=[]
labels={a['label']:i for i,a in enumerate(state['accounts'])}
log=HOME/'Library/Logs/op-broker/keepalive-2026-10.jsonl'
with log.open('rb') as f:
 f.seek(max(0,log.stat().st_size-150000))
 for line in f:
  try:r=json.loads(line)
  except ValueError:continue
  if r.get('ts','')<'2026-10-13T12:20':continue
  if r.get('event') not in ('keepalive','fault_started','fault_resolved','app_lock','app_lock_event','app_relaunch','tick_error','onepassword_log_unreadable','recovery_kick'):continue
  row={k:r[k] for k in ('ts','event','status','seconds','exit','locked','at','episode') if k in r}
  if r.get('account') in labels:row['slot']=labels[r['account']]
  rows.append(row)
save('recent-events.json',rows)
print(json.dumps({'recent_events':rows[-12:]}))
lines=keepalive.onepassword_tail()
locked,last=keepalive.app_lock_info(lines)
save('parser-check.json',{'logReadable':not bool(keepalive.UNREADABLE),'parsedLocked':locked,'parsedLastLock':last,'latestEvent':str(keepalive.latest_event_time(lines)),'keepaliveLocked':state['app_locked'],'keepaliveLastLock':state['last_lock']})
resources=ROOT/'data/op-agent/1Password CLI Broker.app/Contents/Resources'
hashes=[]
for name in ('op_agent.py','keepalive.py'):
 source=hashlib.sha256((ROOT/'src/onepassword'/name).read_bytes()).hexdigest()
 deployed=hashlib.sha256((resources/name).read_bytes()).hexdigest()
 hashes.append({'name':name,'source':source,'deployed':deployed,'matches':source==deployed})
signature=subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict',str(resources.parent.parent)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode
save('deployed-hashes.json',{'files':hashes,'runningKeepaliveMatches':state['source_sha256']==hashes[1]['source'],'signatureExit':signature})
print(json.dumps({'hashesMatch':all(x['matches'] for x in hashes),'signatureExit':signature,'parserLocked':locked}))
