// Fixed developer controls only. Never reconstruct input after an unknown outcome.
export const audioProbePlan = {
  scope: 'Synthetic DEV coaching call only; no production or staging',
  prerequisite: 'Read ios-agent://audio-probe. Prepare and independently verify the exact local fixture/provider room with recording disabled before joining. Start the isolated receiver on3044/private10522. A real foreground Safari/Chrome page must expose transport-lab and have its primary call connected with microphone enabled.',
  operations: ['select one strategy/fault', 'run once', 'read the terminal result after about10 seconds', 'stop only a known active probe'],
  strategies: ['pcm-ws', 'opus-ws', 'webrtc'],
  faults: ['none', 'slow-reader', 'outage', 'drop-10', 'disable-opus'],
  limits: 'Page synthetic input; cannot accept a system permission prompt. Receiver decodes the extra probe stream; it does not replace or fault the primary Twilio call. Byte counts exclude transport overhead; RTT is acknowledgment timing, not audible latency. Native WebRTC host ICE is qualified nearby only; off-LAN connectivity remains unproven.',
  cleanup: 'Probe stops after10 seconds, source end/mute, visibility loss or loss of the ownership under which it started. Always exit the primary call, leave its route and verify web-call released before ios_web_end.'
};
export function validProbeSelection(strategy, fault) {
  return audioProbePlan.strategies.includes(strategy) && audioProbePlan.faults.includes(fault) &&
    !(fault === 'drop-10' && strategy === 'webrtc') && !(fault === 'disable-opus' && strategy !== 'opus-ws');
}
export function probeExpression(action, strategy, fault) {
  const guard = `if(!window.__iosWebAgent?.status().owned||document.hidden)throw Error('probe_owner_required');const s=document.querySelector('[aria-label="Audio transport strategy"]'),f=document.querySelector('[aria-label="Audio transport situation"]');if(!s||!f)throw Error('probe_controls_missing');`;
  if(action === 'select') {
    if(!validProbeSelection(strategy,fault))throw Error('invalid_probe_selection');
    return `(async()=>{${guard}if(s.disabled||f.disabled)throw Error('probe_running');const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('change',{bubbles:true}));};set(s,${JSON.stringify(strategy)});await new Promise(requestAnimationFrame);if(!window.__iosWebAgent?.status().owned||document.hidden)throw Error('probe_owner_required');set(f,${JSON.stringify(fault)});await new Promise(requestAnimationFrame);return{inputSent:true,strategy:s.value,fault:f.value,delivery:'synthetic-dom'};})()`;
  }
  if(!['run','stop'].includes(action))throw Error('invalid_probe_operation');
  const label = action === 'run' ? 'Run audio transport probe' : 'Stop audio transport probe';
  return `(()=>{${guard}const b=[...document.querySelectorAll('button')].filter(x=>x.textContent===${JSON.stringify(label)});if(b.length!==1||b[0].disabled)throw Error('probe_control_unavailable');b[0].click();return{inputSent:true,delivery:'synthetic-dom'};})()`;
}
