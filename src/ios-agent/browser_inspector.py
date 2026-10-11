"""Bounded on-demand WebKit diagnostics; content stays in private MCP artifacts."""
import asyncio
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from browser_heap import MAX_HEAP_BYTES, project_snapshot

MAX_BYTES = 2 * 1024 * 1024


def scrub(value, key=''):
    if re.search(r'password|authorization|cookie|token|secret', key, re.I):
        if isinstance(value,str) and re.fullmatch(r'.{4}….{4}',value):return value
        if isinstance(value,str) and len(value)>12:return value[:4]+'…'+value[-4:]
        return '<redacted>'
    if key.lower() in ('url','documenturl') and isinstance(value,str):return safe_url(value)
    if key=='postData' and isinstance(value,str):
        try:return json.dumps(scrub(json.loads(value)))
        except (ValueError,TypeError):return value
    if isinstance(value,dict):return {k:scrub(v,k) for k,v in value.items()}
    if isinstance(value,list):return [scrub(v) for v in value]
    return value


def safe_url(value):
    try:
        u=urlsplit(value)
        return urlunsplit((u.scheme,u.netloc.rsplit('@',1)[-1],u.path,'',''))[:2000]
    except ValueError:return '<invalid-url>'


class ProtocolError(RuntimeError):
    pass


async def command(session, method, timeout=4, **args):
    session._ios_agent_last_method=method
    try:
        response=await asyncio.wait_for(session.send_command(method,**args),timeout)
    except asyncio.TimeoutError:
        receiver=getattr(session,'_receive_task',None)
        if receiver and receiver.done() and not receiver.cancelled():
            error=receiver.exception()
            if error:
                session._ios_agent_receiver_failure=type(error).__name__
        raise
    if isinstance(response,dict) and 'message' in response.get('params',{}):
        response=json.loads(response['params']['message'])
        if 'error' in response:raise ProtocolError(method)
        return response.get('result',{})
    if isinstance(response,dict) and 'error' in response:raise ProtocolError(method)
    return response


class Events:
    def __init__(self):self.rows=[];self.bytes=0;self.dropped=0
    def add(self,method,params,received_elapsed_ms=None):
        if method=='Debugger.scriptParsed':
            # Source-map data URLs and provider extras can dwarf the catalog.
            # Retain only source references; source content has its own window.
            params={k:(safe_url(v) if k in ('url','sourceMapURL') else v) for k,v in params.items()
                    if k in ('scriptId','url','startLine','startColumn','endLine','endColumn','sourceMapURL','isModule')}
        if method in ('Network.webSocketFrameReceived','Network.webSocketFrameSent'):
            params=dict(params);frame=dict(params.get('response') or {})
            payload=frame.pop('payloadData',None)
            if frame.get('opcode')==1 and isinstance(payload,str):
                try: frame['payloadData']=scrub(json.loads(payload))
                except (ValueError,TypeError): frame['payloadData']=re.sub(r'(?i)Bearer ([A-Za-z0-9._~+/-]{13,}=*)',lambda m:'Bearer '+m[1][:4]+'…'+m[1][-4:],payload)
            elif payload is not None:frame['payloadOmitted']='binary; use explicit audio capture for media'
            params['response']=frame
        row=scrub({'method':method,'params':params})
        if received_elapsed_ms is not None:row['receivedElapsedMs']=received_elapsed_ms
        size=len(json.dumps(row).encode())
        if len(self.rows)>=1000 or self.bytes+size>MAX_BYTES:
            self.dropped+=1;return
        self.rows.append(row);self.bytes+=size


async def inspect(session, request, target, expected, check):
    request['_inputDispatched']=False
    request['_contextStage']='initial'
    op=request.get('op','overview')
    allowed={'overview','dom','sources','source','styles','console','trace','network','profile','resources','workers','heap','evaluate'}
    if op not in allowed:raise ValueError('fixed_debug_operation_required')
    reference=request.get('documentRef')
    if op in ('source','evaluate','heap') and not re.fullmatch('[a-f0-9]{32}',reference or ''):
        raise ValueError('fresh_debug_document_required')
    if op=='heap' and request.get('ownedDebugSession') is not True:
        raise ValueError('owned_debug_session_required_for_heap')
    if request.get('expression') is not None and (not request.get('ownedPage') or not reference):
        raise ValueError('owned_browser_session_required_for_evaluation')
    context_expression="""(()=>{const s=window.__iosWebAgent?.status?.();return {originMatches:location.origin===ORIGIN,visible:!document.hidden,timeOrigin:performance.timeOrigin,page:s?.page,owned:s?.owned===true,indicator:s?.indicator===true,ready:document.readyState}})()""".replace('ORIGIN',json.dumps(f'https://{expected.netloc}'))
    async def loader():
        check();frame=(await command(session,'Page.getResourceTree')).get('frameTree',{}).get('frame',{})
        identity=[frame.get('id'),frame.get('loaderId')]
        if not all(isinstance(x,str) and 0<len(x)<=500 for x in identity):raise ValueError('debug_loader_identity_unavailable')
        return identity
    async def context():
        check()
        before=await loader()
        data=await command(session,'Runtime.evaluate',expression=context_expression,returnByValue=True,userGesture=False,doNotPauseOnExceptionsAndMuteConsole=True)
        value=data.get('result',{}).get('value',{})
        after=await loader()
        if not value.get('originMatches') or value.get('visible') is not True or type(value.get('timeOrigin')) not in (int,float):
            raise ValueError('visible_dev_document_required')
        ref=hashlib.sha256(json.dumps([target.application.bundle,target.application.id_,target.page.id_,*after]).encode()).hexdigest()[:32]
        if before!=after or reference and ref!=reference:
            request['_documentChange']={'stage':request['_contextStage'],'observedRef':ref,'timeOrigin':value['timeOrigin'],
                'targetHash':hashlib.sha256(json.dumps([target.application.bundle,target.application.id_,target.page.id_]).encode()).hexdigest()[:32]}
            raise ValueError('debug_document_changed')
        value['frameLoaderHash']=hashlib.sha256(json.dumps(after).encode()).hexdigest()[:32]
        if request.get('expression') is not None and (value.get('page')!=request['ownedPage'] or value.get('owned') is not True or value.get('indicator') is not True):
            raise ValueError('owned_browser_session_required_for_evaluation')
        return ref,value
    document,ctx=await context()
    result={'operation':op,'documentRef':document,'documentIdentity':{'timeOrigin':ctx['timeOrigin'],'frameLoaderHash':ctx['frameLoaderHash'],
        'targetHash':hashlib.sha256(json.dumps([target.application.bundle,target.application.id_,target.page.id_]).encode()).hexdigest()[:32]},
        'browser':target.application.bundle,'ready':ctx['ready'],'scope':'paired-dev-WebKit-Inspector','userGestureRequested':False,'replay':False}
    if op=='overview':return {**result,'domainsDisabled':True}
    domains=[];events=Events();old_handlers={};paused=False;timeline_requested=False;profile_requested=False
    worker_tasks=[];worker_ids=set();worker_initialized=[]
    async def initialize_worker(worker_id):
        # Enabling Worker can suspend newly reported workers. This is mandatory
        # release cleanup, so it must run even if ownership expires afterward.
        await command(session,'Worker.initialized',timeout=2,workerId=worker_id)
        worker_initialized.append(worker_id)
    resource_requested=[];resource_clock=asyncio.get_running_loop().time()
    def handler(method):
        def record(event):
            nonlocal paused
            if method=='Debugger.paused':paused=True
            if method=='Worker.workerCreated':
                worker_id=event.get('params',{}).get('workerId')
                if isinstance(worker_id,str) and worker_id not in worker_ids:
                    worker_ids.add(worker_id)
                    worker_tasks.append(asyncio.create_task(initialize_worker(worker_id)))
            elapsed=round((asyncio.get_running_loop().time()-resource_clock)*1000,3) if op=='resources' else None
            events.add(method,event.get('params',{}),elapsed)
        return record
    async def enable(domain):
        # Track before dispatch: even an uncertain enable must get a cleanup attempt.
        domains.append(domain)
        check();await command(session,domain+'.enable')
    async def evaluate():
        request['_contextStage']='before_expression'
        await context();check()
        request['_inputDispatched']=True
        return await command(session,'Runtime.evaluate',expression=request['expression'],returnByValue=True,userGesture=False,doNotPauseOnExceptionsAndMuteConsole=False)
    try:
        methods={'sources':['Debugger.scriptParsed','Debugger.scriptFailedToParse','Debugger.paused'],
                 'source':['Debugger.scriptParsed','Debugger.paused'],
                 'console':['Console.messageAdded','Console.messageRepeatCountUpdated','Console.messagesCleared'],
                 'trace':['Timeline.eventRecorded','Timeline.recordingStarted','Timeline.recordingStopped'],
                 'network':['Network.requestWillBeSent','Network.responseReceived','Network.dataReceived','Network.loadingFinished','Network.loadingFailed','Network.requestServedFromMemoryCache','Network.webSocketCreated','Network.webSocketWillSendHandshakeRequest','Network.webSocketHandshakeResponseReceived','Network.webSocketFrameReceived','Network.webSocketFrameSent','Network.webSocketFrameError','Network.webSocketClosed'],
                 'workers':['Worker.workerCreated','Worker.workerTerminated'],
                 'profile':['ScriptProfiler.trackingStart','ScriptProfiler.trackingUpdate','ScriptProfiler.trackingComplete'],
                 'resources':['Memory.trackingStart','Memory.trackingUpdate','Memory.trackingComplete','Memory.memoryPressure',
                              'CPUProfiler.trackingStart','CPUProfiler.trackingUpdate','CPUProfiler.trackingComplete']} .get(op,[])
        for method in methods:
            old_handlers[method]=session.response_methods.get(method)
            session.response_methods[method]=handler(method)
        if op in ('sources','source'):
            await enable('Debugger')
            await asyncio.sleep(.05)
            scripts=[row['params'] for row in events.rows if row['method']=='Debugger.scriptParsed']
            result['scripts']=[{k:(safe_url(v) if k in ('url','sourceMapURL') else v) for k,v in p.items() if k in ('scriptId','url','startLine','startColumn','endLine','endColumn','sourceMapURL','isModule')} for p in scripts]
            if op=='source':
                script_id=request.get('scriptId')
                if not any(str(p.get('scriptId'))==script_id for p in scripts):raise ValueError('script_not_in_current_document')
                check();source=(await command(session,'Debugger.getScriptSource',scriptId=script_id)).get('scriptSource')
                if not isinstance(source,str):raise ValueError('script_source_unavailable')
                start=request.get('startLine',0);count=request.get('lineCount',80);lines=source.splitlines()
                text='\n'.join(lines[start:start+count]);encoded=text.encode();cut=len(encoded)>131072
                result['source']={'scriptId':script_id,'startLine':start,'lineCount':min(count,max(0,len(lines)-start)),'totalLines':len(lines),'text':encoded[:131072].decode(errors='replace'),'truncated':cut,'sha256':hashlib.sha256(source.encode()).hexdigest()}
            result['scriptCount']=len(scripts)
        elif op=='heap':
            # Explicit heavy diagnostic: WebKit's snapshot builder performs a
            # synchronous full GC. Never include this in routine resources.
            await enable('Heap');check()
            request['_heapSnapshotRequested']=True
            started=asyncio.get_running_loop().time()
            data=await command(session,'Heap.snapshot',timeout=8)
            result['heap']=project_snapshot(data.get('snapshotData'))
            result.update(heapSnapshotComplete=True,snapshotDurationMs=round((asyncio.get_running_loop().time()-started)*1000,3),
                          heapNodeCount=result['heap']['summary']['nodeCount'],heapEdgeCount=result['heap']['summary']['edgeCount'],heapShallowBytes=result['heap']['summary']['totalShallowBytes'],
                          forcedGarbageCollection=True,heapTimestamp=data.get('timestamp'),
                          runtimeEffect='Explicit snapshot: synchronous full GC and temporary execution pause; not passive resource sampling.')
        elif op=='dom':
            # A fixed projection supplements native AX visibility with actual
            # ancestor clipping and DOM hit testing. Never executes caller JS.
            selector=request.get('selector')
            if selector is not None and (not isinstance(selector,str) or not 1<=len(selector)<=300):
                raise ValueError('bounded_dom_selector_required')
            expression=Path(__file__).with_name('browser_dom.js').read_text().replace('__SELECTOR__',json.dumps(selector))
            check();data=await command(session,'Runtime.evaluate',expression=expression,returnByValue=True,userGesture=False,doNotPauseOnExceptionsAndMuteConsole=True)
            value=data.get('result',{}).get('value')
            if not isinstance(value,dict) or not isinstance(value.get('items'),list):
                raise ValueError('dom_projection_unavailable')
            result['dom']=scrub(value)
        elif op=='styles':
            check();doc=await command(session,'DOM.getDocument')
            check();node=await command(session,'DOM.querySelector',nodeId=doc['root']['nodeId'],selector=request['selector'])
            if not node.get('nodeId'):raise ValueError('debug_selector_not_found')
            # Fixed style reads do not need CSS change subscriptions. Enabling
            # CSS enumerates all stylesheets and can stall this device's page.
            result['styleEventsSubscribed']=False
            check();result['matched']=await command(session,'CSS.getMatchedStylesForNode',nodeId=node['nodeId'],includePseudo=True,includeInherited=True)
            check();result['computed']=await command(session,'CSS.getComputedStyleForNode',nodeId=node['nodeId'])
            check();result['inline']=await command(session,'CSS.getInlineStylesForNode',nodeId=node['nodeId'])
            result['selector']=request['selector']
        elif op in ('console','trace','network','profile','resources','workers'):
            if op=='profile':
                check();profile_requested=True
                await command(session,'ScriptProfiler.startTracking',includeSamples=True)
            elif op=='resources':
                # No heap snapshot or forced GC. These are WebKit's bounded
                # resource-usage events, with provider-defined attribution.
                await enable('Memory')
                for domain in ('Memory','CPUProfiler'):
                    check();resource_requested.append(domain)
                    await command(session,domain+'.startTracking')
            else:
                domain={'console':'Console','trace':'Timeline','network':'Network','workers':'Worker'}[op]
                await enable(domain)
            if op=='trace':
                check();timeline_requested=True
                await command(session,'Timeline.start',maxCallStackDepth=5)
            if request.get('expression') is not None:result['evaluation']=await evaluate()
            until=asyncio.get_running_loop().time()+request.get('sampleMs',500)/1000
            while asyncio.get_running_loop().time()<until:
                check();await asyncio.sleep(min(.1,max(0,until-asyncio.get_running_loop().time())))
            result['events']=events.rows
        elif op=='evaluate':result['evaluation']=await evaluate()
        request['_contextStage']='after_operation'
        after,_=await context()
        if after!=document:raise ValueError('debug_document_changed')
    finally:
        cleanup=[]
        failed_method=getattr(session,'_ios_agent_last_method',None)
        if timeline_requested:
            try:
                await command(session,'Timeline.stop',timeout=2)
                result['timelineStopped']=True
            except Exception:cleanup.append('Timeline.stop')
        if profile_requested:
            try:
                await command(session,'ScriptProfiler.stopTracking',timeout=2)
                result['profilerStopped']=True
            except Exception:cleanup.append('ScriptProfiler.stopTracking')
        for domain in reversed(resource_requested):
            try:
                await command(session,domain+'.stopTracking',timeout=2)
                result[{'Memory':'memoryStopped','CPUProfiler':'cpuProfilerStopped'}[domain]]=True
            except Exception:cleanup.append(domain+'.stopTracking')
        if worker_tasks:
            failures=await asyncio.gather(*worker_tasks,return_exceptions=True)
            if any(isinstance(e,BaseException) for e in failures):cleanup.append('Worker.initialized')
        if paused:
            try:await command(session,'Debugger.resume',timeout=2)
            except Exception:cleanup.append('Debugger.resume')
        for domain in reversed(domains):
            try:await command(session,domain+'.disable',timeout=2)
            except Exception:cleanup.append(domain+'.disable')
        # A worker can arrive while disable is in flight. Drain its mandatory
        # initialization as well before restoring handlers/detaching.
        if worker_tasks:
            failures=await asyncio.gather(*worker_tasks,return_exceptions=True)
            if any(isinstance(e,BaseException) for e in failures) and 'Worker.initialized' not in cleanup:cleanup.append('Worker.initialized')
        for method,old in old_handlers.items():
            if old is None:session.response_methods.pop(method,None)
            else:session.response_methods[method]=old
        result['domainsDisabled']=not cleanup
        if cleanup:
            request['_failedMethod']=failed_method
            request['_cleanupFailures']=cleanup
            request['_receiverFailureType']=getattr(session,'_ios_agent_receiver_failure',None)
            raise ValueError('debug_cleanup_unconfirmed')
    result.update(eventCount=len(events.rows),droppedEvents=events.dropped,retainedBytes=events.bytes)
    if op=='workers':
        result.update(workers=[x['params'] for x in events.rows if x['method']=='Worker.workerCreated'],workerCount=len(worker_ids),workersInitialized=len(worker_initialized),workerInitializationConfirmed=len(worker_ids)==len(worker_initialized),coverage='Observed dedicated Worker domain catalog only; no worker source, evaluation or network attribution.',events=events.rows)
    if op=='network':
        frames=[x for x in events.rows if x['method'] in ('Network.webSocketFrameReceived','Network.webSocketFrameSent')]
        result.update(webSocketFrames=len(frames),webSocketPayloadBytes=sum(x['params'].get('response',{}).get('payloadLength',0) for x in frames if isinstance(x['params'].get('response',{}).get('payloadLength'),(int,float))),
                      coverage='Observed page Network events only; empty capture is not evidence of no network activity. Dedicated worker coverage is unqualified.',binaryFramePayloadsRetained=False)
    if op=='profile':
        completed=[x['params'] for x in events.rows if x['method']=='ScriptProfiler.trackingComplete']
        traces=[t for x in completed for t in x.get('samples',{}).get('stackTraces',[])]
        result.update(profileComplete=bool(completed),sampleCount=len(traces),
                      attribution='JavaScript sampling only; not whole-browser CPU or memory')
    if op=='resources':
        result.update(memorySamples=sum(x['method']=='Memory.trackingUpdate' for x in events.rows),
                      cpuSamples=sum(x['method']=='CPUProfiler.trackingUpdate' for x in events.rows),
                      attribution='WebKit resource-usage events for this inspected target; may include shared process work. Not whole-device usage or audio latency.',
                      forcedGarbageCollection=False,
                      eventClock='receivedElapsedMs is host monotonic receive time, not provider measurement time; raw provider timestamps are unchanged')
    if op in ('sources','source'):result['events']=[x for x in events.rows if x['method']!='Debugger.scriptParsed']
    result=scrub(result)
    if len(json.dumps(result).encode())>(MAX_HEAP_BYTES if op=='heap' else MAX_BYTES):raise ValueError('bounded_debug_artifact_required')
    return result
