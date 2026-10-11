"""Disabled candidate: fixed native DEV tab recovery through Apple AX.

Input was physically observed with the original XCTest runner still active.
Standalone XCTest-free and off-LAN qualification are deliberately still open.
"""
import asyncio
import time

BUNDLE='com.dev.kudos.fit'
TABS={'home':'Home, tab, 1 of 4','workouts':'Workouts, tab, 2 of 4','nutrition':'Nutrition, tab, 3 of 4','invite':'Invite, tab, 4 of 4'}

def element_payload(handle):
    if not isinstance(handle,bytes) or not 16<=len(handle)<=64:raise ValueError('bounded_ax_element_required')
    p=lambda value:{'ObjectType':'passthrough','Value':value}
    element={'ObjectType':'AXAuditElement_v1','Value':p({'PlatformElementValue_v1':p(handle)})}
    attributes={'AttributeNameValue_v1':'AXAction-2010','DisplayAsTree_v1':0,'HumanReadableNameValue_v1':'Activate',
        'IsInternal_v1':0,'PerformsActionValue_v1':1,'SettableValue_v1':0,'ValueTypeValue_v1':1}
    action={'ObjectType':'AXAuditElementAttribute_v1','Value':p({k:p(v) for k,v in attributes.items()})}
    return element,action

async def focus_press(audit,pid,tab,check,trace=None,report=None):
    """Last/previous across four observed native tabs; never a general caption tap."""
    if tab not in TABS or type(pid) is not int or pid<=0:raise ValueError('fixed_ax_native_tab_required')
    from pymobiledevice3.services.accessibilityaudit import AXAuditInspectorFocus_v1,Direction,deserialize_object
    if report is not None:report['_axPressSent']=False
    queue=asyncio.Queue();lost=False;task=None;monitoring=False;seen=[]
    def focuses(v):
        if isinstance(v,AXAuditInspectorFocus_v1):return [v]
        if isinstance(v,list):return [x for child in v for x in focuses(child)]
        if isinstance(v,dict):return [x for child in v.values() for x in focuses(child)]
        return []
    async def collect():
        nonlocal lost
        while True:
            name,args=await audit._event_queue.get()
            data=deserialize_object(audit._extract_event_payload(args))
            check()
            if name=='hostAppStateChanged:' and isinstance(data,dict):
                if trace is not None and len(trace)<16:trace.append({'target':data.get('displayID')==BUNDLE,'state':data.get('state')})
                if data.get('displayID')==BUNDLE:
                    if data.get('state') in (2,4):lost=True
                    elif data.get('state')==8:lost=False
            for f in focuses(data):queue.put_nowait((f,time.monotonic()))
    try:
        check();monitoring=True
        await audit.set_app_monitoring_enabled(True)
        await audit.set_monitored_event_type()
        await audit._invoke('deviceSetAuditTargetPid:',pid,expects_reply=False)
        task=asyncio.create_task(collect());await asyncio.sleep(0)
        # AX focus can persist across connections. A Last command emits no
        # event when already at Last. Move to First once, then resolve Last
        # freshly; this is inspector focus only, never a repeated activation.
        check();await audit.move_focus(Direction.First)
        try:await asyncio.wait_for(queue.get(),1)
        except TimeoutError:pass
        while not queue.empty():queue.get_nowait()
        for step in range(4):
            check()
            if lost:raise ValueError('ax_native_surface_changed')
            await audit.move_focus(Direction.Last if step==0 else Direction.Previous)
            try:f,at=await asyncio.wait_for(queue.get(),1.5)
            except TimeoutError:return {'ok':False,'reason':'ax_native_focus_unconfirmed','axPressSent':False,'replay':False}
            caption=f.caption or '';expected=TABS[tab]
            if caption not in {c for label in TABS.values() for c in (label,label+', Button',label+', Button, Selected')}:
                return {'ok':False,'reason':'fixed_ax_native_tab_order_required','axPressSent':False,'replay':False,'observedCaption':caption[:300]}
            seen.append(caption)
            if caption not in (expected,expected+', Button',expected+', Button, Selected'):continue
            if caption==expected+', Button, Selected':
                return {'ok':True,'tab':tab,'alreadySelected':True,'selectedAXObserved':True,'axPressSent':False,'effectVerified':False,'replay':False,'focusSteps':len(seen)}
            check()
            if lost or time.monotonic()-at>2:raise ValueError('ax_native_surface_changed')
            element,action=element_payload(f.element.identifier if f.element else None)
            r={'ok':True,'tab':tab,'axPressSent':'unknown','effectVerified':False,'replay':False,'focusSteps':len(seen)}
            if report is not None:report['_axPressSent']='unknown'
            try:
                await audit._invoke('deviceElement:performAction:withValue:',element,action,0,expects_reply=False)
                r['axPressSent']=True
                if report is not None:report['_axPressSent']=True
            except Exception:r.update(ok=False,reason='ax_native_press_unknown')
            # Fire-and-forget dispatch only queues the native activation. An
            # immediate final cleanup preceded an unchanged selection. Preserve
            # the channel for the bounded interval qualified on another tab;
            # this is not a retry or a claim of selected-tab verification.
            await asyncio.sleep(.5);check()
            if lost:raise ValueError('ax_native_surface_changed')
            r['settleMs']=500
            return r
        return {'ok':False,'reason':'fixed_ax_native_tab_not_found','axPressSent':False,'replay':False}
    finally:
        if task:
            task.cancel();await asyncio.gather(task,return_exceptions=True)
        errors=[]
        if monitoring:
            for op in (lambda:audit.set_app_monitoring_enabled(False),lambda:audit._invoke('devicePerformFinalCleanup',expects_reply=False)):
                try:await asyncio.wait_for(op(),2)
                except Exception as e:errors.append(e)
        if errors:raise ValueError('ax_native_cleanup_unconfirmed') from errors[0]

async def native_tab(r,rsd,check):
    if r.get('experimentalAX') is not True or r.get('axTab') not in TABS:
        raise ValueError('experimental_ax_native_tab_required')
    from pymobiledevice3.services.accessibilityaudit import AccessibilityAudit
    from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
    from pymobiledevice3.services.dvt.instruments.process_control import ProcessControl
    from device_foreground import launch_observed,SERVICE
    if SERVICE not in (rsd.peer_info or {}).get('Services',{}):raise ValueError('accessibility_service_unavailable')
    async def dispatch():
        async with DvtProvider(rsd) as dvt,ProcessControl(dvt) as control:
            check();r['_phase']='ax_native_launch';r['_launchSent']='unknown'
            pid=await control.launch(BUNDLE,kill_existing=False);r['_launchSent']=True;return pid
    # Already-foreground launches may emit no transition. Reuse the existing
    # fresh native foreground signal, never infer foreground from a running PID.
    from device_accessibility import foreground as native_foreground
    try:
        current=await native_foreground(r,'kickoff-dev','app',check,None)
    except ValueError as error:
        if str(error)!='foreground_dev_surface_required':raise
        current=None
    if current:
        async with DvtProvider(rsd) as dvt,ProcessControl(dvt) as control:
            check();pid=await control.process_identifier_for_bundle_identifier(BUNDLE)
        foreground={'foregroundVerified':True,'foregroundEvidence':{'provider':'fresh-native-bridge','bundle':BUNDLE,'boot':current['boot'],'hostEpoch':current['hostEpoch']}}
        r['_launchSent']=False
    else:pid,foreground=await launch_observed(r,rsd,BUNDLE,dispatch,check)
    if not foreground.get('foregroundVerified'):
        return {'scope':'experimental-ax-native-tab','inputSent':True,'axPressSent':False,'ok':False,'reason':'ax_native_foreground_unconfirmed','replay':False,**foreground}
    check();r['_phase']='ax_native_focus_press'
    async with AccessibilityAudit(rsd) as audit:
        r['_axStateTrace']=[]
        result=await focus_press(audit,pid,r['axTab'],check,r['_axStateTrace'],r)
    return {'scope':'experimental-ax-native-tab','inputSent':r.get('_launchSent',False) or result.get('axPressSent',False),**result,'foregroundVerified':True,
        'foregroundEvidence':foreground['foregroundEvidence'],'XCTestStarted':False,
        'standaloneXCTestFreeQualified':False,'offLANQualified':False,
        'next':'Inspect native readiness and the selected tab independently. This candidate is not an approval-free system-input guarantee.'}
