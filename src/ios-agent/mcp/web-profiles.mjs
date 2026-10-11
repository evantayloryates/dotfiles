// Named local stacks on one private host. No caller-supplied origin or upstream.
export function webProfileOrigin(webURL, profile='app') {
  if(!['app','call-rig'].includes(profile))throw Error('fixed_web_profile_required');
  const url=new URL(webURL);
  if(url.protocol!=='https:' || !/^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$/.test(url.hostname) || url.port!=='10446' || url.username || url.password || url.search || url.hash || url.pathname!=='/')throw Error('private_web_origin_required');
  if(profile==='call-rig')url.port='10520';
  return url.origin;
}
