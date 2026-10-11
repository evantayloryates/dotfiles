"""One candidate existing-trust handshake; no pairing records or payload output."""
import asyncio,json,logging,re,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cli import request
from device_observer import owned
logging.disable(logging.CRITICAL)
DIAGNOSTIC={"phase":"validation"}
async def pairing_probe(r):
 owned(r);state=Path(r['state']);configured=json.loads((state/'web-device.json').read_text());serial=configured.get('hardwareUDID')
 if not re.fullmatch('[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}',serial or ''):raise ValueError('fixed_device_required')
 lease=json.loads(Path(r['leaseFile']).read_text())['lease']
 DIAGNOSTIC['phase']='host_relay_start'
 started=request({'op':'developer_relay_start','lease':lease},state)
 from pymobiledevice3.remote.tunnel_service import RemotePairingTunnelService
 provider=RemotePairingTunnelService(serial,'127.0.0.1',started['port'])
 # Queue the provider's first protocol bytes before opening the phone socket.
 # This changes startup ordering, not the accepted protocol request or trust.
 pairing=asyncio.create_task(provider.connect(autopair=False))
 try:
  DIAGNOSTIC['phase']='provider_first_bytes'
  until=time.monotonic()+5
  while time.monotonic()<until:
   owned(r);status=request({'op':'developer_relay_status','lease':lease},state)
   if status.get('consumerBytes',0)>0:break
   if pairing.done():await pairing
   await asyncio.sleep(.05)
  else:raise ValueError('provider_first_bytes_unconfirmed')
  DIAGNOSTIC['phase']='native_relay_start'
  command=request({'op':'action','action':'developer-relay','args':{'route':r.get('route','direct')},'lease':lease},state)
  until=time.monotonic()+12
  while time.monotonic()<until:
   owned(r);result=request({'op':'result','id':command['id'],'lease':lease},state)
   if result.get('status')=='completed':break
   if result.get('status') not in ('queued','sent'):raise ValueError('native_relay_start_unconfirmed')
   await asyncio.sleep(.1)
  else:raise ValueError('native_relay_start_unconfirmed')
  if not result.get('result',{}).get('started'):raise ValueError('native_relay_start_unconfirmed')
  DIAGNOSTIC['phase']='existing_trust_pair_verify'
  owned(r);await asyncio.wait_for(pairing,25);owned(r)
  return {'ok':True,'existingTrustPairVerified':True,'newPairingAttempted':False,'rsdIdentityVerified':False,'secondaryListenerTested':False,'backgroundTested':False,'payloadLogged':False,'relay':request({'op':'developer_relay_status','lease':lease},state)}
 finally:
  if not pairing.done():pairing.cancel()
  await asyncio.gather(pairing,return_exceptions=True)
  await provider.close()
  try:DIAGNOSTIC['relay']=request({'op':'developer_relay_status','lease':lease},state)
  except Exception:pass
async def exercise_browser(r,rsd):
 state=Path(r['state']);lease=json.loads(Path(r['leaseFile']).read_text())['lease']
 # Release native input before acquiring a launch-only reservation. The
 # old device cancel cannot revoke this fresh capability; collisions stop.
 request({'op':'release','lease':lease},state)
 DIAGNOSTIC['phase']='launch_owner_reacquire'
 metadata=json.loads(Path(r['ownerFile']).read_text())
 fresh=request({'op':'acquire','surface':'launch','ownerFile':r['ownerFile'],'thread':metadata['id'],'turn':metadata['turn']},state)
 Path(r['leaseFile']).write_text(json.dumps({'lease':fresh['id'],'epoch':fresh['epoch']}))
 DIAGNOSTIC.update({'ownerDetached':True,'phase':'detached_secondary_chrome_launch'})
 from device_observer import browser_launch,shortcut_home
 from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
 from pymobiledevice3.services.dvt.instruments.screenshot import Screenshot
 launch=json.loads(Path(r['launchFile']).read_text())
 r.update(browser='chrome',url=launch['url'],profile='app')
 try:
  delivered=await browser_launch(r,rsd)
  await asyncio.sleep(.5);owned(r)
  if r.get('stage') == 'chrome-inspector':
   DIAGNOSTIC['phase']='chrome_page_readiness'
   until=time.monotonic()+15;page=None
   while time.monotonic()<until:
    owned(r)
    pages=request({'op':'web_pages'},state)['pages']
    page=next((p for p in pages if p['browser']=='ios-chrome' and p['visible'] and p['ready'] and p['ageMs']<3000),None)
    if page:break
    await asyncio.sleep(.2)
   if not page:raise ValueError('fresh_chrome_page_unconfirmed')
   DIAGNOSTIC['freshChromePageReady']=True
   request({'op':'release','lease':fresh['id']},state)
   fresh=request({'op':'acquire','surface':'web','page':page['id'],'ownerFile':r['ownerFile'],'thread':metadata['id'],'turn':metadata['turn']},state)
   Path(r['leaseFile']).write_text(json.dumps({'lease':fresh['id'],'epoch':fresh['epoch']}))
   async def web_command(action,args):
    cid=request({'op':'web_action','lease':fresh['id'],'action':action,'args':args},state)['id']
    until=time.monotonic()+12
    while time.monotonic()<until:
     owned(r);reply=request({'op':'web_result','lease':fresh['id'],'id':cid},state)
     if reply['status']=='completed':
      result=reply.get('result',{})
      if result.get('ok') is not True:raise ValueError('web_command_unconfirmed')
      return result['value']
     if reply['status'] not in ('queued','sent'):raise ValueError('web_command_unconfirmed')
     await asyncio.sleep(.1)
    raise ValueError('web_command_unconfirmed')
   web_state=await web_command('state',{})
   Path(r['evidenceDir'],'owned-web-state.json').write_text(json.dumps(web_state))
   if not web_state.get('indicator'):raise ValueError('web_indicator_unconfirmed')
   draft=await web_command('snapshot',{'text':'Test draft'})
   targets=[e for e in draft['elements'] if e['tag']=='input' and e['label']=='Test draft']
   if len(targets)!=1:raise ValueError('unique_fixture_input_required')
   value='Runner reflected route smoke'
   await web_command('fill',{'snapshot':draft['snapshot'],'target':targets[0]['id'],'text':value})
   save=await web_command('snapshot',{'text':'Save test draft'})
   targets=[e for e in save['elements'] if e['tag']=='button' and e['label']=='Save test draft']
   if len(targets)!=1:raise ValueError('unique_fixture_save_required')
   await web_command('click',{'snapshot':save['snapshot'],'target':targets[0]['id']})
   rendered=await web_command('snapshot',{})
   Path(r['evidenceDir'],'committed-fixture.json').write_text(json.dumps(rendered))
   DIAGNOSTIC['fixtureDraftCommitted']='Saved: '+value in rendered.get('content','')
   if not DIAGNOSTIC['fixtureDraftCommitted']:raise ValueError('fixture_commit_unconfirmed')
   DIAGNOSTIC['ownedPage']=page['id']
   from device_observer import browser_debug
   DIAGNOSTIC['phase']='detached_chrome_inspector'
   r['debug']={'browser':'chrome','op':'dom'}
   inspected=await browser_debug(r,rsd)
   Path(r['evidenceDir'],'inspector.json').write_text(json.dumps(inspected))
   rows=inspected.get('pages',[])
   DIAGNOSTIC['inspectorReadConfirmed']=bool(rows and rows[0].get('readConfirmed'))
   DIAGNOSTIC['inspectorState']=rows[0].get('state') if rows else None
   if not DIAGNOSTIC['inspectorReadConfirmed']:raise ValueError('chrome_inspector_read_unconfirmed')
  async with DvtProvider(rsd) as dvt,Screenshot(dvt) as shot:
   image=await shot.get_screenshot()
  if len(image)>12*1024*1024 or not image.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('bounded_png_required')
  Path(r['evidenceDir'],'chrome.png').write_bytes(image)
  return {'ok':True,'ownerDetached':True,'existingTrustPairVerified':True,'secondaryTunnelEstablished':True,'rsdIdentityVerified':True,'chromeLaunch':delivered,'backgroundTested':True,'newPairingAttempted':False,'payloadLogged':False,'cleanup':DIAGNOSTIC}
 finally:
  try:
   if r.get('cellular'):
    from pymobiledevice3.services.dvt.instruments.process_control import ProcessControl
    async with DvtProvider(rsd) as dvt,ProcessControl(dvt) as control:
     owned(r);await asyncio.wait_for(control.launch('com.dev.kudos.fit',kill_existing=False),6)
    DIAGNOSTIC['restoreAppRequested']=True
   else:DIAGNOSTIC['homeCleanup']=await asyncio.wait_for(shortcut_home({k:v for k,v in r.items() if k not in ('url','browser','profile')},rsd),6)
  except Exception as e:DIAGNOSTIC['homeCleanup']={'verified':False,'failureType':type(e).__name__}

async def probe(r):
 if r.get('stage','pairing') == 'pairing':return await pairing_probe(r)
 from relay_session import relayed_rsd
 r['serial']=json.loads((Path(r['state'])/'web-device.json').read_text())['hardwareUDID']
 async with relayed_rsd(r,lambda:owned(r),DIAGNOSTIC) as (rsd,transport):
  if r.get('stage') in ('chrome-launch','chrome-inspector'):return await exercise_browser(r,rsd)
  return {'ok':True,'existingTrustPairVerified':True,'secondaryTunnelEstablished':True,'rsdIdentityVerified':True,'backgroundTested':False,'newPairingAttempted':False,'payloadLogged':False,'transport':transport}

if __name__=='__main__':
 r=json.load(sys.stdin)
 try:print(json.dumps(asyncio.run(asyncio.wait_for(probe(r),90))))
 except Exception as e:
  if re.fullmatch('[a-z_]{1,120}',str(e)):DIAGNOSTIC['errorCode']=str(e)
  print(json.dumps({'ok':False,'reason':'foreground_pairing_relay_unconfirmed','failureType':type(e).__name__,**DIAGNOSTIC,'newPairingAttempted':False,'payloadLogged':False}));sys.exit(1)
