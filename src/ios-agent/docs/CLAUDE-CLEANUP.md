# Claude turn cleanup — prepared integration

The MCP cleanup bridge is available in1.9.29. The Claude hook configuration is
**prepared, not installed or physically qualified**. Actual CLI dispatch is now
qualified below against local fixtures. Continue explicit native/web/system
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

## Actual CLI qualification without account repair —11October

The one-shot `tests/claude_hook_probe.py ordinary|continuation|failure` runs the
installed CLI2.1.292 against a loopback fake Messages API. It uses an isolated
config directory and the candidate hook file. The synthetic MCP fixture runs
the production server/backend with mock phone IPC; no phone or provider is used.
This checks actual harness dispatch, not model intelligence or physical control.

Observed outcomes:
- PreToolUse adds the actual session/prompt tuple; absent main-agent ID becomes
  an empty string. Ordinary Stop calls the same MCP connection and releases once.
- A separate Stop hook requests continuation. Cleanup completes before the next
  admission, even though the prompt tuple is reused. Both owners release once.
- The injected API400 ends the CLI without a StopFailure event in this version.
  Production MCP EOF cleanup still releases its owner. Do not depend on
  StopFailure delivery for every failure.
- SessionEnd runs after the MCP disconnects in print mode; it cannot substitute
  for EOF cleanup.

Evidence: `claude-live-hooks-2026-10-11.json`. The account authorization problem
no longer blocks lifecycle protocol qualification. The remaining physical gate
is one normal owned workflow followed by actual hook cleanup. A local subagent probe was stopped before admission by automatic review
(`automode-parsing-error`); no owner was acquired, and no permission mode was
changed or retry attempted. This does not prove subagent cleanup failed.
Subagent hook execution remains unqualified. Keep candidate hooks uninstalled until that gate
is satisfied; preserve unrelated settings when merging verified entries.

Stop does not run on user interruption. SessionEnd is opportunistic if its MCP
client has disconnected; it cannot replace EOF/cancellation/20-minute-silence
safeguards. Do not claim universal instant cleanup or extend a retained runner
through this hook. Explicit bounded reservation has its own independent gate.

Primary reference: [Claude Code hook lifecycle and input/output contract](https://code.claude.com/docs/en/hooks).
