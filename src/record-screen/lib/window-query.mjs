import { EngineError } from './client.mjs';

export const windowQuerySchema = {
  type:'object', additionalProperties:false,
  properties:{app:{type:'string',maxLength:256,description:'Bundle id or application name/substring'},
    title:{type:'string',maxLength:256},on_screen_only:{type:'boolean'},
    include_transients:{type:'boolean',description:'Explicit opt-in for floating/small/helper windows. Requires native transient_window_inventory1; default normal inventory unchanged. Membership does not establish ownership or pixels.'},
    limit:{type:'integer',minimum:1,maximum:1000}},
};
export function validateWindowQuery(a) {
  if (!a || typeof a!=='object' || Array.isArray(a) || Object.keys(a).some(k=>!Object.hasOwn(windowQuerySchema.properties,k)) ||
      ['app','title'].some(k=>a[k]!==undefined&&(typeof a[k]!=='string'||a[k].length>256)) ||
      ['on_screen_only','include_transients'].some(k=>a[k]!==undefined&&typeof a[k]!=='boolean') ||
      (a.limit!==undefined&&(!Number.isInteger(a.limit)||a.limit<1||a.limit>1000))) {
    throw new EngineError('bad_window_query','Use bounded app/title, boolean on_screen_only/include_transients and optional whole limit1–1000.');
  }
  return a;
}
export function requireTransientInventory(status,query) {
  if (Object.hasOwn(query,'include_transients') && status?.capabilities?.transient_window_inventory!==1) {
    throw new EngineError('unsupported_transient_window_inventory','Loaded native engine lacks transient_window_inventory1; explicit discovery scope cannot be silently ignored. Preserve peers and verify supported candidate/delivery state.');
  }
}
