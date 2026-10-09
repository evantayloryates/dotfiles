#!/usr/bin/env node
// Local evidence CLI. Never imports Bridge or connects to the app-server.
import { readFileSync } from 'node:fs'
import { EvidenceStore } from './lib/capability-evidence.mjs'
import { planCapabilities } from './lib/capability-planner.mjs'

const [command, file, extra] = process.argv.slice(2)
try {
  if (!command || command === 'help') {
    console.log('node evidence.mjs fact FILE.json | facts ENTITY.json [--expired] | plan REQUEST.json | receipt FILE.json | receipts SESSION_ID')
  } else {
    const store = new EvidenceStore()
    let output
    if (command === 'fact' || command === 'receipt') {
      output = store.put(command === 'fact' ? 'facts' : 'receipts', JSON.parse(readFileSync(file, 'utf8')))
    } else if (command === 'plan') {
      output = planCapabilities(store, JSON.parse(readFileSync(file, 'utf8')))
    } else if (command === 'facts') {
      output = store.facts(JSON.parse(readFileSync(file, 'utf8')), { includeExpired: extra === '--expired' })
    } else if (command === 'receipts') {
      output = store.receipts(file)
    } else throw new Error('unknown evidence command')
    console.log(JSON.stringify(output))
  }
} catch (error) { console.error(error.message); process.exitCode = 1 }
