#!/usr/bin/env node
// Protocol v5 dispatch checkpoint; called by the broker, never by an LLM sender.
import { dirname } from 'node:path'
const [id, index] = process.argv.slice(2)
const dirAt = process.argv.indexOf('--dir')
if (dirAt >= 0) process.env.CLAUDE_DRIVER_STATE_DIR = dirname(process.argv[dirAt + 1])
const { authorizeDispatch } = await import('../lib/requests.mjs')
console.log(JSON.stringify(await authorizeDispatch(id, Number(index))))
