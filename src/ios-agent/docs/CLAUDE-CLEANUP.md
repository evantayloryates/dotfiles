# Claude turn cleanup — prepared integration

The MCP cleanup bridge is available in1.9.29. The Claude hook configuration is
**prepared, not installed or live-qualified**. Continue explicit native/web/system
end in finally. No current Claude settings or active phone owner were changed.

## What is implemented

`mcp/claude-hooks.candidate.json` uses a deterministic PreToolUse command for the
three begin tools. It copies the existing tool arguments and adds `claudeOwner`:
the actual session_id, prompt_id and optional agent_id from the hook event.
There is no shared mutable "current agent" binding, transcript read, model call,
permission override or extra listener. Explicit Codex owner arguments are left
untouched; mixed explicit owners are refused at admission.

Stop, StopFailure, SubagentStop and SessionEnd use a same-connection MCP tool hook
calling `ios_harness_end`. Only sessions tagged with the exact same tuple can end.
Old prompts, another subagent, missing/malformed identifiers, unbound Codex
sessions and other MCP connections cannot be retired by this bridge. Matching
sessions use the normal web glow readback or system Home/runner cleanup; failed
capture/runner/indicator cleanup remains unconfirmed. No runner is adopted.

The candidate assumes the configured server/tool prefix is `ios-agent` and the
local Node executable is on Claude's PATH. Its fixed script path is the existing
personal service source. It is not a portable plugin installer.

## Evidence and remaining gate

Six focused checks cover exact-prompt fencing, delayed old events, parent/child
separation, foreign/unbound owners, cleanup failures, actual hook stdin/stdout,
and MCP protocol/schema forwarding. Existing Codex-owner checks remain separate.
These use isolated adapter fixtures; they do not certify Claude hook delivery.

Installed Claude CLI2.1.292 was invoked in an isolated temporary directory with
only a synthetic MCP server and candidate-style hooks. The tiny real request
failed with expired OAuth before any hook/tool event. No phone command,
credential substitution, login repair or repeated auth attempt followed.

On11October a normal browser sign-in refresh selected the existing configured
Google account. The official Claude Code Authorize button remained disabled in
Arc and in one alternate Chrome attempt. The CLI login listener was stopped;
no authorization was forced and no alternate credential route was used. The
live hook gate remains open, independently of the phone network gate.

After Claude authentication is restored, first run the synthetic hook probe:
confirm PreToolUse argument rewriting, exact prompt IDs, absent main-agent
interpolation, subagent identity and Stop/StopFailure dispatch on the same MCP
connection. Then, at a safe phone-owner handoff, run one normal owned workflow,
observe cleanup and prove an earlier-prompt event cannot retire its replacement. A Stop hook that
continues the same prompt needs its own real-harness ordering check; prompt IDs
are not unique admission IDs. Do not claim that case is already qualified. Merge only
the verified hook entries into existing Claude settings; preserve unrelated hooks.

Stop does not run on user interruption. SessionEnd is opportunistic if its MCP
client has disconnected; it cannot replace EOF/cancellation/20-minute-silence
safeguards. Do not claim universal instant cleanup or extend a retained runner
through this hook. Explicit bounded reservation has its own independent gate.

Primary reference: [Claude Code hook lifecycle and input/output contract](https://code.claude.com/docs/en/hooks).
