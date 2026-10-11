"""Pinned paired-device observer and opt-in DEV debugger. No XCTest or HID."""
import asyncio
import base64
import importlib.metadata
import json
import logging
import math
import time
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
    if r.get('kind') not in ('screen','capabilities','browser-debug','resource-profile','fixed-launch','browser-launch','shortcut-home','accessibility-audit') or not re.fullmatch(r'[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}', r.get('serial','')):
        raise ValueError('fixed_observer_request_required')
    if r['kind']=='browser-launch':
        browser_launch_arguments(r)
    if r['kind']=='accessibility-audit':
        from device_accessibility import arguments
        arguments(r.get('audit',{}))
    if r['kind']=='fixed-launch' and r.get('target') not in ('kickoff-dev','settings','safari','chrome'):
        raise ValueError('fixed_launch_target_required')
    if importlib.metadata.version('pymobiledevice3') != '11.15.5':
        raise ValueError('pinned_observer_required')
    from paired_transport import paired_rsd
    from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
    from pymobiledevice3.services.dvt.instruments.screenshot import Screenshot
    owned(r)
    r['_phase']='paired_developer_tunnel'
    async with paired_rsd(r['state'],r['serial'],lambda:owned(r)) as (rsd,transport):
        r['_phase']='service_discovery'
        services = (rsd.peer_info or {}).get('Services', {})
        caps = {label:name in services for label,name in {
            'dvt':'com.apple.instruments.dtservicehub',
            'coreDeviceScreen':'com.apple.coredevice.screencaptureservice',
            'coreDeviceTouch':'com.apple.coredevice.hid.universalhidservice',
            'webInspectorService':'com.apple.webinspector.shim.remote',
        }.items()}
        result = {'scope':'paired-device-read-only','provider':'pymobiledevice3-11.15.5','productVersion':getattr(rsd,'product_version',None),'transport':transport,'capabilities':caps,'systemInput':False,'offLANQualified':False}
        if r['kind'] == 'fixed-launch':
            from pymobiledevice3.services.dvt.instruments.process_control import ProcessControl
            bundles={'kickoff-dev':'com.dev.kudos.fit','settings':'com.apple.Preferences',
                     'safari':'com.apple.mobilesafari','chrome':'com.google.chrome.ios'}
            if r.get('target') not in bundles:raise ValueError('fixed_launch_target_required')
            r['_phase']='dvt_launch_connect'
            async def dispatch():
                async with DvtProvider(rsd) as dvt, ProcessControl(dvt) as control:
                    owned(r);r['_phase']='fixed_launch';r['_launchSent']='unknown'
                    pid=await control.launch(bundles[r['target']],kill_existing=False)
                    r['_launchSent']=True
                    return pid
            from device_foreground import launch_observed
            pid,foreground=await launch_observed(r,rsd,bundles[r['target']],dispatch,lambda:owned(r))
            result.update(scope='fixed-device-launch',target=r['target'],pid=pid,inputSent=True,
                          **foreground,replay=False,lockState='unknown',
                          outcome='developer-request-accepted')
        elif r['kind']=='browser-launch':
            result.update(await browser_launch(r,rsd))
        elif r['kind']=='shortcut-home':
            result.update(await shortcut_home(r,rsd))
        elif r['kind'] == 'screen':
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
            decoded = Image.open(io.BytesIO(image))
            width,height = decoded.size
            # DVT may return effectively uncompressed PNGs. Preserve every pixel
            # but fit below the MCP SDK10MiB JSON/base64 message limit.
            compressed = io.BytesIO()
            decoded.save(compressed, format='PNG', optimize=True)
            image = compressed.getvalue()
            if len(image) > 6 * 1024 * 1024:
                raise ValueError('screenshot_transport_limit')
            result.update(scope='whole-device-display',pngBase64=base64.b64encode(image).decode(),width=width,height=height)
        elif r['kind']=='accessibility-audit':
            from device_accessibility import capture
            result.update(await capture(r,rsd,lambda:owned(r),lambda preflight:browser_debug(preflight,rsd)))
        elif r['kind'] == 'resource-profile':
            result.update(await resource_profile(r,rsd))
        elif r['kind'] == 'browser-debug':
            result.update(await browser_debug(r,rsd))
        owned(r)
        r['_phase']='native_tunnel_close'
        return result

def browser_launch_arguments(r):
    if r.get('browser') not in ('safari','chrome') or r.get('profile','app') not in ('app','call-rig'):
        raise ValueError('fixed_browser_launch_required')
    runtime=Path(r['state'])/'dev-runtime.json'
    if runtime.is_symlink() or runtime.stat().st_mode & 0o077:
        raise ValueError('private_dev_origin_required')
    expected=browser_profile_origin(json.loads(runtime.read_text())['webURL'],r.get('profile','app'))
    url=r.get('url')
    if not isinstance(url,str) or len(url)>4096 or any(ord(c)<32 for c in url) or '\\' in url:
        raise ValueError('fixed_browser_launch_required')
    u=urlsplit(url)
    if ((u.scheme,u.hostname,u.port)!=(expected.scheme,expected.hostname,expected.port)
            or u.username or u.password or not u.path.startswith('/') or u.path.startswith('//')
            or u.fragment and not re.fullmatch(r'ios-agent=[A-Za-z0-9_-]{43}',u.fragment)):
        raise ValueError('fixed_browser_launch_required')
    return url,{'safari':'com.apple.mobilesafari','chrome':'com.google.chrome.ios'}[r['browser']]

async def browser_launch(r,rsd):
    url,bundle=browser_launch_arguments(r)
    from device_foreground import launch_observed
    async def dispatch():return await payload_launch(r,rsd,bundle,url,'browser_url_launch')
    pid,foreground=await launch_observed(r,rsd,bundle,dispatch,lambda:owned(r))
    return {'scope':'fixed-dev-browser-launch','browser':r['browser'],'profile':r.get('profile','app'),
            'pid':pid,'inputSent':True,**foreground,
            'lockState':'unknown','outcome':'developer-request-accepted','replay':False}

async def shortcut_home(r,rsd):
    # A single phone-local Apple action, provisioned as Runner Home. Neither the
    # shortcut name nor its URL/arguments are caller controlled.
    if any(k in r for k in ('url','target','browser','profile','shortcut','arguments')):
        raise ValueError('fixed_home_shortcut_required')
    pid=await payload_launch(r,rsd,'com.apple.shortcuts','shortcuts://run-shortcut?name=Runner%20Home','shortcut_home_launch')
    return {'scope':'fixed-device-home','pid':pid,'inputSent':True,'homeVerified':False,
            'lockState':'unknown','outcome':'developer-request-accepted','replay':False,
            'next':'Inspect the display independently. Shortcut acceptance does not certify Home.'}

async def payload_launch(r,rsd,bundle,url,phase):
    from pymobiledevice3.remote.core_device.app_service import AppServiceService
    import plistlib
    options={'arguments':[],'environmentVariables':{},'standardIOUsesPseudoterminals':True,
             'startStopped':False,'terminateExisting':False,'activates':True,
             'user':{'shortName':'mobile'},'platformSpecificOptions':plistlib.dumps({}),
             'payloadURL':{'relative':url}}
    r['_phase']='payload_launch_connect'
    async with AppServiceService(rsd) as service:
        owned(r);r['_phase']=phase;r['_launchSent']='unknown'
        response=await service.invoke('com.apple.coredevice.feature.launchapplication',{
            'applicationSpecifier':{'bundleIdentifier':{'_0':bundle}},
            'options':options,'standardIOIdentifiers':{}})
        r['_launchSent']=True
    owned(r)
    pid=(response.get('processToken') or {}).get('processIdentifier')
    return int(pid) if isinstance(pid,int) and not isinstance(pid,bool) and 0<pid<2**31 else None

def profile_process(row):
    """Keep only known app/browser process metrics; no command lines or identities."""
    name=row.get('name')
    allowed={'MobileSafari':'safari','Chrome':'chrome','Kickoff':'kickoff-dev',
             'KickoffDEV':'kickoff-dev','com.apple.WebKit.WebContent':'web-content',
             'WebContent':'web-content'}
    if name not in allowed:return None
    def numeric(key):
        v=row.get(key)
        return v if type(v) in (int,float) and math.isfinite(v) and v>=0 else None
    pid=numeric('pid')
    return {'process':allowed[name],'pid':pid,'cpuUsageRaw':numeric('cpuUsage'),
            'physicalFootprintBytes':numeric('physFootprint')}

async def resource_profile(r,rsd):
    from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
    from pymobiledevice3.services.dvt.instruments.sysmontap import Sysmontap
    r['_phase']='resource_profile_connect'
    samples=[];start=time.monotonic()
    async with DvtProvider(rsd) as dvt:
        tap=await Sysmontap.create(dvt,interval=500)
        attributes=[k for k in ('name','pid','cpuUsage','physFootprint') if k in tap.process_attributes_cls.__dataclass_fields__]
        async with tap:
            r['_phase']='resource_profile_sample'
            async for rows in tap.iter_processes():
                owned(r)
                processes=[p for row in rows if (p:=profile_process(row)) is not None]
                samples.append({'elapsedMs':round((time.monotonic()-start)*1000),'processes':processes[:64], 'truncated':len(processes)>64})
                if len(samples)>=3:break
    return {'scope':'paired-device-process-profile','sampleIntervalMs':500,
            'attributes':attributes,'samples':samples,'sampleCount':len(samples),
            'attribution':'process only; WebContent may serve other tabs; not page CPU or JS heap',
            'cpuUnits':'provider raw cpuUsage; not calibrated as percent',
            'missingMetrics':'null means unavailable; never zero inferred',
            'profilerStopped':True}

def browser_profile_origin(web_url,profile='app'):
    expected=urlsplit(web_url)
    if profile not in ('app','call-rig'):
        raise ValueError('fixed_web_profile_required')
    if (expected.scheme!='https' or not re.fullmatch(r'[a-z0-9-]+\.[a-z0-9-]+\.ts\.net',expected.hostname or '')
        or expected.port!=10446 or expected.username or expected.password
        or expected.path not in ('','/') or expected.query or expected.fragment):
        raise ValueError('private_dev_origin_required')
    return expected._replace(netloc=f'{expected.hostname}:{10520 if profile=="call-rig" else 10446}')

async def browser_debug(r,rsd):
    """Inspect only this service's DEV origin; richer reads require explicit debug options."""
    from pymobiledevice3.services.webinspector import WebinspectorService
    runtime=Path(r['state'])/'dev-runtime.json'
    if runtime.is_symlink() or runtime.stat().st_mode & 0o077:
        raise ValueError('private_dev_origin_required')
    expected=browser_profile_origin(json.loads(runtime.read_text())['webURL'],r.get('debug',{}).get('profile','app'))
    inspector=WebinspectorService(rsd)
    r['_phase']='web_inspector_connect'
    try:
        await inspector.connect()
        r['_phase']='web_inspector_discovery'
        targets=await inspector.get_open_application_pages(timeout=1)
        matched=[];busy=0
        for target in targets:
            if target.application.bundle not in ('com.apple.mobilesafari','com.google.chrome.ios'):continue
            chosen=r.get('debug',{}).get('browser')
            if chosen and target.application.bundle!={'safari':'com.apple.mobilesafari','chrome':'com.google.chrome.ios'}.get(chosen):continue
            # Suspended background browsers may never answer a debugger attach.
            if not target.application.active:continue
            u=urlsplit(target.page.web_url)
            if (u.scheme,u.hostname,u.port)!=(expected.scheme,expected.hostname,expected.port):continue
            if target.page.web_connection_id:busy+=1;continue
            matched.append(target)
        # Newest target first; old Safari tabs may be suspended despite an active app.
        matched.sort(key=lambda target:target.page.id_,reverse=True)
        results=[]
        # Default bootstrap read is content-free; explicit debug operations are separate below.
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
                else:
                    row={'browser':target.application.bundle,'readConfirmed':True,'state':value}
                    if r.get('debug'):
                        from browser_inspector import inspect
                        r['_phase']='web_inspector_'+r['debug']['op']
                        row['debug']=await inspect(session,r['debug'],target,expected,lambda:owned(r))
                    results.append(row)
            finally:
                # Provider has no session.close; detach its socket and stop its receiver explicitly.
                session._receive_task.cancel()
                await asyncio.gather(session._receive_task,return_exceptions=True)
                await asyncio.wait_for(inspector.teardown_inspector_socket(session.protocol.id_,target.application.id_,target.page.id_),2)
        return {'scope':'dev-origin-browser-debug','inspectorEnabled':True,'devTargets':len(matched),'busyTargets':busy,'truncated':len(matched)>1,'pages':results,'userGestureRequested':False}
    finally:
        if sys.exc_info()[0] is None:r['_phase']='web_inspector_close'
        await asyncio.wait_for(inspector.close(),2)

def main():
    r=json.load(sys.stdin)
    try:
        result=asyncio.run(asyncio.wait_for(observe(r),32 if r.get('kind')=='accessibility-audit' else 22))
        p=Path(r['output']);parent=p.parent
        if not parent.is_dir() or parent.is_symlink() or parent.stat().st_mode & 0o077:
            raise ValueError('private_observer_output_required')
        fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'w') as f:json.dump({'status':'completed','result':result},f)
        print(json.dumps({'ok':True,'scope':result['scope']}))
    except Exception as e:
        known={'InvalidServiceError':'developer_service_unavailable','WebInspectorNotEnabledError':'web_inspector_disabled','DeviceNotFoundError':'paired_device_unavailable','UserspaceTunnelUnavailableError':'paired_tunnel_unavailable','TimeoutError':'device_observation_deadline','ConnectionTerminatedError':'developer_connection_lost'}
        code=known.get(type(e).__name__,'device_observation_unavailable')
        if isinstance(e,ValueError) and str(e) in {'observer_owner_expired','pinned_observer_required','bounded_png_required','private_observer_output_required','fixed_observer_request_required','private_dev_origin_required','fresh_debug_document_required','owned_browser_session_required_for_evaluation','visible_dev_document_required','debug_document_changed','script_not_in_current_document','script_source_unavailable','debug_selector_not_found','bounded_debug_artifact_required','debug_cleanup_unconfirmed','fixed_debug_operation_required','bounded_dom_selector_required','dom_projection_unavailable','owned_debug_session_required_for_heap','bounded_heap_snapshot_required','supported_heap_snapshot_format_required','debug_loader_identity_unavailable','owned_debug_session_required_for_breakpoint','source_fenced_breakpoint_required','bounded_breakpoint_window_required','debug_script_source_changed','breakpoint_install_unconfirmed','debug_unexpected_pause_before_breakpoint','breakpoint_locals_unavailable','private_developer_tailnet_configuration_required','fixed_developer_tailnet_configuration_required','fixed_developer_tailnet_address_required','developer_device_identity_mismatch','developer_transport_already_active','fixed_launch_target_required','fixed_browser_launch_required','fixed_home_shortcut_required','fixed_foreground_target_required','foreground_cleanup_unconfirmed','fixed_accessibility_arguments_required','foreground_dev_surface_required','accessibility_service_unavailable','accessibility_check_unavailable','accessibility_cleanup_unconfirmed','accessibility_surface_changed','current_debug_worker_required','debug_worker_terminated','script_not_in_current_worker','bounded_worker_debug_required','worker_profile_incomplete'}:code=str(e)
        failure_type=type(e).__name__
        diagnostic={**({'auditRequested':True} if r.get('_auditRequested') else {}),**{k:r.get('debug',{}).get(v) for k,v in [('workerCleanup','_workerCleanup'),('breakpointRequested','_breakpointRequested'),('breakpointCleanup','_breakpointCleanup'),('heapSnapshotRequested','_heapSnapshotRequested'),('failedMethod','_failedMethod'),('cleanupFailures','_cleanupFailures'),('receiverFailureType','_receiverFailureType'),('documentChange','_documentChange')] if r.get('debug',{}).get(v)}}
        sent=r.get('_launchSent',('unknown' if r['debug']['_inputDispatched'] else False) if '_inputDispatched' in r.get('debug',{}) else ('unknown' if r.get('debug',{}).get('expression') is not None else False))
        print(json.dumps({'ok':False,'reason':code,'phase':r.get('_phase','validation'),'failureType':failure_type if re.fullmatch('[A-Za-z0-9_]{1,80}',failure_type) else 'Unknown','diagnostic':diagnostic,'inputSent':sent}))
        sys.exit(1)

if __name__=='__main__':main()
