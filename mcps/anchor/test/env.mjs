// Imported first by every test: tests run on their own state folder and the
// fixture services, never on anchor's real state (~/.local/state/mcps/anchor).
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.env.ANCHOR_STATE_DIR ||= join(homedir(), '.cache/anchor-lab/test-state')
process.env.ANCHOR_SERVICES_DIR ||= join(PKG, 'test/services')
process.env.ANCHOR_ALERT_BACKEND ||= 'log'
