// Decide whether the GraphQL backend the phone reaches on :4000 is the guarded
// local server. Only the process listening on :4000 and its own server family
// (launcher parents and forked workers that run the same bundle) are judged.
// Browser-test and slot servers in other worktrees listen elsewhere and do not
// make the phone's backend unsafe, so they no longer block it.
const SERVER = /(?:^|\/)\.webpack\/server\.development\.js$/;

export function verifyGuardedBackend(records, listenerPids) {
  const byPid = new Map(records.map(r => [String(r.pid), r]));
  const isServer = r => !!r && r.args.some(a => SERVER.test(a));
  const children = new Map();
  for (const r of records) {
    const list = children.get(String(r.parent)) || [];
    list.push(r);
    children.set(String(r.parent), list);
  }
  const listeners = listenerPids.map(p => byPid.get(String(p)));
  // Unknown listeners (unreadable or a different program) are a refusal.
  if (!listeners.length || !listeners.every(isServer)) return false;
  const family = new Map();
  for (const listener of listeners) {
    let root = listener;
    const seen = new Set([String(root.pid)]);
    for (let parent = byPid.get(String(root.parent)); isServer(parent) && !seen.has(String(parent.pid)); parent = byPid.get(String(parent.parent))) {
      seen.add(String(parent.pid));
      root = parent;
    }
    const queue = [root];
    while (queue.length) {
      const r = queue.shift();
      if (family.has(String(r.pid))) continue;
      family.set(String(r.pid), r);
      queue.push(...(children.get(String(r.pid)) || []));
    }
  }
  // The guarded offline server can fork workers. Every member running the
  // bundle must keep the exact local contract; several safe ones are fine.
  const servers = [...family.values()].filter(isServer);
  return servers.length > 0 && servers.every(r => r.local === true);
}
