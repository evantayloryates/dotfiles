import test from 'node:test'
import assert from 'node:assert/strict'
import {diagnosticFailure} from '../candidates/native-mod-probe/diagnostic-failure.js'

test('adapter errors expose fixed categories while suppressing sensitive text',()=>{
 const cases=[
 ['probe: $.mcp.call: no connected MCP tool private-token on a server named private-server','mcp-tool-unavailable'],
 ['probe: $.tool.call: no tool named private-tool in this session','tool-hidden-or-unavailable'],
 ['probe: $.tool.call(private-tool) produced no result (aborted)','tool-pipeline-no-result'],
 ['probe: $.mcp.call(s,t) refused: Native broker operation lacks one live matching epoch-bound dispatch checkpoint, private-data','broker-dispatch-gate-refusal'],
 ['probe: $.mcp.call(s,t) refused: private-user-reason','tool-permission-refusal'],
 ['private-token','unidentified-exception']]
 for(const [message,expected] of cases)assert.equal(diagnosticFailure(Error(message)),expected)
 assert.equal(diagnosticFailure(null),'unidentified-exception')
 assert.equal(diagnosticFailure({get message(){throw Error('private')}}),'unidentified-exception')
})
