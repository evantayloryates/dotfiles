"""Incident-only read-only checks; never saves CLI output or raw logs."""
import datetime, hashlib, json, os, subprocess, sys, time
from pathlib import Path

ROOT = Path('/Users/taylor/dotfiles')
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'src/onepassword'))
import keepalive, recovery
from build_app import STAMP, source_hash

def save(name, value):
    (HERE / (name + '.json')).write_text(json.dumps(value, indent=2) + '\n')
    print(json.dumps({name: value}))

def snapshot():
    s = json.loads(keepalive.STATE.read_text())
    b = json.loads((Path.home() / 'Library/Caches/com.taylor.op-agent/status.json').read_text())
    return {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'broker': {k:b.get(k) for k in ('pid','session','tty','executable')},
            'keepalive': {k:s.get(k) for k in ('updated','started','pid','source_sha256','last_lock','app_locked','console_locked','fault_episode')},
            'diagnostics': recovery.diagnostics()}

if sys.argv[1] in ('baseline','final-status'):
    save(sys.argv[1], snapshot())
elif sys.argv[1] == 'inspect':
    s = snapshot()
    app = ROOT / 'data/op-agent/1Password CLI Broker.app'
    hashes = {}
    for name in ('keepalive.py','op_agent.py'):
        a = hashlib.sha256((ROOT / 'src/onepassword' / name).read_bytes()).hexdigest()
        b = hashlib.sha256((app / 'Contents/Resources' / name).read_bytes()).hexdigest()
        hashes[name] = {'source':a,'deployed':b,'equal':a==b}
    hashes['running_keepalive_matches'] = s['keepalive']['source_sha256'] == hashes['keepalive.py']['deployed']
    hashes['build_stamp_matches'] = STAMP.read_text().strip() == source_hash()
    hashes['signature_valid'] = subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict',str(app)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode == 0
    save('deployed-hashes', hashes)
    lines = keepalive.onepassword_tail()
    locked, last = keepalive.app_lock_info(lines)
    save('parser-check', {'readable':bool(lines),'parsed_locked':locked,'last_lock':last,'latest_event':str(keepalive.latest_event_time(lines)),'matches_state':locked == s['keepalive']['app_locked'],'raw_lines_saved':False})
    rows = []
    allowed = {'keepalive','app_lock','app_lock_event','console','backoff_reset','fault_started','fault_resolved','recovery_kick','app_relaunch','tick_error','onepassword_log_unreadable'}
    for path in sorted(keepalive.LOG_DIR.glob('keepalive-*.jsonl'))[-1:]:
        for line in path.open():
            try: r = json.loads(line)
            except ValueError: continue
            stamp = recovery.safe_epoch(r.get('ts'))
            if stamp and time.time() - stamp < 3600 and r.get('event') in allowed:
                row = {k:r[k] for k in ('ts','event','status','exit','seconds','locked') if k in r}
                account = r.get('account')
                cfg = keepalive.load_config()['accounts']
                if account: row['slot'] = next((i for i,a in enumerate(cfg) if account in (a['id'],a['label'])), None)
                rows.append(row)
    save('recent-events',rows)
elif sys.argv[1] == 'smoke':
    state = recovery.diagnostics()
    assert state['app_locked'] is False and state['console_locked'] is False
    assert all(a['status'] in recovery.SUCCESS for a in state['accounts'])
    results=[]
    config=keepalive.load_config()
    for slot,account in enumerate(config['accounts']):
        start=time.monotonic()
        try:
            r=subprocess.run([str(ROOT/'bin/op'),'vault','list','--account',account['id']],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,env=dict(os.environ,OP_BROKER_CALLER='fix-1p-broker/oct-19-9p'),timeout=15)
            rc=r.returncode
        except subprocess.TimeoutExpired:
            rc='timeout'
        results.append({'slot':slot,'exit_code':rc,'seconds':round(time.monotonic()-start,3),'output_discarded':True})
        if rc != 0: break
    save('metadata-smoke',results)
