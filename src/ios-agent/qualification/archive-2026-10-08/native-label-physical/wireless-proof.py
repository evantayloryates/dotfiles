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
run(['acquire','--rollout',rollout]+l)
try:
 v('ready','ready');s=a('state','wifi-off-state');assert s['wifiHandoff']['status']=='returned' and s['wifiHandoff']['requested']=='off' and not s['wifiHandoff']['wifiInterface']['ipv4Present']
 v('bundle-source','remote-metro','tailnet-Metro');a('diagnostics-probe','probe');v('network','backend');v('native-tree','native');v('react-tree','react')
 d=a('tree','nutrition-fresh');n=next(n for n in d['nodes'] if n['visible'] and n['label'].startswith('Nutrition, tab,'));r=n['rect'];a('tap','nutrition-delivery',{'snapshot':d['snapshot'],'target':n['node'],'x':r[0]+r[2]/2,'y':r[1]+r[3]/2});v('route','nutrition-committed','ClientMealLogs')
 d=a('tree','home-fresh');n=next(n for n in d['nodes'] if n['visible'] and n['label'].startswith('Home, tab,'));r=n['rect'];a('tap','home-delivery',{'snapshot':d['snapshot'],'target':n['node'],'x':r[0]+r[2]/2,'y':r[1]+r[3]/2});v('route','home-committed','ClientDashboard')
 run(['release']+l);run(['verify','idle','--timeout','10','--output',str(p/'off-idle.json')]);print(json.dumps({'updatedBinaryUnplugged':True,'wifiOffInterfaceAbsent':True,'readyBackendReactNativeMetroRoutesIdle':True}))
except:
 if lf.exists():subprocess.run(b+['release']+l,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 raise
