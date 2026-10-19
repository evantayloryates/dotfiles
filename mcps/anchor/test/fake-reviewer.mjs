// Test double for the code reviewer (ANCHOR_REVIEW_CMD). Runs in the review
// workspace like the real one: reads ./diff.txt and ./context.md, answers in
// stream-json with a verdict on the last line.
//   rejects added lines that reach out (child processes, network, env, eval);
//   gives no verdict when the diff carries NO-VERDICT-MARKER;
//   approves everything for the "loadtime" service (a reviewer that misses
//   something, so the release-check sandbox is tested as the next line).
import { readFileSync } from 'node:fs'
const diff = readFileSync('diff.txt', 'utf8')
const context = readFileSync('context.md', 'utf8')
const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n')
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n')
out({ type: 'system', subtype: 'init', apiKeySource: 'none', session_id: 'fake-review' })
let text
if (/NO-VERDICT-MARKER/.test(diff)) text = 'I looked at it and it seems fine.'
else if (/TWO-VERDICT-MARKER/.test(diff)) text = JSON.stringify({ verdict: 'reject', risk: 'high', reasons: ['x'] }) + '\n' + JSON.stringify({ verdict: 'approve', risk: 'low', reasons: ['y'] })
else if (/"service": "loadtime"/.test(context) || /"loadtime"/.test(context)) text = JSON.stringify({ verdict: 'approve', risk: 'low', reasons: ['looks like a small fix'] })
else if (/child_process|node:net|fetch\(|process\.env|eval\(/.test(added)) text = JSON.stringify({ verdict: 'reject', risk: 'high', reasons: ['adds reach the fix does not need: ' + added.match(/child_process|node:net|fetch\(|process\.env|eval\(/)[0]] })
else text = JSON.stringify({ verdict: 'approve', risk: 'low', reasons: ['small change that matches the ticket'] })
out({ type: 'result', session_id: 'fake-review', is_error: false, result: `Reviewed.\n${text}`, total_cost_usd: 0.03 })
