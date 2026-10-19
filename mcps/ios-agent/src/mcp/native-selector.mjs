// Exact matching only. The native driver remains responsible for freshness,
// hit testing, foreground/ownership and gesture delivery.
export function planNativeTap(tree, selector) {
  if (!tree || typeof tree.snapshot !== 'string' || !tree.snapshot || !Array.isArray(tree.nodes) || tree.truncated===true)
    return {ok:false,reason:'native_selector_tree_unavailable',actionSent:false};
  const fields=Object.entries(selector);
  if(!fields.length || !fields.every(([key,value])=>['label','identifier','class'].includes(key) && typeof value==='string' && value.length>0))
    return {ok:false,reason:'native_selector_invalid',actionSent:false};
  const matches=tree.nodes.filter(n=>n.visible===true && n.interactive===true &&
    fields.every(([key,value])=>n[key]===value) && typeof n.node==='string' &&
    Array.isArray(n.rect) && n.rect.length===4 && n.rect.every(Number.isFinite) &&
    n.rect[2]>0 && n.rect[3]>0);
  if(matches.length!==1)return {ok:false,reason:matches.length?'native_selector_ambiguous':'native_selector_not_found',matches:matches.length,actionSent:false};
  const n=matches[0], [x,y,w,h]=n.rect;
  const point={snapshot:tree.snapshot,target:n.node,x:x+w/2,y:y+h/2};
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.y<0)return {ok:false,reason:'native_selector_point_outside_viewport',actionSent:false};
  return {ok:true,point};
}
