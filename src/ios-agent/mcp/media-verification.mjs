// Structural metadata only. Counter references are document-local ordinals,
// never WebRTC report IDs, addresses, SDP or participant identifiers.
export function mediaObservation(before, after, direction, runtime) {
  const ready = v => v?.visible === true && v?.secureContext === true && v?.indicator === true;
  const same = v => ['version','browser','boot'].every(k => typeof runtime?.[k] === 'string' && runtime[k].length > 0 && v?.[k] === runtime[k]);
  const connected = v => Array.isArray(v?.domains?.media?.connections) && v.domains.media.connections.some(p => p?.state === 'connected');
  const counters = (v, type, field) => {
    const audio = v?.domains?.media?.audio;
    const rows = Array.isArray(audio) ? audio.filter(r => r?.type === type) : null;
    if (!rows?.length || rows.length > 512) return null;
    const out = new Map();
    for (const r of rows) {
      if (!Number.isSafeInteger(r.counterRef) || r.counterRef <= 0 || out.has(r.counterRef) ||
          !Number.isSafeInteger(r[field]) || r[field] < 0) return null;
      out.set(r.counterRef, r[field]);
    }
    return out;
  };
  const advancing = (type, field) => {
    const a = counters(before,type,field), b = counters(after,type,field);
    if (!a || !b || a.size !== b.size || [...a].some(([key,value]) => !b.has(key) || b.get(key) < value)) return false;
    return [...a].some(([key,value]) => b.get(key) > value);
  };
  return {sameDocument: same(before) && same(after), foregroundOwned: ready(before) && ready(after),
    connectedPeer: connected(before) && connected(after),
    ...(direction !== 'received' ? {sentPacketsAdvance: advancing('outbound-rtp','packetsSent')} : {}),
    ...(direction !== 'sent' ? {receivedPacketsAdvance: advancing('inbound-rtp','packetsReceived')} : {})};
}
