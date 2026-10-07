// Fixed adapter-protocol diagnostics. Never return exception text or tool data.
// This helper is staged only and is not imported by the installed probe.
export function diagnosticFailure(error) {
 let text=''
 try { if(typeof error?.message==='string')text=error.message } catch {}
 if(text.includes('$.mcp.call: no connected MCP tool'))return 'mcp-tool-unavailable'
 if(text.includes('$.tool.call: no tool named'))return 'tool-hidden-or-unavailable'
 if(text.includes('produced no result'))return 'tool-pipeline-no-result'
 if(text.includes('$.mcp.call(')&&text.includes(') refused:')) {
  if(text.includes('Native broker operation lacks one live matching epoch-bound dispatch checkpoint'))return 'broker-dispatch-gate-refusal'
  return 'tool-permission-refusal'
 }
 return 'unidentified-exception'
}
