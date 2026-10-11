"""One candidate existing-trust handshake; no pairing records or payload output."""
import asyncio,json,logging,re,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cli import request
from device_observer import owned
logging.disable(logging.CRITICAL)
DIAGNOSTIC={"phase":"validation"}
async def probe(r):
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
if __name__=='__main__':
 r=json.load(sys.stdin)
 try:print(json.dumps(asyncio.run(asyncio.wait_for(probe(r),45))))
 except Exception as e:print(json.dumps({'ok':False,'reason':'foreground_pairing_relay_unconfirmed','failureType':type(e).__name__,**DIAGNOSTIC,'newPairingAttempted':False,'payloadLogged':False}));sys.exit(1)
