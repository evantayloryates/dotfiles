"""Read-only incident checks; saves only allowlisted metadata, never log lines."""
import sys, json, hashlib, subprocess, datetime, os
from pathlib import Path
ROOT = Path('/Users/taylor/dotfiles')
sys.path.insert(0, str(ROOT / 'src/onepassword'))
import keepalive, build_app
OUT = Path(__file__).parent
HOME = Path.home()
def save(name, row):
    (OUT / (name + '.json')).write_text(json.dumps(row, indent=2) + '\n')
def snapshot():
    broker = json.loads((HOME / 'Library/Caches/com.taylor.op-agent/status.json').read_text())
    state = json.loads(keepalive.STATE.read_text())
    b = {k:broker.get(k) for k in ('pid','session','tty','executable')}
    s = {k:state.get(k) for k in ('updated','started','pid','source_sha256','last_lock','app_locked','console_locked')}
    for pid in (b['pid'],s['pid']): os.kill(pid,0)
    return dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(), broker=b, keepalive=s,
                accounts=[{k:a.get(k) for k in ('last_ok','last_prompt','last_status','interval')} for a in state['accounts']])
row = snapshot()
if sys.argv[1] == 'baseline':
    save('baseline',row)
    hashes={}
    for name in ('keepalive.py','op_agent.py'):
        src=hashlib.sha256((ROOT/'src/onepassword'/name).read_bytes()).hexdigest()
        dep=hashlib.sha256((build_app.APP/'Contents/Resources'/name).read_bytes()).hexdigest()
        hashes[name]={'source':src,'deployed':dep,'equal':src==dep}
    hashes['running_keepalive_matches']=row['keepalive']['source_sha256']==hashes['keepalive.py']['source']
    hashes['signature_valid']=subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict',str(build_app.APP)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
    hashes['build_stamp_matches']=build_app.STAMP.read_text().strip()==build_app.source_hash()
    save('deployed-hashes',hashes)
    lines=keepalive.onepassword_tail()
    locked,last_lock=keepalive.app_lock_info(lines)
    save('parser-check',{'readable':not keepalive.UNREADABLE,'parsed_locked':locked,'last_lock':last_lock,'latest_event':str(keepalive.latest_event_time(lines)),'matches_state':locked==row['keepalive']['app_locked'] and last_lock==row['keepalive']['last_lock'],'raw_lines_saved':False})
    env=dict(os.environ,OP_BROKER_CALLER='fix-1p-broker/oct-22-6a')
    r=subprocess.run([str(ROOT/'bin/op'),'--version'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
    save('metadata-smoke',{'command':'/Users/taylor/dotfiles/bin/op --version','exit_code':r.returncode,'stdout_stderr':'discarded','authenticated_checks':'skipped while app locked','additional_auth_wake':False})
else:
    before=json.loads((OUT/'baseline.json').read_text())
    row.update(broker_identity_preserved=row['broker']==before['broker'],keepalive_identity_preserved=row['keepalive']['pid']==before['keepalive']['pid'],heartbeat_advanced=row['keepalive']['updated']>before['keepalive']['updated'],heartbeat_age_seconds=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.strptime(row['keepalive']['updated'], '%Y-%m-%dT%H:%M:%S%z')).total_seconds(),accounts_unchanged_while_locked=row['accounts']==before['accounts'])
    save('final-status',row)
print(json.dumps(row))
