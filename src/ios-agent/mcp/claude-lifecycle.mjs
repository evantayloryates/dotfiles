// Harness identifiers are cleanup fences, not device authentication. A hook can
// retire only this MCP connection's sessions carrying the exact same tuple.
import {emitSignal} from './signal-log.mjs';
const note=(event,fields)=>{try{emitSignal('mcp',event,fields);}catch{}};
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const agent=/^[A-Za-z0-9_-]{1,128}$/;
export function claudeTurnOwner(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).some(k=>!['sessionId','promptId','agentId'].includes(k))||
    !uuid.test(value.sessionId||'')||!uuid.test(value.promptId||'')||
    value.agentId!==undefined&&value.agentId!==''&&!agent.test(value.agentId))
    throw Error('exact_claude_prompt_owner_required');
  return {sessionId:value.sessionId.toLowerCase(),promptId:value.promptId.toLowerCase(),agentId:value.agentId||''};
}
export function sameClaudeTurn(a,b) {
  return !!a&&a.sessionId===b.sessionId&&a.promptId===b.promptId&&a.agentId===b.agentId;
}

// Deterministic PreToolUse adapter. It does not grant permissions, read a
// transcript, contact a service, or keep a mutable "current agent" binding.
export function claudeBeginHook(input) {
  if(input?.hook_event_name!=='PreToolUse'||
    !/^mcp__ios-agent__ios_(?:begin|web_begin|web_open|system_begin)$/.test(input.tool_name||''))return {};
  const original=input.tool_input;
  if(!original||typeof original!=='object'||Array.isArray(original))return {};
  let owner;
  try{owner=claudeTurnOwner({sessionId:input.session_id,promptId:input.prompt_id,...(input.agent_id?{agentId:input.agent_id}:{})});}
  catch{return {};}
  // Never silently replace an explicitly selected Codex owner.
  if(original.rollout!==undefined||original.threadId!==undefined)return {};
  note('harness.owner_bound',{ownerId:owner.sessionId,kind:'claude-prompt',ownerMode:'claude-prompt',epoch:owner.promptId,
    tool:input.tool_name?.replace(/^mcp__ios-agent__/,''),session:owner.sessionId});
  return {hookSpecificOutput:{hookEventName:'PreToolUse',updatedInput:{...original,claudeOwner:owner}}};
}
