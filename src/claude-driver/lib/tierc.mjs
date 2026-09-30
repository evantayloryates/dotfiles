// Tier C: computer use through codex-bridge (in-process, same engine as its
// MCP server). Used for what neither disk, deep links nor ccd_* tools reach:
// broker revival when the app will not warm-spawn, window management, and
// UI-only affordances. Results are claims; callers verify through Tier A.

import { DriverError } from './paths.mjs'

let bridgeMod = null
async function bridge() {
  if (!bridgeMod) bridgeMod = await import('../../codex-bridge/lib/bridge.mjs')
  return new bridgeMod.Bridge({ log: (...a) => console.error('[claude-driver:tier-c]', ...a) })
}

const POSTURE =
  'You are operating the Claude desktop app (bundle com.anthropic.claudefordesktop) on behalf of claude-driver, an automation tool Taylor owns. ' +
  'Touch only the Claude app. Never click any approval card, permission prompt, delete confirmation or "Allow" button; if one appears, stop and report it. ' +
  'Do not type anything except the exact text given. Report precisely what you saw and did.'

export async function computerUse(task, { timeoutSec = 180, session = 'claude-driver', progress = () => {}, signal } = {}) {
  const b = await bridge()
  try {
    const { result, text } = await b.run(
      { task: `${POSTURE}\n\nTask: ${task}`, session, apps: ['Claude', 'com.anthropic.claudefordesktop'], timeout_sec: timeoutSec, screenshots: 'none' },
      { progress, signal }
    )
    return { status: result.status, text }
  } catch (err) {
    throw new DriverError(`Tier C (codex-bridge) failed: ${err.message}`, { category: 'tier_c_failed' })
  } finally {
    b.close()
  }
}

// Type a line into the composer of the session currently shown in the main
// window and send it. The caller navigates there first (deep link).
export async function typeIntoComposer(expectedTitle, line, opts) {
  return computerUse(
    `The Claude app's main window should be showing the Code session titled "${expectedTitle}". Confirm the session title shown matches exactly; if it does not, stop and report what is shown. ` +
      `Click its message composer (the text box at the bottom), type exactly: ${line}\nthen press Return once to send it. Then report "sent" or what went wrong.`,
    opts
  )
}
