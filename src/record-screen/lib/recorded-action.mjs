// Supported callback wrapper; never intercepts native CUA or retries UI.
// Recorder stamps are service observations; result remains caller-reported.
import { EngineError } from './client.mjs'

export async function withRecordedAction(client, declaration, operation, { evidenceStore, result='delivered' } = {}) {
  if (typeof operation !== 'function') throw new TypeError('operation must be a callback')
  const status=await client.call('status')
  if (status.capabilities?.action_scopes !== 1) throw new EngineError('unsupported_action_scopes','Loaded engine lacks action_scopes v1; operation was not started')
  // Never retry begin: a lost response may already have created a scope.
  const started=await client.call('action.begin',declaration)
  let value, operationError
  try { value=await operation(started) } catch (error) { operationError=error }
  let receipt, receiptError, sharedReceipt
  try {
    receipt=await client.call('action.end',{session_id:declaration.session_id,caller:declaration.caller,
      action_token:started.action_token,result:operationError ? 'failed' : result})
    if (evidenceStore) sharedReceipt=evidenceStore.putRecordedAction(receipt)
  } catch (error) { receiptError=error }
  // A receipt gap is never permission to re-run the operation.
  if (operationError) { operationError.actionReceipt=receipt; operationError.actionReceiptError=receiptError; throw operationError }
  return {value,receipt,receiptError,sharedReceipt,actionToken:started.action_token}
}
