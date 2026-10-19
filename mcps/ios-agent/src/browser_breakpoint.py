"""One owned, source-fenced breakpoint window; no persistent paused debugger."""
import asyncio
import hashlib
import re


def remote_summary(value):
    if not isinstance(value,dict):return {}
    return {k:(v[:4096] if isinstance(v,str) else v) for k,v in value.items() if k in ('type','subtype','className','value','description','unserializableValue') and not isinstance(v,(dict,list))}


def property_summary(p,scrub):
    name=p.get('name','');raw=p.get('value',{})
    value=remote_summary({k:(scrub(v,name) if k in ('value','description','unserializableValue') else v) for k,v in raw.items()})
    return {'name':name[:500] if isinstance(name,str) else '', 'value':value,'hasGetter':bool(p.get('get')),'hasSetter':bool(p.get('set'))}


async def capture(session,request,command,context,check,scrub,signal=None):
    if request.get('ownedDebugSession') is not True:raise ValueError('owned_debug_session_required_for_breakpoint')
    script=request.get('scriptId');digest=request.get('sourceHash');line=request.get('lineNumber');column=request.get('columnNumber',0)
    if not isinstance(script,str) or not 1<=len(script)<=128 or not re.fullmatch('[a-f0-9]{64}',digest or '') or type(line) is not int or not 0<=line<=1000000 or type(column) is not int or not 0<=column<=1000000:
        raise ValueError('source_fenced_breakpoint_required')
    duration=request.get('sampleMs',500)
    if type(duration) is not int or not 100<=duration<=3000:raise ValueError('bounded_breakpoint_window_required')
    loop=asyncio.get_running_loop();wake=asyncio.Event();resumed=asyncio.Event();scripts=set();pause=None;paused=False;breakpoint_id=None;enable_requested=False;cleanup=[]
    methods=['Debugger.scriptParsed','Debugger.paused','Debugger.resumed'];old={m:session.response_methods.get(m) for m in methods}
    def parsed(event):scripts.add(str(event.get('params',{}).get('scriptId')))
    def on_pause(event):
        nonlocal pause,paused
        paused=True;resumed.clear()
        if pause is None:pause=event.get('params',{})
        wake.set()
    def on_resume(event):
        nonlocal paused
        paused=False;resumed.set()
    session.response_methods.update({'Debugger.scriptParsed':parsed,'Debugger.paused':on_pause,'Debugger.resumed':on_resume})
    result={'breakpointHit':False,'pauseObserved':False,'resumeConfirmed':None,'breakpointRemoved':False,'locals':[],'replay':False}
    if signal:signal('browser.inspector.breakpoint.setup', outcome='started', windowMs=duration)
    try:
        check();enable_requested=True;await command(session,'Debugger.enable')
        await asyncio.sleep(.05);check()
        if paused:raise ValueError('debug_unexpected_pause_before_breakpoint')
        if script not in scripts:raise ValueError('script_not_in_current_document')
        source=(await command(session,'Debugger.getScriptSource',scriptId=script)).get('scriptSource')
        if not isinstance(source,str):raise ValueError('script_source_unavailable')
        if paused:raise ValueError('debug_unexpected_pause_before_breakpoint')
        if hashlib.sha256(source.encode()).hexdigest()!=digest:raise ValueError('debug_script_source_changed')
        request['_contextStage']='before_breakpoint';await context();check()
        request['_breakpointRequested']=True
        installed=await command(session,'Debugger.setBreakpoint',location={'scriptId':script,'lineNumber':line,'columnNumber':column})
        breakpoint_id=installed.get('breakpointId')
        if not isinstance(breakpoint_id,str) or not breakpoint_id:raise ValueError('breakpoint_install_unconfirmed')
        check();await command(session,'Debugger.setBreakpointsActive',active=True)
        result['requestedLocation']={'scriptId':script,'lineNumber':line,'columnNumber':column}
        result['actualLocation']=installed.get('actualLocation');result['sourceHash']=digest
        deadline=loop.time()+duration/1000
        while not wake.is_set() and loop.time()<deadline:
            check()
            try:await asyncio.wait_for(wake.wait(),min(.1,max(.001,deadline-loop.time())))
            except asyncio.TimeoutError:pass
        check()
        if pause is not None:
            result['pauseObserved']=True;result['reason']=pause.get('reason')
            result['breakpointHit']=pause.get('data',{}).get('breakpointId')==breakpoint_id
            frames=pause.get('callFrames',[])
            result['callFrames']=[{'functionName':f.get('functionName'),'location':f.get('location'),'isTailDeleted':f.get('isTailDeleted'),
                                  'scopes':[{'type':s.get('type'),'name':s.get('name'),'empty':s.get('empty')} for s in f.get('scopeChain',[])],
                                  'this':remote_summary(f.get('this',{}))} for f in frames[:40]]
            result['callFramesTruncated']=len(frames)>40
            # Descriptor reads never call getters or evaluate caller expressions.
            # Only non-global scopes from the top frame; max3 bounded replies.
            scopes=[s for s in (frames[0].get('scopeChain',[]) if frames else []) if s.get('type') not in ('global','globalLexicalEnvironment') and s.get('object',{}).get('objectId')][:3]
            for scope in scopes:
                check()
                data=await command(session,'Runtime.getProperties',timeout=.5,objectId=scope['object']['objectId'],ownProperties=True,fetchStart=0,fetchCount=41,generatePreview=False)
                props=data.get('properties')
                if not isinstance(props,list):raise ValueError('breakpoint_locals_unavailable')
                result['locals'].append({'scopeType':scope.get('type'),'scopeName':scope.get('name'),'properties':[property_summary(p,scrub) for p in props[:40]],'truncated':len(props)>40})
    finally:
        # Cleanup is mandatory even after owner loss or uncertain dispatch.
        # Remove first so resuming a hot loop cannot immediately hit it again.
        if breakpoint_id:
            try:await command(session,'Debugger.removeBreakpoint',timeout=2,breakpointId=breakpoint_id);result['breakpointRemoved']=True
            except Exception:cleanup.append('Debugger.removeBreakpoint')
        if paused:
            try:
                await command(session,'Debugger.resume',timeout=2)
                await asyncio.wait_for(resumed.wait(),2)
                result['resumeConfirmed']=True
            except Exception:cleanup.append('Debugger.resume')
        if enable_requested:
            try:await command(session,'Debugger.disable',timeout=2)
            except Exception:cleanup.append('Debugger.disable')
        if pause is not None and resumed.is_set() and not paused:result['resumeConfirmed']=True
        if pause is not None and not result['pauseObserved']:
            result.update(pauseObserved=True,latePauseObserved=True,reason=pause.get('reason'),breakpointHit=pause.get('data',{}).get('breakpointId')==breakpoint_id)
        if paused and 'Debugger.resume' not in cleanup:cleanup.append('Debugger.resume')
        for m,fn in old.items():
            if fn is None:session.response_methods.pop(m,None)
            else:session.response_methods[m]=fn
        request['_breakpointCleanup']={'pauseObserved':pause is not None,'resumeConfirmed':result['resumeConfirmed'],'breakpointRemoved':result['breakpointRemoved'],'domainsDisabled':not cleanup}
        if signal:signal('browser.inspector.breakpoint.cleanup', outcome='failed' if cleanup else 'completed',
                         pauseObserved=pause is not None, resumeConfirmed=result['resumeConfirmed'] is True,
                         breakpointRemoved=result['breakpointRemoved'], cleanupFailures=len(cleanup))
        if cleanup:
            request['_cleanupFailures']=cleanup
            raise ValueError('debug_cleanup_unconfirmed')
    result.update(domainsDisabled=True,windowMs=duration,localReadPolicy='Top frame, up to3 non-global scopes,40 own descriptors each; getters never invoked; object handles omitted.')
    return scrub(result)
