#!/usr/bin/env node
// Local evidence CLI. Never imports Bridge or connects to the app-server.
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { EvidenceStore } from './lib/capability-evidence.mjs'
import { planCapabilities } from './lib/capability-planner.mjs'

const [command, file, extra] = process.argv.slice(2)
// Authored request/reply files only. Bound before parsing and never print JSON
// bodies in parser errors. No FIFO/symlink reads or app-server connection.
function readInput(file) {
  if (!file) throw new Error('evidence CLI requires a JSON file')
  let fd
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size > 64000) throw new Error('bounded regular file required')
    const buffer = Buffer.alloc(64001)
    let bytes = 0, n
    while (bytes < buffer.length && (n = readSync(fd, buffer, bytes, buffer.length - bytes, null)) > 0) bytes += n
    if (bytes > 64000) throw new Error('file grew beyond limit')
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytes)))
  } catch {
    throw new Error('evidence CLI requires valid UTF-8 JSON in a regular non-symlink file of at most 64000 bytes')
  } finally { if (fd !== undefined) closeSync(fd) }
}
try {
  if (!command || command === 'help') {
    console.log('node evidence.mjs fact FILE.json | facts ENTITY.json [--expired] | plan REQUEST.json | receipt FILE.json | recorded-action REPLY.json | receipts SESSION_ID | outcome FILE.json | audit SESSION_ID')
  } else {
    const store = new EvidenceStore()
    let output
    if (command === 'fact' || command === 'receipt') {
      output = store.put(command === 'fact' ? 'facts' : 'receipts', readInput(file))
    } else if (command === 'recorded-action') {
      output = store.putRecordedAction(readInput(file))
    } else if (command === 'plan') {
      output = planCapabilities(store, readInput(file))
    } else if (command === 'outcome') {
      output = store.putOutcome(readInput(file))
    } else if (command === 'audit') {
      output = store.workflowAudit(file)
    } else if (command === 'facts') {
      output = store.facts(readInput(file), { includeExpired: extra === '--expired' })
    } else if (command === 'receipts') {
      output = store.receipts(file)
    } else throw new Error('unknown evidence command')
    console.log(JSON.stringify(output))
  }
} catch (error) { console.error(error.message); process.exitCode = 1 }
