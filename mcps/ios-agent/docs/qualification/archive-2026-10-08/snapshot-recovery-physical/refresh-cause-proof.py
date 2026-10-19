from pathlib import Path
import subprocess,json,time,os,tempfile,hashlib
p=Path(__file__).parent;b=['/Users/taylor/dotfiles/bin/ios-agent'];l=['--lease-file',str(p/'refresh-lease.json')]
src=Path('/Users/taylor/src/github/kickoff/mobile/src/components/client-nutrition/meal-logs/meal-logs-view/meal-log/index.tsx');original=src.read_bytes();old=b'              {name}\n';changed=original.replace(old,b"              {name}{__DEV__ ? ' \\u00b7 refresh probe' : ''}\n");assert original.count(old)==1
backup=p/'refresh-source-before';backup.write_bytes(original);os.chmod(backup,0o600)
def a(op,name,args={}):
 r=subprocess.run(b+['action',op,'--args',json.dumps(args)]+l+['--output',str(p/(name+'.json'))],capture_output=True);assert r.returncode==0,'operation_failed_inspect_private_no_replay';return json.loads((p/(name+'.json')).read_text())['result']
def tap(d,n,name):
 r=n['rect'];return a('tap',name,{'snapshot':d['snapshot'],'target':n['node'],'x':r[0]+r[2]/2,'y':r[1]+r[3]/2})
def atomic(data):
 fd,name=tempfile.mkstemp(prefix='.runner-refresh-',suffix='.tmp',dir=src.parent)
 try:
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.chmod(name,src.stat().st_mode & 0o777);os.replace(name,src)
 finally:
  if os.path.exists(name):os.unlink(name)
receipt={'businessDataChanged':False}
try:
 d=a('tree','cause-history-fresh');n=next(n for n in d['nodes'] if n['class']=='RCTEnhancedScrollView' and n['visible'] and n['rect'][3]>600)
 a('gesture','cause-history-scroll',{'snapshot':d['snapshot'],'target':n['node'],'x':190,'y':230,'endX':190,'endY':690,'durationMs':500});d=a('tree','cause-day-fresh');n=next(n for n in d['nodes'] if n['visible'] and n['class']=='RCTViewComponentView' and n['label'].startswith('Thu, Oct 1'));tap(d,n,'cause-day-expand')
 d=a('tree','cause-expanded-baseline');assert any('banana' in n['label'] and n['visible'] for n in d['nodes']),'expanded_baseline_required'
 before=a('state','cause-state-before');receipt['before']=before.get('refreshDiagnostics')
 atomic(changed)
 for i in range(5):
  s=a('state','cause-state-'+str(i));diag=s.get('refreshDiagnostics',{});receipt['after']=diag
  if diag!=receipt['before'] and diag:break
  time.sleep(1)
 d=a('tree','cause-result-tree');labels=[n['label'] for n in d['nodes'] if n['visible']];receipt.update(changedTextObserved=any('refresh probe' in x for x in labels),expandedDayPreserved=any('banana' in x for x in labels),homeObserved=any(x.startswith('Welcome,') for x in labels))
finally:
 assert src.read_bytes() in (original,changed),'concurrent_edit_do_not_overwrite'
 if src.read_bytes()!=original:atomic(original)
 receipt['sourceBytesRestored']=src.read_bytes()==original
 (p/'refresh-cause-summary.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
 if (p/'refresh-lease.json').exists():subprocess.run(b+['release']+l,capture_output=True)
