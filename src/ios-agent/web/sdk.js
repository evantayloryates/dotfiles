/* Opt-in developer page adapter. No SDK on hosted production/staging. */
(() => {
  'use strict';
  if (window.__iosWebAgent) return;
  const endpoint = '/api/ios-web-agent';
  const version = 'web-poc-1';
  const grants = new URLSearchParams(location.hash.slice(1));
  let enrollment = grants.get('ios-agent') || sessionStorage.getItem('ios-agent-enrollment');
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem('ios-agent-page') || 'null'); } catch {}
  if (!enrollment && !saved) return;
  // Remove enrollment from address/history immediately, before any telemetry.
  history.replaceState(history.state, '', location.pathname + location.search);
  const boot = crypto.randomUUID();
  let identity = enrollment ? undefined : saved, lease, deadline = 0, stopped = false, snapshot, refs = new Map();
  let wakeLock,wakeRequest,wakeRetryAt=0;
  const seen = new Set(), events = [], domains = new Map();
  const clock = () => performance.now();
  const ring = value => { events.push({at: Math.round(clock()), ...value}); if (events.length > 160) events.shift(); };
  const glow = document.createElement('div');
  glow.dataset.iosAgent = 'indicator';
  glow.setAttribute('aria-hidden', 'true');
  glow.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;border-radius:22px;border:3px solid transparent;background:linear-gradient(120deg,#fd9075,#d168e2,#638eff,#79e7c6) border-box;mask:linear-gradient(#fff 0 0) padding-box,linear-gradient(#fff 0 0);mask-composite:exclude;-webkit-mask:linear-gradient(#fff 0 0) padding-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;display:none;box-sizing:border-box;';
  document.documentElement.append(glow);
  function clear() { lease = null; deadline = 0; glow.style.display = 'none'; const held=wakeLock;wakeLock=null;void held?.release().catch(()=>{}); }
  const timer = setInterval(() => { if (deadline && clock() > deadline) clear(); }, 250);
  const browser = /iPhone|iPad/.test(navigator.userAgent) ? (/CriOS/.test(navigator.userAgent) ? 'ios-chrome' : 'ios-safari') : (/AppleWebKit/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) ? 'desktop-webkit' : 'desktop-chromium');
  const feedback = () => ({...identity, boot, visible: !document.hidden, ready: document.readyState !== 'loading', browser, path: location.pathname, indicator: !!lease});
  async function post(body) {
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 6000);
    try {
      const response = await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:abort.signal, cache:'no-store'});
      if (!response.ok) throw new Error('bridge_refused');
      const result = await response.json(); if (result.error) throw new Error('bridge_refused'); return result;
    } finally { clearTimeout(timeout); }
  }
  function rect(el) { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; }
  function secret(el) { return el.matches('input[type=password],input[autocomplete*=password],input[autocomplete=username],input[autocomplete=email],input[autocomplete=tel],input[autocomplete=one-time-code]'); }
  function label(el) { return (el.getAttribute('aria-label') || el.labels?.[0]?.innerText || el.innerText || el.getAttribute('title') || '').trim().slice(0,200); }
  const retainedShadowRoots=new WeakMap(),originalAttachShadow=Element.prototype.attachShadow;
  const installedAttachShadow=Element.prototype.attachShadow=function(...args){const root=originalAttachShadow.apply(this,args);retainedShadowRoots.set(this,root);return root;};
  const shadowRoot=el=>el.shadowRoot||retainedShadowRoots.get(el);
  function inert(el){for(let node=el;node;node=node.getRootNode()?.host)if(node.closest('[inert]'))return true;return false;}
  function deepHit(x,y) {let hit=document.elementFromPoint(x,y);for(let i=0;i<16&&hit&&shadowRoot(hit);i++){const inner=shadowRoot(hit).elementFromPoint(x,y);if(!inner||inner===hit)break;hit=inner;}return hit;}
  function semanticElements() {const roots=[document],out=[];let scanned=0;for(let i=0;i<roots.length&&i<64;i++)for(const el of roots[i].querySelectorAll('*')){if(++scanned>8000)return out;if(shadowRoot(el))roots.push(shadowRoot(el));if(el.matches('a,button,input,textarea,select,[role],[contenteditable=true],h1,h2,h3,label,video,audio'))out.push(el);if(out.length>=500)return out;}return out;}
  function tree() {
    refs = new Map(); snapshot = {id: crypto.randomUUID(), at:clock()};
    const elements = [];
    for (const el of semanticElements()) {
      if (el === glow || secret(el)) continue;
      const box = rect(el), style = getComputedStyle(el);
      if (!box.width || !box.height || style.visibility === 'hidden' || style.display === 'none') continue;
      const id = String(elements.length + 1), text = label(el);
      refs.set(id, {el, text, box});
      const hit = deepHit(Math.max(0, Math.min(innerWidth-1, box.x + box.width/2)), Math.max(0, Math.min(innerHeight-1, box.y + box.height/2)));
      elements.push({id, tag:el.tagName.toLowerCase(), role:el.getAttribute('role'), label:text, box, disabled:!!el.disabled,pressed:el.getAttribute('aria-pressed'),expanded:el.getAttribute('aria-expanded'),checked:'checked' in el?!!el.checked:el.getAttribute('aria-checked'),inputType:el.tagName==='INPUT'?el.type:undefined, value:'value' in el ? String(el.value).slice(0,300) : undefined, hit:!!hit && (hit === el || el.contains(hit)), inViewport:box.y < innerHeight && box.y+box.height > 0 && box.x < innerWidth && box.x+box.width > 0});
      if (elements.length >= 500) break;
    }
    return {snapshot:snapshot.id, content:document.body.innerText.slice(0,16000), path:location.pathname, title:document.title, elements, viewport:{width:innerWidth,height:innerHeight,scale:visualViewport?.scale}, capabilities:{trustedInput:false,systemUI:false,openShadowRoots:true,closedShadowRoots:'created-after-adapter-boot',sameOriginFrames:false,crossOriginFrames:false}};
  }
  function target(args) {
    if (!snapshot || args.snapshot !== snapshot.id || clock()-snapshot.at > 5000) throw new Error('stale_snapshot');
    const ref = refs.get(args.target); if (!ref || !ref.el.isConnected || ref.el.disabled || secret(ref.el)) throw new Error('stale_target');
    const current = rect(ref.el);
    if (label(ref.el) !== ref.text || Object.keys(current).some(k => Math.abs(current[k] - ref.box[k]) > 2)) throw new Error('changed_target');
    return ref.el;
  }
  async function execute(c) {
    const args = c.args || {};
    switch(c.action) {
      case 'snapshot': return tree();
      case 'events': return {events:[...events], contentFree:true};
      case 'state': {
        const data = {};
        for (const [key, read] of domains) { try { data[key] = await read(); } catch { data[key] = {error:'domain_read_failed'}; } }
        return {version,boot,browser,secureContext:isSecureContext,visible:!document.hidden,indicator:!!lease,hasMediaDevices:!!navigator.mediaDevices?.getUserMedia,wakeLock:{supported:!!navigator.wakeLock,active:!!wakeLock&&!wakeLock.released},activation:{active:navigator.userActivation?.isActive,hasBeenActive:navigator.userActivation?.hasBeenActive},domains:data};
      }
      case 'click': { const el=target(args),box=rect(el),x=box.x+box.width/2,y=box.y+box.height/2,hit=deepHit(x,y);if(x<0||y<0||x>=innerWidth||y>=innerHeight||!hit||!(hit===el||el.contains(hit))||inert(el))throw new Error('target_not_interactable');el.click(); return {delivery:'synthetic-dom',trusted:false}; }
      case 'fill': {
        const el = target(args);
        if (el.readOnly || !el.matches('input,textarea') || typeof args.text !== 'string' || args.text.length > 4096) throw new Error('editable_text_required');
        const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, args.text);
        el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true}));
        return {delivery:'synthetic-dom',trusted:false};
      }
      case 'scroll': { target(args).scrollIntoView({block:'center',behavior:'instant'}); return {delivery:'semantic-scroll'}; }
      case 'evaluate': {
        if (typeof args.expression !== 'string' || args.expression.length > 16000) throw new Error('expression_required');
        // Explicit dev execution tool. Never advertise as read-only or trusted input.
        return await (0,eval)(args.expression);
      }
      default: throw new Error('unsupported_action');
    }
  }
  function apply(response) {
    if (stopped) return;
    const next = response.lease;
    if (!next || document.hidden) clear();
    else { lease=next; deadline=clock()+Math.min(15000,next.remainingMs); glow.style.display='block';
      if(navigator.wakeLock && !wakeLock && !wakeRequest && clock()>=wakeRetryAt) {const expected=next.id;wakeRequest=navigator.wakeLock.request('screen').then(async lock=>{if(stopped||!lease||lease.id!==expected||document.hidden)await lock.release();else wakeLock=lock;}).catch(()=>{wakeRetryAt=clock()+30000;ring({kind:'wake-lock',code:'unavailable'});}).finally(()=>{wakeRequest=null;});}
    }
  }
  async function loop() {
    if (stopped) return;
    try {
      if (!identity) { identity = await post({op:'join',token:enrollment,boot}); sessionStorage.removeItem('ios-agent-enrollment'); sessionStorage.setItem('ios-agent-page',JSON.stringify(identity)); enrollment=null; }
      const response=await post({op:'poll',...feedback()}); if(stopped)return;apply(response);
      const c=response.command;
      if (c && lease && c.lease===lease.id && !seen.has(c.id)) {
        seen.add(c.id); if (seen.size>256) seen.delete(seen.values().next().value);
        let result;
        if (c.remainingMs<=0) result={error:'expired_before_execution',delivery:'not-sent'};
        else {
          try { result={ok:true,value:await Promise.race([execute(c),new Promise((_,reject)=>setTimeout(()=>reject(new Error('execution_deadline_unknown')),Math.min(c.remainingMs,8000)))])}; }
          catch(e) { const codes=['stale_snapshot','stale_target','changed_target','target_not_interactable','editable_text_required','expression_required','unsupported_action','execution_deadline_unknown']; result={ok:false,error:codes.includes(e.message)?e.message:'page_execution_failed',replay:false}; }
        }
        if (JSON.stringify(result).length>800000) result={ok:false,error:'result_limit',replay:false};
        const ack=await post({op:'result',...feedback(),id:c.id,epoch:response.epoch,result}); apply(ack);
      }
    } catch { ring({kind:'bridge',code:'transport_unavailable'}); }
    if (!stopped) setTimeout(loop, lease?300:2000);
  }
  const originalFetch=window.fetch;
  window.fetch=function(...args) {
    const start=clock();
    const url = typeof args[0]==='string' ? args[0] : args[0]?.url;
    if (url===endpoint) return originalFetch.apply(this,args);
    return originalFetch.apply(this,args).then(r=>{ring({kind:'network',transport:'fetch',status:r.status,durationMs:Math.round(clock()-start)});return r;},e=>{ring({kind:'network',transport:'fetch',code:'rejected',durationMs:Math.round(clock()-start)});throw e;});
  };
  // Metadata only: no URLs, payloads, SDP, addresses, identifiers or audio.
  const originalWS=window.WebSocket, originalRTC=window.RTCPeerConnection;
  const sockets=new Set(), peers=new Set(), tracks=new Set();
  const originalGUM=navigator.mediaDevices?.getUserMedia;
  const listeners=[];
  const listen=(object,type,fn)=>{object.addEventListener(type,fn);listeners.push(()=>object.removeEventListener(type,fn));};
  if(originalWS) window.WebSocket=new Proxy(originalWS,{construct(target,args,newTarget){
    const ws=Reflect.construct(target,args,newTarget);const record={readyState:0,receivedMessages:0,receivedBytes:0};sockets.add(record);
    listen(ws,'open',()=>{record.readyState=1;ring({kind:'websocket',code:'open'});});
    listen(ws,'close',()=>{record.readyState=3;ring({kind:'websocket',code:'closed'});});
    listen(ws,'error',()=>ring({kind:'websocket',code:'error'}));
    listen(ws,'message',e=>{record.receivedMessages++;record.receivedBytes+=typeof e.data==='string'?e.data.length:e.data?.byteLength||e.data?.size||0;});
    if(sockets.size>32)sockets.delete(sockets.values().next().value);return ws;
  }});
  if(originalRTC) window.RTCPeerConnection=new Proxy(originalRTC,{construct(target,args,newTarget){
    const pc=Reflect.construct(target,args,newTarget);peers.add(pc);if(peers.size>16)peers.delete(peers.values().next().value);
    listen(pc,'connectionstatechange',()=>ring({kind:'webrtc',code:pc.connectionState}));return pc;
  }});
  if(originalGUM) navigator.mediaDevices.getUserMedia=async function(...args){
    try{const stream=await originalGUM.apply(this,args);for(const track of stream.getTracks()){tracks.add(track);if(tracks.size>32)tracks.delete(tracks.values().next().value);}ring({kind:'media',code:'acquired',trackCount:stream.getTracks().length});return stream;}
    catch(e){ring({kind:'media',code:'request_failed'});throw e;}
  };
  domains.set('media',async()=>{
    const audio=[],connections=[],transports=[];
    for(const pc of peers) {
      if(pc.signalingState==='closed')continue;connections.push({state:pc.connectionState,iceState:pc.iceConnectionState,signalingState:pc.signalingState});let reports;try{reports=await pc.getStats();}catch{continue;}const numeric=['packetsSent','packetsReceived','packetsLost','bytesSent','bytesReceived','jitter','totalAudioEnergy','totalSamplesDuration','concealedSamples','silentConcealedSamples','jitterBufferDelay','jitterBufferEmittedCount','roundTripTime'];
      reports.forEach(r=>{if(r.type==='transport'){const sample={type:r.type};for(const k of ['bytesSent','bytesReceived','packetsSent','packetsReceived'])if(typeof r[k]==='number'&&Number.isFinite(r[k]))sample[k]=r[k];transports.push(sample);}if(r.kind==='audio'||r.mediaType==='audio'){const sample={type:r.type};for(const k of numeric)if(typeof r[k]==='number'&&Number.isFinite(r[k]))sample[k]=r[k];audio.push(sample);}});
    }
    const visibleTracks=new Set(tracks);for(const element of document.querySelectorAll('video,audio'))if(element.srcObject instanceof MediaStream)for(const track of element.srcObject.getTracks())visibleTracks.add(track);
    return {coverage:'peer/socket objects created after adapter boot; tracks also discovered through DOM media',sockets:[...sockets],tracks:[...visibleTracks].map(t=>({kind:t.kind,enabled:t.enabled,muted:t.muted,readyState:t.readyState})),audio,connections,transports};
  });
  const xhrOpen=XMLHttpRequest.prototype.open, xhrSend=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(...args){return xhrOpen.apply(this,args);};
  XMLHttpRequest.prototype.send=function(...args){const start=clock();this.addEventListener('loadend',()=>ring({kind:'network',transport:'xhr',status:this.status,durationMs:Math.round(clock()-start)}),{once:true});return xhrSend.apply(this,args);};
  const originalConsole={},installedConsole={};
  for (const level of ['log','warn','error','info','debug']) {
    originalConsole[level]=console[level]; installedConsole[level]=console[level]=function(...args){ring({kind:'console',level,argumentTypes:args.map(x=>typeof x)});return originalConsole[level].apply(this,args);};
  }
  const onError=()=>ring({kind:'error',code:'window_error'}), onRejection=()=>ring({kind:'error',code:'unhandled_rejection'});
  const onVisibility=()=> { if(document.hidden) {clear(); if(identity) void post({op:'poll',...feedback()}).catch(()=>{});} };
  const onHide=()=>{clear();if(identity)navigator.sendBeacon(endpoint,new Blob([JSON.stringify({op:'poll',...feedback(),visible:false})],{type:'application/json'}));};
  addEventListener('error',onError);addEventListener('unhandledrejection',onRejection);addEventListener('visibilitychange',onVisibility);addEventListener('pagehide',onHide);
  const installed={fetch:window.fetch,ws:window.WebSocket,rtc:window.RTCPeerConnection,gum:navigator.mediaDevices?.getUserMedia,xhrOpen:XMLHttpRequest.prototype.open,xhrSend:XMLHttpRequest.prototype.send};
  window.__iosWebAgent={version,register:(key,read)=>{if(!/^[a-z][a-z0-9-]{0,63}$/.test(key)||typeof read!=='function')throw new Error('domain_contract');domains.set(key,read);return()=>domains.delete(key);},status:()=>({version,browser,page:identity?.page,connected:!!identity,owned:!!lease,indicator:glow.style.display!=='none'}),stop:()=>{sessionStorage.removeItem('ios-agent-page');stopped=true;onHide();clearInterval(timer);glow.remove();if(Element.prototype.attachShadow===installedAttachShadow)Element.prototype.attachShadow=originalAttachShadow;if(window.fetch===installed.fetch)window.fetch=originalFetch;if(window.WebSocket===installed.ws)window.WebSocket=originalWS;if(window.RTCPeerConnection===installed.rtc)window.RTCPeerConnection=originalRTC;if(originalGUM&&navigator.mediaDevices.getUserMedia===installed.gum)navigator.mediaDevices.getUserMedia=originalGUM;if(XMLHttpRequest.prototype.open===installed.xhrOpen)XMLHttpRequest.prototype.open=xhrOpen;if(XMLHttpRequest.prototype.send===installed.xhrSend)XMLHttpRequest.prototype.send=xhrSend;listeners.forEach(remove=>remove());for(const level of Object.keys(originalConsole))if(console[level]===installedConsole[level])console[level]=originalConsole[level];removeEventListener('error',onError);removeEventListener('unhandledrejection',onRejection);removeEventListener('visibilitychange',onVisibility);removeEventListener('pagehide',onHide);delete window.__iosWebAgent;}};
  void loop();
})();
