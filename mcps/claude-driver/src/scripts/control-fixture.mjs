#!/usr/bin/env node
// Synthetic bounded work for live interruption qualification. No network,
// file writes, subprocesses or approvals. This is deliberately not a test of
// task quality: it holds a real foreground tool until interrupted or done.
const maxSec = Number(process.argv[2] || 120)
if (!Number.isFinite(maxSec) || maxSec < 1 || maxSec > 180) throw new Error('fixture duration must be 1–180 seconds')
console.log('CONTROL_FIXTURE_STARTED')
const timer = setTimeout(()=>console.log('CONTROL_FIXTURE_FINISHED'), maxSec * 1000)
process.on('SIGTERM',()=>{ clearTimeout(timer);console.log('CONTROL_FIXTURE_INTERRUPTED');process.exit(0) })
