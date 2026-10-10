/* Explicit, bounded synthetic-development capture. No hooks while idle. */
var __iosCreateCapture = (() => {
  const sensitive = /^(authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|access.?token|refresh.?token|api.?key|client.?secret|credential|ios-agent)$/i;
  const mask = value => {const s=String(value);if(s==='<redacted>'||/^.{4}….{4}$/.test(s))return s;return s.length>=12?s.slice(0,4)+'…'+s.slice(-4):'<redacted>';};
  function scrubText(value) {
    return String(value).replace(/(Bearer\s+)([^\s"',;]+)/gi,(_,p,v)=>p+mask(v))
      .replace(/((?:password|passwd|secret|token|access_token|refresh_token|api_key|client_secret|authorization)["']?\s*[:=]\s*["']?)([^\s"'&,;}]+)/gi,(_,p,v)=>p+mask(v))
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,mask);
  }
  function sanitize(value, depth=0, seen=new Set(), key='', budget={nodes:0}) {
    if(++budget.nodes>400)return '<bounded>';
    if(sensitive.test(key))return mask(typeof value==='object'?'<structured-secret>':value);
    if(typeof value==='string')return scrubText(value.slice(0,32768));
    if(value==null||typeof value==='number'||typeof value==='boolean')return value;
    if(typeof value!=='object')return '<'+typeof value+'>';
    if(depth>=5||seen.has(value))return '<bounded>';seen.add(value);
    if(value instanceof Error)return {name:value.name,message:scrubText(value.message),stack:scrubText(value.stack||'').slice(0,8192)};
    const result=Array.isArray(value)?[]:Object.create(null);
    for(const name of Object.keys(value).slice(0,100)) {
      const d=Object.getOwnPropertyDescriptor(value,name);
      result[name]=d&&'value' in d?sanitize(d.value,depth+1,seen,name,budget):'<accessor>';
    }
    seen.delete(value);return result;
  }
  function url(value) {try{const u=new URL(String(value));if(u.protocol==='data:')return 'data:<inline-content-omitted>';u.username=u.username?mask(u.username):'';u.password=u.password?mask(u.password):'';for(const k of [...u.searchParams.keys()])if(sensitive.test(k))u.searchParams.set(k,mask(u.searchParams.get(k)));u.hash='';return scrubText(u.toString());}catch{return scrubText(String(value)).slice(0,2048);}}
  function create(runtime, {now=()=>Date.now(), sources=()=>[], exclude=()=>false}={}) {
    let active,events=[],bytes=0,dropped=0,sequence=0,timer,scanTimer,undo=[],recorders=new Map(),generation=0,ending;
    const readers=new Set(),pendingAudio=new Set();
    const size=value=>JSON.stringify(value).length*2;
    const status=()=>({active:!!active,id:active?.id||null,modes:active?.modes||[],remainingMs:active?Math.max(0,active.until-now()):0,bufferedEvents:events.length,bufferedBytes:bytes,dropped,sequence,
      coverage:{network:'fetch text bodies and XHR text; WebSocket send and new socket receive; streams/binary bodies not consumed',audio:'existing live audio tracks only; no microphone acquisition; recorder clones stopped, app tracks preserved'}});
    const append=(kind,value,epoch=generation)=>{
      try {
      if(!active||epoch!==generation||!active.modes.includes(kind))return;
      if(now()>=active.until){void stop(true);return;}
      const cleaned=sanitize(value);
      if(kind==='audio'&&typeof value.base64==='string')cleaned.base64=value.base64;
      const event={sequence:++sequence,at:now(),kind,...cleaned};const n=size(event);
      if(n>Math.min(active.maxBytes,128*1024)){dropped++;return;}
      while(events.length&&bytes+n>active.maxBytes){bytes-=size(events.shift());dropped++;}
      events.push(event);bytes+=n;
      }catch{dropped++;} // Observers must not alter application behavior.
    };
    const trackAudio=()=>{
      if(!active?.modes.includes('audio'))return;
      let available;try{available=sources().slice(0,32);}catch{append('audio',{unavailable:true,reason:'track_discovery_failed'});return;}
      for(const track of available){
        if(track.kind!=='audio'||track.readyState!=='live'||recorders.has(track))continue;
        const epoch=generation;
        try {
          const clone=track.clone(),stream=new runtime.MediaStream([clone]);
          const mime=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(x=>runtime.MediaRecorder.isTypeSupported(x));
          const recorder=new runtime.MediaRecorder(stream,mime?{mimeType:mime}:undefined);
          recorders.set(track,{recorder,clone});
          recorder.ondataavailable=event=>{if(!event.data?.size||event.data.size>192*1024)return;const task=event.data.arrayBuffer().then(buffer=>{
            const array=new Uint8Array(buffer);let binary='';for(let i=0;i<array.length;i+=8192)binary+=String.fromCharCode(...array.subarray(i,i+8192));
            append('audio',{mime:event.data.type||recorder.mimeType,base64:runtime.btoa(binary),trackRef:[...recorders.keys()].indexOf(track)+1},epoch);
          }).catch(()=>{});pendingAudio.add(task);void task.finally(()=>pendingAudio.delete(task));};
          recorder.start(500);
        }catch{append('audio',{unavailable:true,reason:'recorder_or_track_clone_unavailable'},epoch);}
      }
    };
    async function textBody(response,epoch,base) {
      let reader;
      try {
        const type=response.headers?.get('content-type')||'';
        if(!/(json|text|xml|javascript|form-urlencoded)/i.test(type))return;
        if(!active||epoch!==generation)return;
        const copy=response.clone();reader=copy.body?.getReader?.();
        if(!reader){append('network',{...base,bodyUnavailable:'bounded_stream_reader_unavailable'},epoch);return;}
        readers.add(reader);const decoder=new runtime.TextDecoder();let text='',n=0,truncated=false;
        while(n<32768){const part=await reader.read();if(part.done)break;const take=part.value.subarray(0,32768-n);n+=take.byteLength;text+=decoder.decode(take,{stream:true});if(take.length<part.value.length||n>=32768){truncated=true;break;}}
        text+=decoder.decode();void reader.cancel().catch(()=>{});
        let body=text;try{body=JSON.parse(text);}catch{}
        append('network',{...base,body:sanitize(body),truncated},epoch);
      }catch{append('network',{...base,bodyUnavailable:'read_failed'},epoch);}finally{if(reader){readers.delete(reader);void reader.cancel().catch(()=>{});}}
    }
    function hook(object,key,wrap){const original=object?.[key];if(typeof original!=='function')return;const installed=wrap(original);object[key]=installed;undo.push(()=>{if(object[key]===installed)object[key]=original;});}
    function start(options) {
      if(active||ending)throw new Error('capture_already_active');
      const {id,modes,seconds=120,maxBytes=2*1024*1024}=options||{};
      if(!/^[a-f0-9]{32}$/.test(id||'')||!Array.isArray(modes)||!modes.length||modes.some(x=>!['console','network','audio'].includes(x))||!Number.isInteger(seconds)||seconds<1||seconds>600||!Number.isInteger(maxBytes)||maxBytes<32768||maxBytes>8*1024*1024)throw new Error('bounded_capture_options_required');
      if(modes.includes('audio')&&(!runtime.MediaRecorder||!runtime.MediaStream))throw new Error('audio_recorder_unavailable');
      generation++;active={id,modes:[...new Set(modes)],until:now()+seconds*1000,maxBytes};events=[];bytes=0;dropped=0;sequence=0;undo=[];
      if(modes.includes('console'))for(const level of ['log','info','warn','error','debug'])hook(runtime.console,level,original=>function(...args){try{append('console',{level,args,stack:new Error().stack});}catch{}return original.apply(this,args);});
      if(modes.includes('network')){
        hook(runtime,'fetch',original=>function(...args){
          const raw=typeof args[0]==='string'?args[0]:args[0]?.url;if(exclude(raw))return original.apply(this,args);
          const epoch=generation,start=now(),options=args[1]||{},headers={};try{new runtime.Headers(options.headers||args[0]?.headers).forEach((v,k)=>{headers[k]=v;});}catch{}
          append('network',{phase:'request',url:url(raw),method:options.method||args[0]?.method||'GET',headers,body:typeof options.body==='string'?options.body:options.body==null?null:'<non-text-body-not-consumed>'},epoch);
          return original.apply(this,args).then(response=>{const h={};try{response.headers.forEach((v,k)=>{h[k]=v;});}catch{}const base={phase:'response',url:url(raw),status:response.status,headers:h,durationMs:now()-start};append('network',base,epoch);void textBody(response,epoch,base);return response;},error=>{append('network',{phase:'error',url:url(raw),durationMs:now()-start,error},epoch);throw error;});
        });
        const requests=new WeakMap();
        hook(runtime.XMLHttpRequest?.prototype,'open',original=>function(method,address,...rest){requests.set(this,{method,url:url(address)});return original.call(this,method,address,...rest);});
        hook(runtime.XMLHttpRequest?.prototype,'send',original=>function(body){const r=requests.get(this),epoch=generation;if(r){append('network',{...r,phase:'xhr-request',body:typeof body==='string'?body:'<non-text>'},epoch);this.addEventListener('loadend',()=>{let text;try{if(!this.responseType||this.responseType==='text')text=this.responseText?.slice(0,32768);}catch{}append('network',{...r,phase:'xhr-response',status:this.status,body:text},epoch);},{once:true});}return original.call(this,body);});
        hook(runtime.WebSocket?.prototype,'send',original=>function(data){append('network',{phase:'ws-send',url:url(this.url),body:typeof data==='string'?data:'<binary>'});return original.call(this,data);});
        hook(runtime,'WebSocket',Original=>new Proxy(Original,{construct(target,args,newTarget){const ws=Reflect.construct(target,args,newTarget),epoch=generation;const receive=e=>append('network',{phase:'ws-receive',url:url(ws.url),body:typeof e.data==='string'?e.data:'<binary>'},epoch);ws.addEventListener('message',receive);undo.push(()=>ws.removeEventListener('message',receive));return ws;}}));
      }
      timer=runtime.setTimeout(()=>{void stop(true);},seconds*1000);
      if(modes.includes('audio')){trackAudio();scanTimer=runtime.setInterval(trackAudio,1000);}
      return status();
    }
    function drain(limit=192*1024){if(!Number.isInteger(limit)||limit<1024||limit>256*1024)throw new Error('bounded_capture_read_required');const selected=[];let n=0;while(events.length&&n+size(events[0])<=limit){const e=events.shift();n+=size(e);bytes-=size(e);selected.push(e);}return {capture:status(),events:selected,remainingEvents:events.length};}
    function stop(discard=false) {
      if(ending)return discard?ending.then(()=>{events=[];bytes=0;return status();}):ending;
      if(!active){if(discard){events=[];bytes=0;}return Promise.resolve(status());}
      runtime.clearTimeout(timer);runtime.clearInterval(scanTimer);for(const restore of undo.reverse())try{restore();}catch{}undo=[];
      for(const reader of readers)void reader.cancel().catch(()=>{});readers.clear();
      const current=active;
      ending=(async()=>{
        const closing=[...recorders.values()];
        await Promise.all(closing.map(({recorder})=>new Promise(resolve=>{if(recorder.state==='inactive'){resolve();return;}const t=runtime.setTimeout(resolve,700);recorder.addEventListener('stop',()=>{runtime.clearTimeout(t);resolve();},{once:true});try{recorder.stop();}catch{runtime.clearTimeout(t);resolve();}})));
        let audioTimeout;await Promise.race([Promise.allSettled([...pendingAudio]),new Promise(resolve=>{audioTimeout=runtime.setTimeout(resolve,700);})]);runtime.clearTimeout(audioTimeout);
        for(const {clone} of closing)try{clone.stop();}catch{}recorders.clear();
        if(active===current)active=null;
        generation++;if(discard){events=[];bytes=0;}ending=null;return status();
      })();return ending;
    }
    return {start,stop,drain,status,record:append};
  }
  create.sanitize=sanitize;create.scrubText=scrubText;return create;
})();
if(typeof module==='object'&&module.exports)module.exports=__iosCreateCapture;
