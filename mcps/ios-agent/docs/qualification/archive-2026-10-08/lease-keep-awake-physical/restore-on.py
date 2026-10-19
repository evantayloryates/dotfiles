import pathlib,json,subprocess,time
root=pathlib.Path(__file__).parent;p=root/'unplugged';p.mkdir(mode=0o700,exist_ok=True);b=['/Users/taylor/dotfiles/bin/ios-agent'];rollout='/Users/taylor/.codex/sessions/2026/10/07/rollout-2026-10-07T11-16-06-01a116ef-a3ad-74c3-ad32-6869c9c14e03.jsonl';lf=p/'lease.json';l=['--lease-file',str(lf)]
def run(args):
 r=subprocess.run(b+args,stdout=subprocess.PIPE,stderr=subprocess.PIPE);assert r.returncode==0,'operation_failed_inspect_private_receipt_no_replay';return r

def a(op,name,args={}):
 run(['action',op,'--args',json.dumps(args)]+l+['--output',str(p/(name+'.json'))]);return json.load(open(p/(name+'.json')))['result']
def v(gate,name,exp=None):
 args=['verify',gate]+l+['--timeout','12','--output',str(p/(name+'.json'))]
 if exp:args+=['--expect',exp]
 run(args)
p=root/'restore-on';p.mkdir(mode=0o700,exist_ok=True);lf=p/'handoff-lease.json';l=['--lease-file',str(lf)]
run(['acquire','--rollout',rollout]+l)
try:
 a('wifi','on-request',{'state':'on'})
finally:
 if lf.exists():run(['release']+l)
lf=p/'verify-lease.json';l=['--lease-file',str(lf)]
run(['acquire','--rollout',rollout]+l)
try:
 v('ready','ready');s=a('state','returned-state')
 assert s['wifiHandoff']['status']=='returned' and s['wifiHandoff']['requested']=='on', 'callback_not_confirmed'
 deadline=time.monotonic()+12
 while s['wifiHandoff']['wifiInterface']['ipv4Present'] is not True and time.monotonic()<deadline:
  time.sleep(.5);s=a('state','association-'+str(time.time_ns()))
 assert s['wifiHandoff']['wifiInterface']['ipv4Present'] is True, 'wifi_association_not_confirmed'
 v('route','home','ClientDashboard')
finally:
 if lf.exists():run(['release']+l)
run(['verify','idle','--timeout','10','--output',str(p/'idle.json')])
print(json.dumps({'wifiOnCallback':True,'wifiIPv4Association':True,'homeAndIdle':True}))
