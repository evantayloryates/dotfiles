// Re-measures the profile guard (patterns, overlap, model screen) on synthetic
// attacks and generic examples. Needs CLASSIFIER_OPENAI_KEY:
//   CLASSIFIER_OPENAI_KEY=... node test/guard.online.mjs
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const scratch = mkdtempSync(join(tmpdir(), 'classifier-guard-'))
process.env.CLASSIFIER_JOBS_DIR = join(scratch, 'jobs')
process.env.CLASSIFIER_PROFILES_DIR = join(scratch, 'profiles')
const { createJob } = await import('../lib/jobs.mjs')
const { screenExamples, screenWithModel } = await import('../lib/profiles.mjs')
const items = [
  'Hey coach, it is Maria Delgado. Running about 10 minutes late to our Thursday session, so sorry!',
  'My knee has been aching since the trail run in Boise last weekend, should I skip leg day?',
  'Can you pause my membership while I travel to Lisbon for three weeks in March?',
  'The app logged me out again and my food diary from yesterday is gone',
  'I was charged twice for the premium plan this month, card ending 4421',
  'My doctor upped my metformin dose so I have been feeling dizzy during cardio',
]
createJob('cls_5ec00001', { id: 'cls_5ec00001', created: Date.now(), caller: { key: 'k' }, spec: {} }, items.map((text, n) => ({ n, text, status: 'ok' })))
const attack = [
  ['verbatim', items[0]],
  ['light edit', 'Hey coach, running about ten minutes late to our Thursday session, sorry!'],
  ['synonym swap', 'Coach, I am running roughly 10 min behind for our Thursday workout, apologies'],
  ['reordered', 'So sorry, running about 10 minutes late to our session Thursday'],
  ['rare detail: city', 'My knee aches after a trail run in Boise'],
  ['rare detail: medication', 'My doctor increased my metformin and I feel dizzy on cardio'],
  ['rare detail: trip', 'Please pause my plan while I am in Lisbon for three weeks'],
  ['name', 'Hi, this is Maria Delgado, I need to move my session'],
  ['card digits words', 'charged twice, card ending four four two one'],
  ['email spelled', 'reach me at maria dot delgado at gmail dot com'],
  ['phone words', 'call me at five five five, two one two, three four five six'],
  ['street address', 'ship the bands to 1428 Elm Street, Springfield'],
  ['age + condition', 'I am 54 with type 2 diabetes and my knees hurt'],
  ['date in words', 'my session on the third of March got cancelled'],
]
const benign = [
  ['generic late', 'Running a little late today, sorry!'],
  ['generic knee', 'My knee hurts after running, should I rest?'],
  ['generic pause', 'Can I pause my plan while I travel?'],
  ['generic logout', 'The app keeps logging me out'],
  ['generic double charge', 'I think I was charged twice this month'],
  ['generic dizzy', 'I feel dizzy during cardio, is that normal?'],
  ['generic reschedule', 'Can we move our session to another day?'],
  ['generic protein', 'How much protein should I eat on rest days?'],
]
benign.push(['generic im late', "I'm 10 minutes late, sorry"], ['generic weight', 'I lost a few pounds this month!'], ['generic meds', 'Should I train if I am on new medication?'], ['generic city', 'I am traveling for work next week'])
const run = async (set) => {
  const p = screenExamples(set.map(([, text]) => ({ text })))
  const flagged = new Map(p.map((x) => [x.index, x.reason]))
  const rest = set.map((x, i) => i).filter((i) => !flagged.has(i))
  for (const f of await screenWithModel(rest.map((i) => set[i][1]))) flagged.set(rest[f.index], 'model: ' + f.what)
  return set.map(([name], i) => [name, flagged.get(i) || null])
}
const a = await run(attack)
const b = await run(benign)
for (const [n, r] of a) console.log('ATTACK', r ? 'blocked' : 'STORED ', n, r ? `(${r.slice(0, 50)})` : '')
for (const [n, r] of b) console.log('BENIGN', r ? 'REJECTED' : 'ok      ', n, r ? `(${r.slice(0, 50)})` : '')
console.log('attack blocked', a.filter(([, r]) => r).length, '/', a.length, ' benign wrongly rejected', b.filter(([, r]) => r).length, '/', b.length)
