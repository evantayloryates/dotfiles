import { readFileSync } from 'node:fs'
import { DeliveryTurnError, queueMessage } from '/Users/taylor/dotfiles/src/local-fleet-codex/queue.mjs'

const [threadId, key, messageFile] = process.argv.slice(2)
if (!threadId || !key || !messageFile) {
  console.error('usage: codex-delivery.mjs <thread-id> <stable-key> <message-file>')
  process.exitCode = 2
} else {
  const message = readFileSync(messageFile, 'utf8')
  try {
    console.log(JSON.stringify(await queueMessage({ threadId, key, message })))
  } catch (error) {
    if (error instanceof DeliveryTurnError) {
      console.error(JSON.stringify({ phase: 'terminal', turnId: error.turnId, turnStatus: error.turnStatus }))
      process.exitCode = 3
    } else if (!String(error.message).includes('already has an active writer')) {
      console.error(JSON.stringify({ phase: 'uncertain', error: error.message }))
      process.exitCode = 1
    } else {
      // The queue helper submitted and read back the exact item before it
      // tried to start a second turn. Keep it queued until the writer exits.
      try {
        console.log(JSON.stringify(await queueMessage({ threadId, key, message, startIfIdle: false })))
      } catch (retryError) {
        if (retryError instanceof DeliveryTurnError) {
          console.error(JSON.stringify({ phase: 'terminal', turnId: retryError.turnId, turnStatus: retryError.turnStatus }))
          process.exitCode = 3
        } else {
          console.error(JSON.stringify({ phase: 'uncertain', error: retryError.message }))
          process.exitCode = 1
        }
      }
    }
  }
}
