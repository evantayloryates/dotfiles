"""One bounded, owner-fenced Safari WebDriver viability probe; no XCTest."""
import asyncio,json,logging,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from device_observer import owned
logging.disable(logging.CRITICAL)
async def probe(r):
 from pymobiledevice3.remote.native_tunnel import NativeRemotedTunnel
 from pymobiledevice3.services.webinspector import WebinspectorService
 from pymobiledevice3.services.web_protocol.automation_session import MouseButton,MouseInteraction
 result={'xctestStarted':False,'inputSent':False,'replay':False};stage='tunnel';session=None;inspector=None
 try:
  owned(r)
  async with NativeRemotedTunnel(serial=r['serial']) as rsd:
   inspector=WebinspectorService(rsd);stage='inspector-connect';await inspector.connect();stage='discover';targets=await inspector.get_open_application_pages(timeout=1)
   app=next((t.application for t in targets if t.application.bundle=='com.apple.mobilesafari' and t.application.active),None)
   result['available']=inspector.state;result['safariActive']=app is not None
   if not app:return result
   owned(r);stage='automation-request';session=await asyncio.wait_for(inspector.automation_session(app),7)
   owned(r);stage='own-context';await asyncio.wait_for(session.start_session(),5)
   stage='own-fixture';await asyncio.wait_for(session.navigate_broswing_context('data:text/html,<button id="probe" style="position:fixed;left:30px;top:30px;width:200px;height:100px" onclick="window.result={trusted:event.isTrusted,active:navigator.userActivation.isActive,count:(window.result?.count||0)+1}">Probe</button>'),5)
   owned(r);stage='one-click';result['inputSent']=True
   await asyncio.wait_for(session.perform_mouse_interaction(100,70,MouseButton.LEFT,MouseInteraction.SINGLE_CLICK),5)
   stage='readback';result['effect']=await asyncio.wait_for(session.execute_script('return window.result||null',[]),3)
 except Exception as e:
  result.update(viable=False,failure=type(e).__name__,diagnostic=str(e)[:400])
 finally:
  if session and session.top_level_handle:
   try:await asyncio.wait_for(session.close_window(),3);result['ownedContextClosed']=True
   except Exception:result['ownedContextClosed']=False
  if inspector:
   try:await asyncio.wait_for(inspector.close(),3)
   except Exception:pass
  result['lastStage']=stage
 return result
r=json.load(sys.stdin)
try:print(json.dumps(asyncio.run(asyncio.wait_for(probe(r),32))))
except Exception as e:print(json.dumps({'viable':False,'failure':type(e).__name__,'xctestStarted':False,'replay':False}))
