"""Pinned, read-only paired-device observer. No XCTest, HID, prompts or raw logs."""
import asyncio
import base64
import importlib.metadata
import json
import logging
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit
from cli import request

logging.disable(logging.CRITICAL)

def owned(r):
    owner=json.loads(Path(r['ownerFile']).read_text())
    if owner.get('active') is not True:raise ValueError('observer_owner_expired')
    lease = json.loads(Path(r['leaseFile']).read_text())['lease']
    status = request({'op':'status'}, Path(r['state']), timeout=2)
    if not lease or (status.get('lease') or {}).get('id') != lease:
        raise ValueError('observer_owner_expired')

async def observe(r):
    r['_phase']='validation'
    if r.get('kind') not in ('screen','capabilities','browser-debug') or not re.fullmatch(r'[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}', r.get('serial','')):
        raise ValueError('fixed_observer_request_required')
    if importlib.metadata.version('pymobiledevice3') != '11.15.5':
        raise ValueError('pinned_observer_required')
    from pymobiledevice3.remote.native_tunnel import NativeRemotedTunnel
    from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
    from pymobiledevice3.services.dvt.instruments.screenshot import Screenshot
    owned(r)
    r['_phase']='native_tunnel'
    async with NativeRemotedTunnel(serial=r['serial']) as rsd:
        r['_phase']='service_discovery'
        services = (rsd.peer_info or {}).get('Services', {})
        caps = {label:name in services for label,name in {
            'dvt':'com.apple.instruments.dtservicehub',
            'coreDeviceScreen':'com.apple.coredevice.screencaptureservice',
            'coreDeviceTouch':'com.apple.coredevice.hid.universalhidservice',
            'webInspectorService':'com.apple.webinspector.shim.remote',
        }.items()}
        result = {'scope':'paired-device-read-only','provider':'pymobiledevice3-11.15.5','transport':'native-remoted','capabilities':caps,'systemInput':False,'offLANQualified':False}
        if r['kind'] == 'screen':
            owned(r)
            r['_phase']='dvt_connect'
            async with DvtProvider(rsd) as dvt, Screenshot(dvt) as screenshot:
                r['_phase']='screen_capture'
                image = await screenshot.get_screenshot()
                r['_phase']='dvt_close'
            r['_phase']='png_validation'
            if len(image)>12*1024*1024 or not image.startswith(b'\x89PNG\r\n\x1a\n'):
                raise ValueError('bounded_png_required')
            from PIL import Image
            import io
            width,height = Image.open(io.BytesIO(image)).size
            result.update(scope='whole-device-display',pngBase64=base64.b64encode(image).decode(),width=width,height=height)
        elif r['kind'] == 'browser-debug':
            result.update(await browser_debug(r,rsd))
        owned(r)
        r['_phase']='native_tunnel_close'
        return result

async def browser_debug(r,rsd):
    """Fixed, content-free inspection of this service's development origin only."""
    from pymobiledevice3.services.webinspector import WebinspectorService
    runtime=Path(r['state'])/'dev-runtime.json'
    if runtime.is_symlink() or runtime.stat().st_mode & 0o077:
        raise ValueError('private_dev_origin_required')
    expected=urlsplit(json.loads(runtime.read_text())['webURL'])
    if expected.scheme!='https' or not expected.hostname or not expected.hostname.endswith('.ts.net'):
        raise ValueError('private_dev_origin_required')
    inspector=WebinspectorService(rsd)
    r['_phase']='web_inspector_connect'
    try:
        await inspector.connect()
        r['_phase']='web_inspector_discovery'
        targets=await inspector.get_open_application_pages(timeout=1)
        matched=[];busy=0
        for target in targets:
            if target.application.bundle not in ('com.apple.mobilesafari','com.google.chrome.ios'):continue
            # Suspended background browsers may never answer a debugger attach.
            if not target.application.active:continue
            u=urlsplit(target.page.web_url)
            if (u.scheme,u.hostname,u.port)!=(expected.scheme,expected.hostname,expected.port):continue
            if target.page.web_connection_id:busy+=1;continue
            matched.append(target)
        # Newest target first; old Safari tabs may be suspended despite an active app.
        matched.sort(key=lambda target:target.page.id_,reverse=True)
        results=[]
        # No console enabling, URL/title/body text, credentials, heap snapshots or arbitrary JS.
        expression="""(()=>{const s=window.__iosWebAgent?.status?.();let tab=false,resume=false;try{tab=!!sessionStorage.getItem('ios-agent-page');resume=!!localStorage.getItem('ios-agent-browser-resume')}catch{};return {originMatches:location.origin===EXPECTED_ORIGIN,ready:document.readyState,visible:!document.hidden,loaderPresent:!!document.getElementById('ios-agent-loader'),sdkPresent:!!window.__iosWebAgent,sdkConnected:s?.connected===true,sdkOwned:s?.owned===true,indicator:s?.indicator===true,tabCredentialPresent:tab,browserResumePresent:resume,secureContext:isSecureContext,mediaAPI:typeof navigator.mediaDevices?.getUserMedia==='function',userActivation:navigator.userActivation?.isActive===true,domElements:Math.min(document.getElementsByTagName('*').length,100000),scripts:document.scripts.length}})()""".replace('EXPECTED_ORIGIN',json.dumps(f'https://{expected.netloc}'))
        for target in matched[:1]:
            owned(r);r['_phase']='web_inspector_attach'
            session=await inspector.inspector_session(target.application,target.page)
            try:
                r['_phase']='web_inspector_runtime_enable'
                await asyncio.wait_for(session.runtime_enable(),4)
                owned(r)
                r['_phase']='web_inspector_fixed_read'
                response=await asyncio.wait_for(session.send_command('Runtime.evaluate',expression=expression,returnByValue=True,userGesture=False,doNotPauseOnExceptionsAndMuteConsole=True),4)
                if 'message' in response.get('params',{}):response=json.loads(response['params']['message'])
                value=response.get('result',{}).get('result',{}).get('value')
                if not isinstance(value,dict) or not value.get('originMatches'):
                    results.append({'browser':target.application.bundle,'readConfirmed':False})
                else:results.append({'browser':target.application.bundle,'readConfirmed':True,'state':value})
            finally:
                # Provider has no session.close; detach its socket and stop its receiver explicitly.
                session._receive_task.cancel()
                await asyncio.gather(session._receive_task,return_exceptions=True)
                await inspector.teardown_inspector_socket(session.protocol.id_,target.application.id_,target.page.id_)
        return {'scope':'dev-origin-browser-debug','inspectorEnabled':True,'devTargets':len(matched),'busyTargets':busy,'truncated':len(matched)>1,'pages':results,'userGestureRequested':False}
    finally:
        if sys.exc_info()[0] is None:r['_phase']='web_inspector_close'
        await inspector.close()

def main():
    r=json.load(sys.stdin)
    try:
        result=asyncio.run(asyncio.wait_for(observe(r),22))
        p=Path(r['output']);parent=p.parent
        if not parent.is_dir() or parent.is_symlink() or parent.stat().st_mode & 0o077:
            raise ValueError('private_observer_output_required')
        fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'w') as f:json.dump({'status':'completed','result':result},f)
        print(json.dumps({'ok':True,'scope':result['scope']}))
    except Exception as e:
        known={'InvalidServiceError':'developer_service_unavailable','WebInspectorNotEnabledError':'web_inspector_disabled','DeviceNotFoundError':'paired_device_unavailable','TimeoutError':'device_observation_deadline','ConnectionTerminatedError':'developer_connection_lost'}
        code=known.get(type(e).__name__,'device_observation_unavailable')
        if isinstance(e,ValueError) and str(e) in {'observer_owner_expired','pinned_observer_required','bounded_png_required','private_observer_output_required','fixed_observer_request_required','private_dev_origin_required'}:code=str(e)
        print(json.dumps({'ok':False,'reason':code,'phase':r.get('_phase','validation'),'inputSent':False}))
        sys.exit(1)

if __name__=='__main__':main()
