import asyncio,json,os,sys,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace as Obj
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import paired_transport as p
SERIAL='00008110-001451690A21801E'
class TransportTests(unittest.IsolatedAsyncioTestCase):
 def config(self,d,**kw):
  data={'version':1,'transport':'tailnet','address':'100.106.65.81','serial':SERIAL};data.update(kw)
  f=Path(d)/'developer-tailnet.json';f.write_text(json.dumps(data));f.chmod(0o600);return f
 def test_absent_preserves_native_default(self):
  with tempfile.TemporaryDirectory() as d:self.assertIsNone(p.tailnet_config(d,SERIAL))
 def test_private_exact_device_and_fixed_tailnet_ip(self):
  with tempfile.TemporaryDirectory() as d:
   self.config(d);self.assertEqual(p.tailnet_config(d,SERIAL)['address'],'100.106.65.81')
   for data in [{'serial':'00000000-0000000000000000'},{'address':'127.0.0.1'},{'address':'192.168.1.4'},{'address':'https://host/'},{'port':22},{'transport':'auto'},{'version':True}]:
    self.config(d,**data)
    with self.assertRaises(ValueError):p.tailnet_config(d,SERIAL)
 def test_public_config_and_symlink_refused(self):
  with tempfile.TemporaryDirectory() as d:
   f=self.config(d);f.chmod(0o644)
   with self.assertRaises(ValueError):p.tailnet_config(d,SERIAL)
   f.chmod(0o600);f.write_text('x'*4097)
   with self.assertRaises(ValueError):p.tailnet_config(d,SERIAL)
   self.config(d);f.rename(f.with_suffix('.saved'));f.symlink_to(f.with_suffix('.saved'))
   with self.assertRaises(ValueError):p.tailnet_config(d,SERIAL)
   f.with_suffix('.saved').unlink()
   with self.assertRaises(ValueError):p.tailnet_config(d,SERIAL)
 async def exercise(self,fail=None):
  events=[];flag=Obj(USE_USERSPACE_TUNNEL=False)
  class Context:
   def __init__(self,name):self.name=name
   async def __aenter__(self):events.append(self.name+'-open');return self
   async def __aexit__(self,*args):events.append(self.name+'-close')
  class Tun:
   def set_peer(self,address):events.append('peer-set')
  class Tunnel(Context):
   address='fd00::1';port=123;auxiliary_metadata={};client=Obj(tun=Tun())
  class Provider:
   def __init__(self,serial,address,port):self.assertion=(serial,address,port);events.append('provider-created')
   async def connect(self,autopair):
    assert autopair is False;events.append('pair-verified')
    if fail=='pair':raise ConnectionError()
   async def close(self):events.append('provider-close')
   def start_tcp_tunnel(self):return Tunnel('tunnel')
  class Dial(Context):
   def __init__(self,*args):super().__init__('dial')
   async def dial(self,*args,**kwargs):pass
  class Rsd:
   def __init__(self,*args,**kwargs):self.udid=SERIAL if fail!='identity' else 'wrong'
   async def connect(self):events.append('rsd-open')
   async def close(self):events.append('rsd-close')
  def check():
   events.append('owner-check')
   if fail=='owner' and 'rsd-open' in events:raise ValueError('owner-expired')
  fake={'pymobiledevice3.remote':Obj(tunnel_service=flag),'pymobiledevice3.remote.tunnel_service':Obj(RemotePairingTunnelService=Provider),
   'pymobiledevice3.remote.userspace_tunnel':Obj(UserspaceDialPlane=Dial),'pymobiledevice3.remote.remote_service_discovery':Obj(RemoteServiceDiscoveryService=Rsd)}
  with tempfile.TemporaryDirectory() as d,patch.dict(sys.modules,fake):
   self.config(d)
   try:
    async with p.paired_rsd(d,SERIAL,check) as (rsd,transport):
     self.assertEqual(transport,'tailnet-paired-userspace');events.append('yield')
     if fail=='cancel':raise asyncio.CancelledError()
   except (ConnectionError,ValueError,asyncio.CancelledError):
    if fail is None:raise
   self.assertFalse(flag.USE_USERSPACE_TUNNEL)
  return events
 async def test_success_closes_only_own_resources_in_reverse_order(self):
  e=await self.exercise();self.assertEqual(e[-4:],['rsd-close','dial-close','tunnel-close','provider-close']);self.assertIn('yield',e)
 async def test_identity_mismatch_never_yields_and_closes(self):
  e=await self.exercise('identity');self.assertNotIn('yield',e);self.assertEqual(e[-4:],['rsd-close','dial-close','tunnel-close','provider-close'])
 async def test_owner_loss_never_yields_and_closes(self):
  e=await self.exercise('owner');self.assertNotIn('yield',e);self.assertEqual(e[-1],'provider-close')
 async def test_pair_failure_has_no_fallback_and_closes(self):
  e=await self.exercise('pair');self.assertNotIn('rsd-open',e);self.assertEqual(e[-1],'provider-close')
 async def test_cancellation_closes_without_global_flag_leak(self):
  e=await self.exercise('cancel');self.assertEqual(e[-4:],['rsd-close','dial-close','tunnel-close','provider-close'])
class USBRecoveryTests(unittest.IsolatedAsyncioTestCase):
 async def exercise(self,detected=True,identity=SERIAL):
  events=[]
  class Native:
   def __init__(self,serial):events.append(('serial',serial))
   async def __aenter__(self):events.append('open');return Obj(udid=identity)
   async def __aexit__(self,*args):events.append('close')
  with tempfile.TemporaryDirectory() as d,patch('connectivity.usb_attached',return_value=detected),patch.dict(sys.modules,{'pymobiledevice3.remote.native_tunnel':Obj(NativeRemotedTunnel=Native)}):
   try:
    async with p.paired_rsd(d,SERIAL,lambda:events.append('owner'),transport='usb-recovery') as (_,transport):
     self.assertEqual(transport,'usb-recovery-native-remoted');events.append('yield')
   except ValueError as e:events.append(str(e))
  return events
 async def test_positive_usb_checks_exact_identity_and_closes(self):
  e=await self.exercise();self.assertIn(('serial',SERIAL),e);self.assertIn('yield',e);self.assertEqual(e[-1],'close')
 async def test_negative_usb_does_not_open_any_provider(self):
  e=await self.exercise(False);self.assertNotIn('open',e);self.assertIn('fixed_usb_device_not_enumerated',e)
 async def test_wrong_identity_closes_without_yield(self):
  e=await self.exercise(identity='wrong');self.assertNotIn('yield',e);self.assertIn('close',e);self.assertIn('developer_device_identity_mismatch',e)
if __name__=='__main__':unittest.main()
