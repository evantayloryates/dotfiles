// classifier MCP server: label many texts with caller-chosen labels, fast.
// Same server in every harness (ZDR harness, Claude Code, Codex, Cursor); the
// launcher (../classifier-mcp) supplies the key and the scope. See README.md.

import { serveMcp } from '../../../lib/node/mcp-stdio.mjs'
import { callerFrom, cancelJob, classifyTexts, GUIDE, init, jobResults, profilesText, sampleTexts, saveProfileText, startJob, waitJob } from './lib/service.mjs'

const log = (...a) => console.error('[classifier]', ...a)

const INSTRUCTIONS = `Classifies texts (messages, notes, tickets, transcripts) into labels you choose, from 1 to 200,000 items, fast.
Use it whenever the user asks to classify, label, tag, categorize, triage, sort or count texts by topic, including a handful of texts or a small file you could read yourself. Do not label them in your head, and do not write keyword rules or scripts.
- Up to 50 texts already in the conversation: classify_texts.
- A file, or more than 50: classify_start with input_file (pass the path; never read or paste the rows), then classify_wait once, then classify_results.
- Every item for the user (a full list, "raw results"): write a file with output_path; never page through thousands of rows in chat.
- No labels yet: classify_sample shows a spread of the texts; propose labels from it.
- Follow-ups ("same as last week", "the usual categories"): classify_profiles first and reuse the saved label set; if none fits, say the labels are new.
Report the "none" count (fit no label) as its own line. Profiles (saved label sets) are shared and kept forever: their examples must be generic sentences you write yourself, never text from the data.
If these tools are unavailable or keep failing, stop and tell the user. Do not build a substitute.`

const LABELS = {
  description: 'The labels, 2-990. Strings, or {"name", "description"} objects; a one-line description of what belongs in each label improves accuracy. Do not include "none" (automatic).',
  type: 'array',
  items: {
    anyOf: [
      { type: 'string' },
      { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name'] },
    ],
  },
  examples: [[{ name: 'billing', description: 'charges, refunds, invoices' }, { name: 'scheduling', description: 'booking, moving or cancelling sessions' }]],
}
const PROFILE = { type: 'string', description: 'Name of a saved profile to use instead of labels (see classify_profiles).' }
const EXAMPLES = {
  type: 'array',
  description: 'Optional labelled examples for this call only (not stored): [{"text", "label"}]. A few per label raise accuracy a lot.',
  items: { type: 'object', properties: { text: { type: 'string' }, label: { type: 'string' } }, required: ['text', 'label'] },
}
const MAX_LABELS = { type: 'integer', enum: [1, 2], description: '1 (default): one label per item. 2: a main label plus a second one where it clearly applies.' }
const PREFER = { type: 'string', enum: ['speed', 'accuracy'], description: '"speed" (default): confident items skip the model. "accuracy": every item goes to the model; slower.' }
const JOB_ID = { type: 'string', description: 'The job id from classify_start, like cls_8f2a91c4.' }

function tools() {
  const caller = (ctx) => callerFrom(ctx.client?.name, process.cwd())
  return [
    {
      name: 'classify_texts',
      title: 'Classify a few texts now',
      description: 'Label up to 50 texts right now; the labels come back in this response (usually in 1-2 seconds). Use it for texts already in the conversation, even a few you could label yourself: it is the auditable answer, with a "none" bucket and confidence. For a file or more than 50 texts, use classify_start.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          items: { type: 'array', description: 'Up to 50 texts, or {"id", "text"} objects. Send them as they are.', items: { anyOf: [{ type: 'string' }, { type: 'object', properties: { id: { type: ['string', 'number'] }, text: { type: 'string' } }, required: ['text'] }] } },
          labels: LABELS,
          profile: PROFILE,
          examples: EXAMPLES,
          max_labels: MAX_LABELS,
          prefer: PREFER,
        },
        required: ['items'],
      },
      handler: async (args, ctx) => (await classifyTexts(args, { signal: ctx.signal })).text,
    },
    {
      name: 'classify_start',
      title: 'Start a background classification job',
      description: 'Start a background job to label many texts (up to 200,000). Pass input_file (a JSONL, CSV, JSON or text file; the service reads it, so do not read or paste the rows) or up to 500 items. Use filter, offset and limit for subsets instead of preparing a new file. Returns a job id; then call classify_wait once. To continue a failed or cancelled job, pass only resume_job_id.',
      annotations: { readOnlyHint: false, openWorldHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          input_file: { type: 'string', description: 'Path to the file, absolute or relative to your working directory.' },
          items: { type: 'array', description: 'Up to 500 texts or {"id", "text"} objects, instead of input_file.', items: { anyOf: [{ type: 'string' }, { type: 'object' }] } },
          labels: LABELS,
          profile: PROFILE,
          examples: EXAMPLES,
          text_field: { type: 'string', description: 'Field (or column) holding the text. Default "text". Dotted paths reach nested fields: "message.body".' },
          id_field: { type: 'string', description: 'Field holding each row\'s id. Default "id"; rows without one are numbered.' },
          filter: { type: 'object', description: 'Only rows whose field matches, e.g. {"field": "sent_at", "gte": "2026-03-01", "lt": "2026-04-01"} or {"field": "channel", "equals": "sms"}. Keys: field plus equals, contains, gte, lt.', properties: { field: { type: 'string' }, equals: {}, contains: { type: 'string' }, gte: {}, lt: {} }, required: ['field'] },
          offset: { type: 'integer', description: 'Skip this many rows (after filter).' },
          limit: { type: 'integer', description: 'Take at most this many rows (after filter and offset), e.g. 300 for "the first 300".' },
          output_path: { type: 'string', description: 'Where to write per-item results as JSONL (id, label, confidence, status). Pass it whenever the user wants per-item results; the chat cannot hold thousands of rows.' },
          include_text: { type: 'boolean', description: 'Also write each item\'s text into output_path. Default false.' },
          max_labels: MAX_LABELS,
          prefer: PREFER,
          resume_job_id: { type: 'string', description: 'Continue this failed, crashed or cancelled job instead of starting a new one. Pass it alone (plus max_usd to raise a spending limit).' },
          max_usd: { type: 'number', description: 'Spending limit for this job in dollars (default 10). The start response shows the estimate; ask the user before raising it.' },
        },
      },
      handler: async (args, ctx) => startJob(args, { caller: caller(ctx) }),
    },
    {
      name: 'classify_wait',
      title: 'Wait for a classification job',
      description: 'Wait for a job. Returns as soon as it finishes, or after wait_seconds (default 45, max 50). One call is usually enough; call again only while it says running. Never restart a job to check on it.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: { job_id: JOB_ID, wait_seconds: { type: 'number', minimum: 0, maximum: 50, description: 'Seconds to wait at most (0-50, default 45).' } }, required: ['job_id'] },
      handler: async (args, ctx) => waitJob(args, { caller: caller(ctx), signal: ctx.signal, onProgress: (st) => ctx.progress(`${st.done} of ${st.total}`) }),
    },
    {
      name: 'classify_results',
      title: 'Read classification results',
      description: 'Results of a finished job: counts per label including "none", the confidence spread, a few samples. To list items, pass label (or confidence, or status) and page with cursor (up to 50 per page). For all items (a full list, "raw results", every id), pass output_path instead of paging.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          job_id: JOB_ID,
          label: { type: 'string', description: 'List items with this label (use "none" for items that fit no label).' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'List items with this confidence.' },
          status: { type: 'string', enum: ['ok', 'unclassifiable', 'rejected', 'error'], description: 'List items with this status.' },
          cursor: { type: 'string', description: 'From the previous page\'s "More:" line.' },
          page_size: { type: 'integer', minimum: 1, maximum: 50, description: 'Items per page (default 20, max 50).' },
          text_chars: { type: 'integer', minimum: 20, maximum: 300, description: 'Characters of each text to show (default 160).' },
          output_path: { type: 'string', description: 'Write items to this JSONL file (id, label, confidence, status) instead of listing them; label / confidence / status filters apply.' },
          include_text: { type: 'boolean', description: 'With output_path: also write each item\'s text.' },
        },
        required: ['job_id'],
      },
      handler: async (args, ctx) => jobResults(args, { caller: caller(ctx) }),
    },
    {
      name: 'classify_sample',
      title: 'Look at a spread of texts',
      description: 'Up to 50 distinct texts spread across a file or job, to design labels before classifying (when the user gave none). Does not classify anything.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          input_file: { type: 'string', description: 'Path to the file, absolute or relative to your working directory.' },
          job_id: JOB_ID,
          n: { type: 'integer', minimum: 1, maximum: 50, description: 'How many texts (default 20).' },
          text_field: { type: 'string', description: 'Field holding the text (default "text").' },
          filter: { type: 'object', description: 'As in classify_start.', properties: { field: { type: 'string' } }, required: ['field'] },
        },
      },
      handler: async (args, ctx) => sampleTexts(args, { caller: caller(ctx) }),
    },
    {
      name: 'classify_cancel',
      title: 'Cancel a classification job',
      description: 'Stop a running job. Finished items are kept; continue later with classify_start {"resume_job_id"}.',
      annotations: { readOnlyHint: false },
      inputSchema: { type: 'object', properties: { job_id: JOB_ID }, required: ['job_id'] },
      handler: async (args, ctx) => cancelJob(args, { caller: caller(ctx) }),
    },
    {
      name: 'classify_profiles',
      title: 'List or show saved label sets',
      description: 'Without a name: list saved profiles (reusable label sets). With a name: its labels, descriptions, example counts, notes and track record.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Profile to show.' } } },
      handler: async (args) => profilesText(args),
    },
    {
      name: 'classify_profile_save',
      title: 'Save a reusable label set',
      description:
        'Save a reusable label set that is shared and kept forever. Examples must be short generic sentences you write yourself from the label descriptions (you do not need to read classified items first): never text from the data, even edited, and no names, places, contact details, ids, dates or amounts. The service rejects examples that resemble classified items and lists every one to rewrite. Keep generate_examples at its default unless the user asks otherwise; generated examples are added to yours. Before saving a new name, check classify_profiles and reuse or append to one that covers this label set. Notes record what worked, not what the data said.',
      annotations: { readOnlyHint: false },
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Lowercase letters, digits and hyphens, e.g. "coach-inbox".' },
          labels: LABELS,
          examples: { type: 'array', description: 'Up to 8 per label, each under 200 characters, written by you: [{"text", "label"}]. Label "none" marks a kind of text that fits no label.', items: { type: 'object', properties: { text: { type: 'string' }, label: { type: 'string' } }, required: ['text', 'label'] } },
          notes: { type: 'string', description: 'What worked or what to watch for with this label set (under 1,500 characters): patterns about the labels, not what the data said. Run numbers and label percentages are fine.' },
          generate_examples: { type: 'integer', minimum: 0, maximum: 40, description: 'Generic examples to generate per label (default 20 for a new profile, 0 when appending).' },
          purpose: { type: 'string', description: 'One line on what this label set is for, e.g. "weekly coach-inbox triage". Helps later runs find and reuse it.' },
          add_labels: { type: 'array', description: 'With append: new labels to add ({"name", "description"}), e.g. when a new topic appeared.', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name'] } },
          from_job_id: { type: 'string', description: 'The job this label set was just run on: its results become the profile\'s first history entry, so the next run can be compared with it.' },
          distinct: { type: 'boolean', description: 'Save even though another profile shares most of these labels (only for a genuinely different use).' },
          append: { type: 'boolean', description: 'Add examples, notes or labels (add_labels) to an existing profile.' },
          replace: { type: 'boolean', description: 'Overwrite an existing profile. Needs replace_version. Only with the user\'s yes for a profile you did not create in this conversation.' },
          replace_version: { type: 'integer', description: 'With replace: the profile\'s current version (from classify_profiles), so a stale or blind overwrite fails.' },
        },
        required: ['name'],
      },
      handler: async (args, ctx) => saveProfileText(args, { signal: ctx.signal, caller: caller(ctx) }),
    },
    {
      name: 'classify_guide',
      title: 'How to use the classifier',
      description: 'A short guide to the classify_* tools: which to call, input formats, labels, options and profiles.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: {} },
      handler: async () => GUIDE,
    },
  ]
}

// Unexpected errors carry file paths (ENOENT messages name them); agents
// follow any path they are shown. Callers get the error code only.
function guarded(tool) {
  return {
    ...tool,
    handler: async (args, ctx) => {
      try {
        return await tool.handler(args || {}, ctx)
      } catch (err) {
        if (err.expected) throw err
        log(`${tool.name}: ${err.stack || err.message}`)
        const e = new Error(`The classifier hit an internal error (${err.code || err.name}). Try once more; if it repeats, tell the user. Do not classify the texts another way.`)
        e.expected = true
        throw e
      }
    },
  }
}

init()
await serveMcp({ name: 'classifier', version: '1.0.0', instructions: INSTRUCTIONS, tools: tools().map(guarded), log })
process.exit(0)
