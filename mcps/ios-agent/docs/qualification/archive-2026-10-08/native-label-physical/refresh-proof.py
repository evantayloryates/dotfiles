import pathlib,json,subprocess,time,hashlib,os
p=pathlib.Path(__file__).parent;src=pathlib.Path('/Users/taylor/src/github/kickoff/mobile/src/components/client-nutrition/meal-logs/meal-logs-view/meal-log/index.tsx');b=['/Users/taylor/dotfiles/bin/ios-agent'];l=['--lease-file',str(p/'lease.json')];original=src.read_bytes();old=b'              {name}\n';new=b"              {name}{__DEV__ ? ' \\u00b7 refresh probe' : ''}\n";assert original.count(old)==1
backup=p/'refresh-source-before';backup.write_bytes(original);os.chmod(backup,0o600)
boot=json.loads(subprocess.check_output(b+['status']))['device']['boot'];receipt={'nativeBootBefore':boot,'sourceBeforeSHA256':hashlib.sha256(original).hexdigest(),'businessDataChanged':False}
def observe(tag,wanted):
 end=time.monotonic()+18;i=0
 while time.monotonic()<end:
  path=p/(tag+str(i)+'.json');r=subprocess.run(b+['action','tree']+l+['--output',str(path)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);i+=1
  if r.returncode:raise RuntimeError('inspection_failed_no_input_replay')
  d=json.load(open(path))['result'];labels=[n['label'] for n in d['nodes'] if n['visible']]
  found=any('refresh probe' in x for x in labels)
  if found==wanted:return d,i
  time.sleep(.5)
 raise RuntimeError('refresh_not_observed')
try:
 src.write_bytes(original.replace(old,new));start=time.monotonic();d,n=observe('refresh-changed-',True);receipt.update(changedTextObserved=True,changeObservedSeconds=round(time.monotonic()-start,3),expandedDayPreserved=any('banana' in x['label'] and x['visible'] for x in d['nodes']),nativeBootUnchanged=json.loads(subprocess.check_output(b+['status']))['device']['boot']==boot)
finally:
 current=src.read_bytes();assert current in (original,original.replace(old,new)), 'concurrent_source_change_do_not_overwrite'
 src.write_bytes(original)
d,n=observe('refresh-restored-',False);receipt.update(sourceBytesRestored=src.read_bytes()==original,originalTextRestored=True,expandedDayPreservedAfterRestore=any('banana' in x['label'] and x['visible'] for x in d['nodes']))
subprocess.run(b+['verify','route','--expect','ClientMealLogs']+l+['--timeout','10','--output',str(p/'refresh-route.json')],check=True)
(p/'refresh-summary.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
