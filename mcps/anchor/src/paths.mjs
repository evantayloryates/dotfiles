import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The package root (mcps/anchor). Runtime state defaults to the fleet's state
// folder; tests point ANCHOR_STATE_DIR and ANCHOR_SERVICES_DIR elsewhere
// (test/env.mjs).
const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function paths() {
  const stateDir = process.env.ANCHOR_STATE_DIR || join(homedir(), '.local/state/mcps/anchor')
  return {
    lab: PKG,
    servicesDir: process.env.ANCHOR_SERVICES_DIR || join(PKG, 'services'),
    stateDir,
    socket: join(stateDir, 'anchor.sock'),
    pidFile: join(stateDir, 'anchord.pid'),
    daemon: join(PKG, 'src', 'daemon.mjs'),
  }
}
