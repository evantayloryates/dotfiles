// Trim only the repair invocation. No grants, policy or user config changes.
import{readCodexConfig}from'../../../codex-bridge/src/lib/codex-config.mjs';
export function repairWorkerOverrides(config=readCodexConfig()){
 return [...config.mcpServers.map(s=>`mcp_servers.${JSON.stringify(s.name)}.enabled=false`),...config.plugins.map(p=>`plugins.${JSON.stringify(p.id)}.enabled=false`)];
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])process.stdout.write(JSON.stringify(repairWorkerOverrides()));
