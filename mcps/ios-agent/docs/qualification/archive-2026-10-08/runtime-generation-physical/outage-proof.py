from pathlib import Path
import subprocess,json,time,os,re,signal
p=Path(__file__).parent/'worker-outage';p.mkdir(mode=0o700,exist_ok=True);b=['/Users/taylor/dotfiles/bin/ios-agent'];rollout='/Users/taylor/.codex/sessions/2026/10/07/rollout-2026-10-07T11-16-06-01a116ef-a3ad-74c3-ad32-6869c9c14e03.jsonl';lf=p/'before-lease.json';l=['--lease-file',str(lf)]
def run(args):
 r=subprocess.run(b+args,capture_output=True);assert r.returncode==0,'failed_check_private_receipt_no_replay';return r
s=json.loads(run(['status']).stdout);assert s['lease'] is None and not s['reactFrontendRunning'] and not s['reactFrontendCleanupPending'];boot=s['device']['boot']
run(['acquire','--rollout',rollout]+l);run(['verify','ready','--timeout','12']+l+['--output',str(p/'before-ready.json')])
raw=subprocess.check_output(['launchctl','print',f'gui/{os.getuid()}/com.taylor.ios-agent'],text=True);pid=int(re.search(r'^\s*pid = (\d+)$',raw,re.M).group(1));del raw
paused=False
try:
 os.kill(pid,signal.SIGSTOP);paused=True;start=time.monotonic();time.sleep(35)
finally:
 if paused:os.kill(pid,signal.SIGCONT)
time.sleep(.5)
s=json.loads(run(['status']).stdout);assert s['lease'] is None,'old_lease_survived_outage';lf.unlink();receipt={'scope':'scoped-ios-agent-worker-unavailable; actual-machine-sleep-not-tested','pausedSeconds':round(time.monotonic()-start,1),'oldLeaseRevoked':True,'releaseReason':s['lastRelease']['reason'],'readCommandUnknownCount':sum(v=='unknown' for v in s['commands'].values()),'nativeBootUnchanged':s.get('device',{}).get('boot')==boot,'inputSubmittedDuringOutage':False,'inputReplayed':False}
run(['verify','idle','--timeout','12','--output',str(p/'after-idle.json')]);receipt['nativeAndFrontendIdleVerified']=True
lf=p/'after-lease.json';l=['--lease-file',str(lf)];start=time.monotonic();run(['acquire','--rollout',rollout]+l)
try:
 run(['verify','ready','--timeout','12']+l+['--output',str(p/'after-ready.json')]);receipt['reacquireReadyMs']=round((time.monotonic()-start)*1000)
 run(['verify','bundle-source','--expect','tailnet-Metro','--timeout','10']+l+['--output',str(p/'after-source.json')]);receipt['remoteMetroRecovered']=True
finally:run(['release']+l)
run(['verify','idle','--timeout','12','--output',str(p/'final-idle.json')]);receipt['finalIdleVerified']=True;(p/'summary.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
