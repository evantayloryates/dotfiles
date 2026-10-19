// Count only fixed local-stack workers; other agents' web ports are independent.
export function countProcesses(records) {
  const byPid = new Map(records.map(r => [String(r.pid), r]));
  const webPort = (record) => {
    const seen = new Set();let envPort;
    for (let r = record; r && !seen.has(String(r.pid)); r = byPid.get(String(r.parent))) {
      seen.add(String(r.pid));
      for (let i = 0; i < r.args.length; i++) {
        const v = r.args[i];
        if (v === '--port' || v === '-p') return String(r.args[i + 1]);
        if (v.startsWith('--port=')) return v.slice(7);
      }
      if (envPort === undefined && r.envPort) envPort = String(r.envPort);
      if (seen.size >= 8) break;
    }
    return envPort || '3000';
  };
  const counts = {server: 0, starter: 0, web: 0};
  for (const r of records) {
    const a = r.args.join(' ');
    if (r.cwd === '/workspaces/kickoff/node') {
      if (a.includes('.webpack/server.development.js')) counts.server++;
      if (/build:server:demo:watch|dev-demo-server.sh|webpack.development.demo/.test(a)) counts.starter++;
    }
    if (r.cwd === '/workspaces/kickoff/next' &&
        r.args.some(v => v.startsWith('next-server') || v === 'start:demo:development' || /(^|\/)dev-demo\.sh$/.test(v) || /(^|\/)next$/.test(v)) &&
        webPort(r) === '3000') counts.web++;
  }
  return counts;
}
