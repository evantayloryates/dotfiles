"""Bounded dedicated-worker source, console and JavaScript sampling over WebKit's Worker channel."""
import asyncio
import hashlib
import json


async def capture(session,request,command,check,Events,safe_url,ProtocolError):
    worker_id=request.get('workerId');op=request['op']
    if not isinstance(worker_id,str) or not 1<=len(worker_id)<=128:raise ValueError('current_debug_worker_required')
    duration=request.get('sampleMs',500);start=request.get('startLine',0);count=request.get('lineCount',80)
    if type(duration) is not int or not 100<=duration<=3000 or type(start) is not int or not 0<=start<=1000000 or type(count) is not int or not 1<=count<=200:raise ValueError('bounded_worker_debug_required')
    loop=asyncio.get_running_loop();workers={};initialized=set();init_tasks=[];resume_tasks=[];pending={};serial=0;terminated=False;domains=[];enabled=False;profile_requested=False;profile_stopped=False;events=Events();paused=False;resumed=asyncio.Event();resume_confirmed=None
    methods=['Worker.workerCreated','Worker.workerTerminated','Worker.dispatchMessageFromWorker'];old={m:session.response_methods.get(m) for m in methods}
    async def initialize(wid):
        await command(session,'Worker.initialized',timeout=2,workerId=wid);initialized.add(wid)
    def created(event):
        p=event.get('params',{});wid=p.get('workerId')
        if isinstance(wid,str) and wid not in workers:
            workers[wid]=p;init_tasks.append(asyncio.create_task(initialize(wid)))
    def ended(event):
        nonlocal terminated
        if event.get('params',{}).get('workerId')==worker_id:
            terminated=True
            for future in list(pending.values()):
                if not future.done():future.set_exception(ValueError('debug_worker_terminated'))
    async def inner(method,timeout=2,**args):
        nonlocal serial
        if terminated:raise ValueError('debug_worker_terminated')
        serial+=1;key=serial;future=loop.create_future();pending[key]=future
        try:
            await command(session,'Worker.sendMessageToWorker',timeout=timeout,workerId=worker_id,message=json.dumps({'id':key,'method':method,'params':args}))
            response=await asyncio.wait_for(future,timeout)
            if 'error' in response:raise ProtocolError('worker:'+method)
            return response.get('result',{})
        finally:
            pending.pop(key,None)
            if not future.done():future.cancel()
            elif not future.cancelled():future.exception()
    async def resume():
        nonlocal resume_confirmed
        await inner('Debugger.resume');await asyncio.wait_for(resumed.wait(),2);resume_confirmed=True
    def message(event):
        nonlocal paused
        p=event.get('params',{})
        if p.get('workerId')!=worker_id:return
        try:data=json.loads(p.get('message',''))
        except (ValueError,TypeError):return
        if not isinstance(data,dict):return
        if 'id' in data:
            if type(data['id']) is not int:return
            future=pending.get(data['id'])
            if future and not future.done():future.set_result(data)
            return
        method=data.get('method');params=data.get('params',{})
        if method=='Debugger.paused' and not paused:
            paused=True;resumed.clear();resume_tasks.append(asyncio.create_task(resume()))
        if method=='Debugger.resumed':paused=False;resumed.set()
        if method in ['Debugger.scriptParsed','Debugger.scriptFailedToParse','Debugger.paused','Console.messageAdded','Console.messageRepeatCountUpdated','Console.messagesCleared','ScriptProfiler.trackingStart','ScriptProfiler.trackingUpdate','ScriptProfiler.trackingComplete']:
            events.add(method,params)
    session.response_methods.update({'Worker.workerCreated':created,'Worker.workerTerminated':ended,'Worker.dispatchMessageFromWorker':message})
    result={'workerId':worker_id,'operation':op,'replay':False};cleanup=[]
    async def drain(tasks,label):
        # Task lists can grow while an earlier cleanup command is in flight.
        seen=0
        while seen<len(tasks):
            batch=tasks[seen:];seen=len(tasks)
            outcomes=await asyncio.gather(*batch,return_exceptions=True)
            if any(isinstance(e,BaseException) for e in outcomes) and label not in cleanup:cleanup.append(label)
    try:
        check();enabled=True;await command(session,'Worker.enable')
        await asyncio.sleep(.05);await drain(init_tasks,'Worker.initialized');check()
        if cleanup:raise ValueError('debug_cleanup_unconfirmed')
        if worker_id not in workers or worker_id not in initialized:raise ValueError('current_debug_worker_required')
        if terminated:raise ValueError('debug_worker_terminated')
        result['worker']={k:(safe_url(v) if k=='url' else v) for k,v in workers[worker_id].items() if k in ('workerId','name','url')}
        domain='Console' if op=='worker-console' else 'ScriptProfiler' if op=='worker-profile' else 'Debugger'
        check()
        if domain=='ScriptProfiler':
            profile_requested=True;await inner('ScriptProfiler.startTracking',includeSamples=True)
        else:
            domains.append(domain);await inner(domain+'.enable')
        if domain=='Debugger':
            await asyncio.sleep(.05);check()
            scripts=[x['params'] for x in events.rows if x['method']=='Debugger.scriptParsed']
            result.update(scripts=scripts,scriptCount=len(scripts))
            if op=='worker-source':
                script_id=request.get('scriptId')
                if not any(str(x.get('scriptId'))==script_id for x in scripts):raise ValueError('script_not_in_current_worker')
                check();source=(await inner('Debugger.getScriptSource',scriptId=script_id)).get('scriptSource')
                if not isinstance(source,str):raise ValueError('script_source_unavailable')
                lines=source.splitlines();text='\n'.join(lines[start:start+count]).encode()
                result['source']={'scriptId':script_id,'startLine':start,'lineCount':min(count,max(0,len(lines)-start)),'totalLines':len(lines),'text':text[:131072].decode(errors='replace'),'truncated':len(text)>131072,'sha256':hashlib.sha256(source.encode()).hexdigest()}
        else:
            deadline=loop.time()+duration/1000
            while loop.time()<deadline:
                check()
                if terminated:raise ValueError('debug_worker_terminated')
                await asyncio.sleep(min(.1,max(0,deadline-loop.time())))
            if op=='worker-console':result['historyMayReplay']=True
        check()
        if terminated:raise ValueError('debug_worker_terminated')
    finally:
        await drain(init_tasks,'Worker.initialized')
        await drain(resume_tasks,'worker:Debugger.resume')
        if paused and 'worker:Debugger.resume' not in cleanup:cleanup.append('worker:Debugger.resume')
        if profile_requested and not terminated:
            try:await inner('ScriptProfiler.stopTracking');profile_stopped=True
            except Exception:cleanup.append('worker:ScriptProfiler.stopTracking')
        for domain in reversed(domains):
            if terminated:continue
            try:await inner(domain+'.disable')
            except Exception:cleanup.append('worker:'+domain+'.disable')
        if enabled:
            try:await command(session,'Worker.disable',timeout=2)
            except Exception:cleanup.append('Worker.disable')
        await drain(init_tasks,'Worker.initialized');await drain(resume_tasks,'worker:Debugger.resume')
        for m,fn in old.items():
            if fn is None:session.response_methods.pop(m,None)
            else:session.response_methods[m]=fn
        request['_workerCleanup']={'workerTerminated':terminated,'workersInitialized':len(initialized),'workerInitializationConfirmed':len(initialized)==len(workers),'workerResumeConfirmed':resume_confirmed,'domainsDisabled':not cleanup}
        if cleanup:
            request['_cleanupFailures']=cleanup
            raise ValueError('debug_cleanup_unconfirmed')
    if op=='worker-profile':
        completed=[x['params'] for x in events.rows if x['method']=='ScriptProfiler.trackingComplete']
        result.update(profilerStopped=profile_stopped,profileComplete=bool(completed),sampleCount=sum(len(x.get('samples',{}).get('stackTraces',[])) for x in completed),forcedGarbageCollection=False)
        if not completed:raise ValueError('worker_profile_incomplete')
    result.update(events=events.rows,eventCount=len(events.rows),droppedEvents=events.dropped,retainedBytes=events.bytes,workersInitialized=len(initialized),workerInitializationConfirmed=len(initialized)==len(workers),workerResumeConfirmed=resume_confirmed,domainsDisabled=True,
                  coverage='Dedicated worker source, Console or JavaScript sampling only; no caller evaluation, breakpoint, service-worker or network attribution.')
    return result
