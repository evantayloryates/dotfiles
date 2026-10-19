"""Bounded single Allow activation, only after own Safari microphone prompt evidence."""
import asyncio,json,logging,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from device_observer import owned
logging.disable(logging.CRITICAL)
async def probe(r):
 from pymobiledevice3.remote.native_tunnel import NativeRemotedTunnel
 from pymobiledevice3.services.accessibilityaudit import AccessibilityAudit
 result={'inputSent':False,'xctestStarted':False,'replay':False,'visited':0};saw_microphone=False;saw_origin=False;allow=None
 async with NativeRemotedTunnel(serial=r['serial']) as rsd:
  async with AccessibilityAudit(rsd) as audit:
   try:
    async for focused in audit.iter_elements():
     owned(r);result['visited']+=1;caption=(focused.caption or '')
     saw_microphone|='microphone' in caption.lower();saw_origin|=r['host'] in caption
     if caption.strip().lower()=='allow':allow=focused.element.identifier
     if result['visited']>=40:break
    result['allowTargetFound']=allow is not None
    if allow is not None and saw_microphone and saw_origin:
     owned(r);result['inputSent']=True;await audit.perform_press(allow);result['providerAccepted']=True
   finally:
    await audit.set_app_monitoring_enabled(False);await audit.set_monitored_event_type(0);await audit.set_show_visuals(False)
 result.update(promptTextFound=saw_microphone,devHostFound=saw_origin);return result
r=json.load(sys.stdin)
try:print(json.dumps(asyncio.run(asyncio.wait_for(probe(r),18))))
except Exception as e:print(json.dumps({'failure':type(e).__name__,'qualified':False,'replay':False}))
