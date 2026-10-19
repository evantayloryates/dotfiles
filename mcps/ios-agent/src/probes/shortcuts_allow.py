"""Candidate Apple AX inspection/activation for this exact Shortcut prompt only."""
import asyncio
import json
import logging
from pathlib import Path
import sys
import time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from paired_transport import paired_rsd
from device_observer import owned
from device_ax_native import element_payload
logging.disable(logging.CRITICAL)

async def probe(r):
    from pymobiledevice3.services.accessibilityaudit import AccessibilityAudit,AXAuditInspectorFocus_v1,Direction,deserialize_object
    from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
    from pymobiledevice3.services.dvt.instruments.process_control import ProcessControl
    captions=[];report={'activationSent':False,'captions':captions,'XCTestStarted':False,'replay':False}
    r['_report']=report
    async with paired_rsd(r['state'],r['serial'],lambda:owned(r)) as (rsd,transport):
        target={'springboard':'com.apple.springboard','foreground':None}.get(r.get('target'),'com.apple.shortcuts')
        pid=None
        if target:
            async with DvtProvider(rsd) as dvt,ProcessControl(dvt) as process:
                owned(r);pid=await process.process_identifier_for_bundle_identifier(target)
            if not pid:raise ValueError('shortcuts_process_unavailable')
        async with AccessibilityAudit(rsd) as audit:
            queue=asyncio.Queue()
            def focuses(v):
                if isinstance(v,AXAuditInspectorFocus_v1):return [v]
                if isinstance(v,list):return [f for child in v for f in focuses(child)]
                if isinstance(v,dict):return [f for child in v.values() for f in focuses(child)]
                return []
            async def collect():
                while True:
                    name,args=await audit._event_queue.get();owned(r)
                    for f in focuses(deserialize_object(audit._extract_event_payload(args))):queue.put_nowait((f,time.monotonic()))
            task=None
            try:
                await audit.set_app_monitoring_enabled(True);await audit.set_monitored_event_type()
                if pid:await audit._invoke('deviceSetAuditTargetPid:',pid,expects_reply=False)
                task=asyncio.create_task(collect());await asyncio.sleep(0)
                title=False;seen=set()
                for index in range(16):
                    owned(r);await audit.move_focus(Direction.First if index==0 else Direction.Next)
                    try:focus,at=await asyncio.wait_for(queue.get(),1)
                    except TimeoutError:break
                    caption=(focus.caption or '')[:400]
                    if caption in seen:break
                    seen.add(caption);captions.append(caption)
                    if 'Allow' in caption and 'Runner Open Chrome DEV' in caption and 'to open' in caption:title=True
                    if r.get('activate') is True and title and caption in ('Allow, Button','Allow, button','Allow'):
                        owned(r)
                        if time.monotonic()-at>1:raise ValueError('fresh_shortcut_prompt_required')
                        element,action=element_payload(focus.element.identifier if focus.element else None)
                        report['activationSent']='unknown'
                        await audit._invoke('deviceElement:performAction:withValue:',element,action,0,expects_reply=False)
                        report['activationSent']=True
                        await asyncio.sleep(.5)
                        break
                report.update(ok=True,promptTitleObserved=title,transport=transport,target=target)
            finally:
                if task:task.cancel();await asyncio.gather(task,return_exceptions=True)
                errors=[]
                for cleanup in (lambda:audit.set_app_monitoring_enabled(False),lambda:audit._invoke('devicePerformFinalCleanup',expects_reply=False)):
                    try:await asyncio.wait_for(cleanup(),2)
                    except Exception as e:errors.append(type(e).__name__)
                report['cleanupVerified']=not errors
                if errors:raise ValueError('ax_cleanup_unconfirmed')
    return report

if __name__=='__main__':
    r=json.load(sys.stdin)
    try:print(json.dumps(asyncio.run(asyncio.wait_for(probe(r),25))))
    except Exception as e:print(json.dumps({**r.get('_report',{}),'ok':False,'failureType':type(e).__name__,'replay':False}));sys.exit(1)
