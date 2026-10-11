import {setTimeout as delay} from 'node:timers/promises';

// Observation only: unique exact fields, no input or automatic replay. The native
// capture remains responsible for lease/foreground identity on every read.
export async function waitNativeElement({read,owned,selector,state='visible',timeout=12,signal,now=()=>performance.now(),pause=delay}) {
  const fields=Object.entries(selector||{});
  if(!fields.length||!fields.every(([k,v])=>['label','identifier','class'].includes(k)&&typeof v==='string'&&v.length>0&&v.length<=128)||!['visible','interactable'].includes(state)||!Number.isFinite(timeout)||timeout<1||timeout>30)
    throw Error('native_condition_arguments_required');
  const start=now(),deadline=start+timeout*1000;let attempts=0,lastReason='native_element_not_found';
  const result=(passed,reason,ref)=>({receipt:{version:1,gate:'native-element',status:passed?'passed':'failed',attempts,elapsedMs:Math.round(now()-start),observation:{uniqueVisibleElement:passed,interactiveRequired:state==='interactable'},...(reason?{reason}:{})},...(ref?{reference:ref}:{}),inputSent:false,replay:false,limits:'App-owned native hierarchy visibility only; not whole-device occlusion or a committed business value. References expire after five seconds; guarded input still rechecks hit/geometry.'});
  while(now()<deadline){
    if(signal?.aborted)return result(false,'cancelled');
    try{
      owned();attempts++;
      const tree=await read(Math.max(1,Math.min(8000,deadline-now())));owned();
      if(signal?.aborted)return result(false,'cancelled');
      if(!tree||tree.truncated===true||typeof tree.snapshot!=='string'||!Array.isArray(tree.nodes))return result(false,'native_condition_tree_unavailable');
      const matches=tree.nodes.filter(n=>n.visible===true&&(state!=='interactable'||n.interactive===true)&&fields.every(([k,v])=>n[k]===v)&&typeof n.node==='string'&&Array.isArray(n.rect)&&n.rect.length===4&&n.rect.every(Number.isFinite)&&n.rect[2]>0&&n.rect[3]>0);
      if(matches.length>1)return result(false,'native_element_ambiguous');
      if(matches.length===1){
        if(now()>=deadline)return result(false,'native_condition_deadline');
        const n=matches[0];return result(true,null,{snapshot:tree.snapshot,target:n.node,rect:n.rect,interactive:n.interactive===true});
      }
      lastReason='native_element_not_found';
    }catch{return result(false,'native_condition_read_or_ownership_failed');}
    try{await pause(Math.min(600,Math.max(0,deadline-now())),undefined,{signal});}catch{return result(false,'cancelled');}
  }
  return result(false,lastReason);
}
