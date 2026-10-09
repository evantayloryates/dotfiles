// Supported explicit callback path. Never intercepts native CUA or replays UI.
import { EngineError } from './client.mjs'
import { validateVerification, validateCleanup } from '../../codex-bridge/lib/workflow-outcomes.mjs'

export class RecordedWorkflowError extends Error {
  constructor(cause, report) {
    // Do not stringify a provider's thrown value into public/stored summaries.
    super('Recorded workflow operation failed; inspect cause and workflowReport.', { cause })
    this.name = 'RecordedWorkflowError'
    this.workflowReport = report
  }
}

function failureWithReport(error, report) {
  if (error !== null && ['object', 'function'].includes(typeof error)) {
    try {
      // Preserve ordinary error identity, but never overwrite a provider-owned
      // report or invoke its accessor. Frozen values and hostile descriptors
      // retain their original identity/value as the wrapper's cause.
      if (!Object.getOwnPropertyDescriptor(error, 'workflowReport')) {
        Object.defineProperty(error, 'workflowReport', { value: report, writable: true, configurable: true })
        return error
      }
    } catch { /* Report attachment is optional; report preservation is not. */ }
  }
  return new RecordedWorkflowError(error, report)
}

export async function withRecordedWorkflow(client, declaration, operation,
  { evidenceStore, verify, cleanup, result = 'dispatched', context = {} } = {}) {
  if (typeof operation !== 'function' || (verify !== undefined && typeof verify !== 'function')
      || (cleanup !== undefined && typeof cleanup !== 'function') || typeof evidenceStore?.putOutcome !== 'function') throw new TypeError('workflow requires operation, evidence store and optional callback hooks')
  const status = await client.call('status')
  if (status.capabilities?.action_scopes !== 1) throw new EngineError('unsupported_action_scopes', 'Operation not started: action_scopes v1 is required')
  if (declaration.target_resolution === 'declared' && status.capabilities?.declared_action_targets !== 1) throw new EngineError('unsupported_declared_action_targets', 'Operation not started: declared_action_targets v1 is required')
  // Uncertain begin means no provider operation or hooks. Never resubmit begin.
  const started = await client.call('action.begin', declaration)
  let value, operationError, operationFailed = false
  try { value = await operation(started) } catch (e) { operationError = e; operationFailed = true }
  let receipt, receiptError
  try {
    // Close before potentially long verification/cleanup to retain prompt bounds.
    receipt = await client.call('action.end', { session_id: declaration.session_id, caller: declaration.caller,
      action_token: started.action_token, result: operationFailed ? 'failed' : result })
  } catch (e) { receiptError = e }
  const hookContext = { value, operationError, receipt, receiptError, actionToken: started.action_token }
  let verification = { state: 'not_checked', method: 'none', summary: 'No verification callback supplied.', evidence_refs: [] }
  let cleanupOutcome = { state: 'unknown', summary: 'No cleanup callback supplied; closure not claimed.', evidence_refs: [] }
  let verificationError, cleanupError
  if (verify) try { verification = validateVerification(await verify(hookContext)) } catch (e) {
    verificationError = e
    verification = { state: 'unknown', method: 'callback', summary: 'Verification callback failed or returned an invalid report; error retained by caller.', evidence_refs: [] }
  }
  if (cleanup) try { cleanupOutcome = validateCleanup(await cleanup({ ...hookContext, verification })) } catch (e) {
    cleanupError = e
    cleanupOutcome = { state: 'unknown', summary: 'Cleanup callback failed or returned an invalid report; error retained by caller.', evidence_refs: [] }
  }
  let sharedReceipt, workflowOutcome, outcomeError
  if (receipt) try {
    sharedReceipt = evidenceStore.putRecordedAction(receipt)
    workflowOutcome = evidenceStore.putOutcome({ session_id: declaration.session_id, receipt_id: sharedReceipt.id,
      observed_at: new Date().toISOString(), verification, cleanup: cleanupOutcome, context })
  } catch (e) { outcomeError = e }
  else outcomeError = new Error('No terminal recorder reply; no workflow outcome or stamps fabricated')
  const report = { value, receipt, receiptError, sharedReceipt, workflowOutcome, outcomeError,
    verification, cleanup: cleanupOutcome, verificationError, cleanupError, actionToken: started.action_token }
  if (operationFailed) {
    throw failureWithReport(operationError, report)
  }
  return report
}
