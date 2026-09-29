// Machine-local bridge state: which Codex thread backs each named session,
// and app grants made through codex_approve_app. Lives outside the repo.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const STATE_DIR = process.env.CODEX_BRIDGE_STATE_DIR || join(homedir(), '.local', 'state', 'codex-bridge')
export const SCREENSHOT_DIR = join(STATE_DIR, 'screenshots')
export const TIMELINE_DIR = join(STATE_DIR, 'timelines')
const STATE_FILE = join(STATE_DIR, 'state.json')

const EMPTY = { sessions: {}, grants: {} }

export function loadState() {
  try {
    if (!existsSync(STATE_FILE)) return structuredClone(EMPTY)
    const data = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    return { ...structuredClone(EMPTY), ...data }
  } catch {
    return structuredClone(EMPTY)
  }
}

export function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true })
  const tmp = `${STATE_FILE}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  renameSync(tmp, STATE_FILE)
}

export function updateState(mutate) {
  const state = loadState()
  mutate(state)
  saveState(state)
  return state
}

export function ensureScreenshotDir() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
  return SCREENSHOT_DIR
}

export function ensureTimelineDir() {
  mkdirSync(TIMELINE_DIR, { recursive: true })
  return TIMELINE_DIR
}
