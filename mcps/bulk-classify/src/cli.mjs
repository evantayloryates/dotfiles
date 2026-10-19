// classifier CLI: the same operations as the MCP tools, for scripts and
// shell-capable agents. Run through the launcher (`classifier ...`), which
// supplies the key and the scope.

import { readFileSync } from 'node:fs'
import { prune } from './lib/jobs.mjs'
import { ensureDirs, RETENTION_DAYS, SCOPE } from './lib/paths.mjs'
import { callerFrom, cancelJob, classifyTexts, GUIDE, init, jobResults, profilesText, sampleTexts, saveProfileText, startJob, waitJob } from './lib/service.mjs'

const USAGE = `usage: classifier <command> [options]

  texts    --labels <labels> [--profile p] [--json] TEXT...      label up to 50 texts now
  start    --labels <labels> | --profile p  --input FILE [--output FILE] [--text-field f] [--id-field f]
           [--filter JSON] [--offset n] [--limit n] [--include-text] [--max-usd n] [--wait]  start a background job
  start    --resume JOB_ID [--max-usd n]                          continue a failed or cancelled job
  sample   --input FILE [--n 20] [--text-field f]                 a spread of texts, for designing labels
  wait     JOB_ID [--seconds n]                                   wait for a job (repeats until done with --until-done)
  results  JOB_ID [--label l] [--confidence c] [--status s] [--cursor n] [--page-size n]
  cancel   JOB_ID
  profiles [NAME]
  profile-save --name n [--purpose text] [--labels <labels>] [--add-labels <labels>] [--examples FILE.json] [--notes text]
           [--generate n] [--append | --replace --replace-version v] [--distinct]
  prune    [--days n] [--dry-run]                                 delete jobs older than the window (${RETENTION_DAYS} days here)
  guide

<labels>: comma-separated names ("billing,scheduling"), a JSON array, or @FILE with either.
Common: --max-labels 2, --prefer accuracy, --examples FILE.json ([{"text","label"}]).`

function parse(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      out._.push(a)
      continue
    }
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[key] = true
    else {
      out[key] = next
      i++
    }
  }
  return out
}

function labelsArg(v) {
  if (v === undefined || v === true) return undefined
  let src = v
  if (v.startsWith('@')) {
    try {
      src = readFileSync(v.slice(1), 'utf8')
    } catch {
      throw Object.assign(new Error(`labels file not found: ${v.slice(1)}`), { expected: true })
    }
  }
  const t = src.trim()
  if (t.startsWith('[')) return JSON.parse(t)
  return t.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
}
const jsonFile = (v) => (v === undefined ? undefined : JSON.parse(readFileSync(v, 'utf8')))
const jsonArg = (v) => (v === undefined ? undefined : JSON.parse(v))
const num = (v) => (v === undefined ? undefined : Number(v))

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const o = parse(rest)
  const caller = callerFrom('cli', process.cwd())
  const common = { labels: labelsArg(o.labels), profile: o.profile, examples: jsonFile(o.examples), max_labels: num(o['max-labels']), prefer: o.prefer }
  switch (cmd) {
    case 'texts': {
      const items = o._.length ? o._ : readFileSync(0, 'utf8').split('\n').filter((l) => l.trim())
      const r = await classifyTexts({ ...common, items })
      return o.json ? JSON.stringify(r.data, null, 1) : r.text
    }
    case 'start': {
      const text = await startJob(
        o.resume
          ? { resume_job_id: o.resume, max_usd: num(o['max-usd']) }
          : { ...common, max_usd: num(o['max-usd']), input_file: o.input, output_path: o.output, include_text: !!o['include-text'], text_field: o['text-field'], id_field: o['id-field'], filter: jsonArg(o.filter), offset: num(o.offset), limit: num(o.limit) },
        { caller }
      )
      if (!o.wait) return text
      const id = text.match(/cls_[0-9a-f]{8}/)?.[0]
      if (!id || /Finished already/.test(text)) return `${text}\n\n${id ? jobResults({ job_id: id }, { caller }) : ''}`
      return untilDone(id, caller)
    }
    case 'sample':
      return sampleTexts({ input_file: o.input, job_id: o.job, n: num(o.n), text_field: o['text-field'], filter: jsonArg(o.filter) }, { caller })
    case 'wait':
      if (o['until-done']) return untilDone(o._[0], caller)
      return waitJob({ job_id: o._[0], wait_seconds: num(o.seconds) }, { caller })
    case 'results':
      return jobResults({ job_id: o._[0], label: o.label, confidence: o.confidence, status: o.status, cursor: o.cursor, page_size: num(o['page-size']), text_chars: num(o['text-chars']), output_path: o.output, include_text: !!o['include-text'] }, { caller })
    case 'cancel':
      return cancelJob({ job_id: o._[0] }, { caller })
    case 'profiles':
      return profilesText({ name: o._[0] })
    case 'profile-save':
      return saveProfileText({ name: o.name, purpose: o.purpose, labels: labelsArg(o.labels), add_labels: labelsArg(o['add-labels']), examples: jsonFile(o.examples), notes: o.notes, generate_examples: num(o.generate), append: !!o.append, replace: !!o.replace, replace_version: num(o['replace-version']), distinct: !!o.distinct, from_job_id: o['from-job'] }, { caller })
    case 'prune': {
      const r = prune(num(o.days) ?? RETENTION_DAYS, { dryRun: !!o['dry-run'] })
      return `${o['dry-run'] ? 'Would remove' : 'Removed'} ${r.removed} job${r.removed === 1 ? '' : 's'} older than ${r.days} days (${SCOPE} scope); ${r.kept} kept.`
    }
    case 'guide':
      return GUIDE
    default:
      return USAGE
  }
}

async function untilDone(id, caller) {
  for (;;) {
    const text = await waitJob({ job_id: id, wait_seconds: 50 }, { caller })
    if (!/ running: /.test(text)) {
      if (/ finished: /.test(text)) return `${text}\n\n${jobResults({ job_id: id }, { caller })}`
      return text
    }
    process.stderr.write(`${text.split('\n')[0]}\n`)
  }
}

// Every command prunes expired jobs first, except prune itself (so a dry run
// stays dry).
if (process.argv[2] !== 'prune') init()
else ensureDirs()
main().then(
  (out) => {
    process.stdout.write(`${out}\n`)
    process.exit(0)
  },
  (err) => {
    if (err.expected) process.stderr.write(`${err.message}\n`)
    else process.stderr.write(`classifier: internal error (${err.code || err.name})${process.env.CLASSIFIER_DEBUG ? `\n${err.stack}` : ''}\n`)
    process.exit(1)
  }
)
