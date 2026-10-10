import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Backend} from '../mcp/backend.mjs';
const wanted=process.argv[2]||'ios-chrome',b=new Backend();let session;
const proof={at:new Date().toISOString(),browser:wanted,scope:'Physical browser microphone into two local in-document WebRTC peers; no playback, recording, external room or upload',gates:{}};
try{
 const p=(await b.webPages()).pages?.find(p=>p.browser===wanted&&p.visible&&p.ready);assert(p,'visible ready intended physical browser required');
 session=(await b.begin({surface:'web',page:p.id})).sessionId;const run=(action,args={})=>b.webAction({sessionId:session,action,args});
 const setup=await run('evaluate',{expression:`(()=>{if(window.__runnerPacketProbe)throw Error('fixture_already_active');const f={state:'requesting',closed:false,stream:null,a:null,b:null};const cleanup=()=>{f.closed=true;f.stream?.getTracks().forEach(t=>t.stop());f.a?.close();f.b?.close();clearTimeout(f.timer);f.state='closed'};f.cleanup=cleanup;f.timer=setTimeout(cleanup,60000);window.__runnerPacketProbe=f;(async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(f.closed){stream.getTracks().forEach(t=>t.stop());return}f.stream=stream;const a=f.a=new RTCPeerConnection({iceServers:[]}),b=f.b=new RTCPeerConnection({iceServers:[]});a.onicecandidate=e=>{if(e.candidate)void b.addIceCandidate(e.candidate).catch(()=>{})};b.onicecandidate=e=>{if(e.candidate)void a.addIceCandidate(e.candidate).catch(()=>{})};for(const t of stream.getAudioTracks())a.addTrack(t,stream);await a.setLocalDescription(await a.createOffer());if(f.closed)return;await b.setRemoteDescription(a.localDescription);await b.setLocalDescription(await b.createAnswer());if(f.closed)return;await a.setRemoteDescription(b.localDescription);f.state='negotiated'}catch{if(!f.closed){cleanup();f.state='failed'}}})();return {requested:true}})()`});assert(setup.ok);
 let first,last;
 for(let i=0;i<20;i++){
  const state=await run('state');assert(state.ok);const m=state.value.domains.media;if(i===1&&m.requests.pending>0)console.log(JSON.stringify({permissionPending:true,browser:wanted}));
  const received=m.audio.filter(s=>s.type==='inbound-rtp').reduce((n,s)=>n+(s.packetsReceived||0),0);
  if(received>0){if(first===undefined)first=received;else if(received>first){last=received;break;}}
  await new Promise(r=>setTimeout(r,500));
 }
 proof.gates.audioReceivedPacketsAdvance=last>first;assert(proof.gates.audioReceivedPacketsAdvance,'positive advancing inbound audio packet counters required');
 const verified=await b.webVerify({sessionId:session,gate:'web-media',direction:'both',sampleMs:1000});assert(verified.ok);proof.gates.MCPSentAndReceivedCountersAdvance=true;const cleanup=await run('evaluate',{expression:"(()=>{const f=window.__runnerPacketProbe;f.cleanup();const stopped=f.stream?.getTracks().every(t=>t.readyState==='ended')===true;delete window.__runnerPacketProbe;return {probeTracksStopped:stopped,peersClosed:f.a?.signalingState==='closed'&&f.b?.signalingState==='closed'}})()"});assert(cleanup.ok&&cleanup.value.probeTracksStopped&&cleanup.value.peersClosed);proof.gates.probeTracksStopped=true;proof.gates.peersClosed=true;
 const end=await b.webEnd(session);session=null;assert.equal(end.indicatorOff,true);proof.gates.glowOff=true;proof.status='passed';
}catch(error){proof.status='failed';proof.failure='physical_audio_packet_gate_not_passed';throw error;}finally{
 if(session){await b.webAction({sessionId:session,action:'evaluate',args:{expression:'window.__runnerPacketProbe?.cleanup();delete window.__runnerPacketProbe;true'}}).catch(()=>{});await b.webEnd(session).catch(()=>{});}
 await b.close();fs.writeFileSync(new URL('../docs/mobile-web-audio-packets-'+wanted+'-2026-10-10.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}
