"""Bounded on-demand WebKit diagnostics; content stays in private MCP artifacts."""
import asyncio
import hashlib
import json
import re
from urllib.parse import urlsplit, urlunsplit

MAX_BYTES = 2 * 1024 * 1024


def scrub(value, key=''):
    if re.search(r'password|authorization|cookie|token|secret', key, re.I):
        if isinstance(value,str) and re.fullmatch(r'.{4}….{4}',value):return value
        if isinstance(value,str) and len(value)>12:return value[:4]+'…'+value[-4:]
        return '<redacted>'
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
    def add(self,method,params):
        if method=='Debugger.scriptParsed':
            # Source-map data URLs and provider extras can dwarf the catalog.
            # Retain only source references; source content has its own window.
            params={k:(safe_url(v) if k in ('url','sourceMapURL') else v) for k,v in params.items()
                    if k in ('scriptId','url','startLine','startColumn','endLine','endColumn','sourceMapURL','isModule')}
        row=scrub({'method':method,'params':params})
        size=len(json.dumps(row).encode())
        if len(self.rows)>=1000 or self.bytes+size>MAX_BYTES:
            self.dropped+=1;return
        self.rows.append(row);self.bytes+=size


async def inspect(session, request, target, expected, check):
    op=request.get('op','overview')
    allowed={'overview','sources','source','styles','console','trace','evaluate'}
    if op not in allowed:raise ValueError('fixed_debug_operation_required')
    reference=request.get('documentRef')
    if op in ('source','evaluate') and not re.fullmatch('[a-f0-9]{32}',reference or ''):
        raise ValueError('fresh_debug_document_required')
    if request.get('expression') is not None and (not request.get('ownedPage') or not reference):
        raise ValueError('owned_browser_session_required_for_evaluation')
    context_expression="""(()=>{const s=window.__iosWebAgent?.status?.();return {originMatches:location.origin===ORIGIN,visible:!document.hidden,timeOrigin:performance.timeOrigin,page:s?.page,owned:s?.owned===true,indicator:s?.indicator===true,ready:document.readyState}})()""".replace('ORIGIN',json.dumps(f'https://{expected.netloc}'))
    async def context():
        check()
        data=await command(session,'Runtime.evaluate',expression=context_expression,returnByValue=True,userGesture=False,doNotPauseOnExceptionsAndMuteConsole=True)
        value=data.get('result',{}).get('value',{})
        if not value.get('originMatches') or value.get('visible') is not True or type(value.get('timeOrigin')) not in (int,float):
            raise ValueError('visible_dev_document_required')
        ref=hashlib.sha256(json.dumps([target.application.bundle,target.application.id_,target.page.id_,value['timeOrigin']]).encode()).hexdigest()[:32]
        if reference and ref!=reference:raise ValueError('debug_document_changed')
        if request.get('expression') is not None and (value.get('page')!=request['ownedPage'] or value.get('owned') is not True or value.get('indicator') is not True):
            raise ValueError('owned_browser_session_required_for_evaluation')
        return ref,value
    document,ctx=await context()
    result={'operation':op,'documentRef':document,'browser':target.application.bundle,'ready':ctx['ready'],'scope':'paired-dev-WebKit-Inspector','userGestureRequested':False,'replay':False}
    if op=='overview':return {**result,'domainsDisabled':True}
    domains=[];events=Events();old_handlers={};paused=False;timeline_requested=False
    def handler(method):
        def record(event):
            nonlocal paused
            if method=='Debugger.paused':paused=True
            events.add(method,event.get('params',{}))
        return record
    async def enable(domain):
        # Track before dispatch: even an uncertain enable must get a cleanup attempt.
        domains.append(domain)
        check();await command(session,domain+'.enable')
    async def evaluate():
        await context();check()
        return await command(session,'Runtime.evaluate',expression=request['expression'],returnByValue=True,userGesture=False,doNotPauseOnExceptionsAndMuteConsole=False)
    try:
        methods={'sources':['Debugger.scriptParsed','Debugger.scriptFailedToParse','Debugger.paused'],
                 'source':['Debugger.scriptParsed','Debugger.paused'],
                 'console':['Console.messageAdded','Console.messageRepeatCountUpdated','Console.messagesCleared'],
                 'trace':['Timeline.eventRecorded','Timeline.recordingStarted','Timeline.recordingStopped']} .get(op,[])
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
        elif op in ('console','trace'):
            domain='Console' if op=='console' else 'Timeline'
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
        if paused:
            try:await command(session,'Debugger.resume',timeout=2)
            except Exception:cleanup.append('Debugger.resume')
        for domain in reversed(domains):
            try:await command(session,domain+'.disable',timeout=2)
            except Exception:cleanup.append(domain+'.disable')
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
    if op in ('sources','source'):result['events']=[x for x in events.rows if x['method']!='Debugger.scriptParsed']
    result=scrub(result)
    if len(json.dumps(result).encode())>MAX_BYTES:raise ValueError('bounded_debug_artifact_required')
    return result
