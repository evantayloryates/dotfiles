// Where the ZDR harness lives. The harness is this service's backend; these
// are the only paths outside the service folder that zdr-agent touches.
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
export const HARNESS_DIR = process.env.ZDR_HARNESS_DIR || join(REPO, 'apps/zdr-agent')
export const HARNESS_CLI = join(HARNESS_DIR, 'bin/zdr-harness')
export const HARNESS_ROOT = process.env.ZDR_HARNESS_ROOT || join(process.env.HOME, '.zdr-harness')
export const EXPORTS_ROOT = join(HARNESS_ROOT, 'exports')
