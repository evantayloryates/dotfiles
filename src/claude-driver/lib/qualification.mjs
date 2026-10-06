// Native-only qualification never creates/imports a session or touches input.
// Require an existing disposable fixture with independent registry provenance.
import { resolve, sep } from 'node:path'
import { DriverError } from './paths.mjs'
export function validateBrokerFixture({ session, record, registry, stateDir, broker, policy, currentSession, allowArchived=false }) {
  const prefix = resolve(stateDir, 'probe') + sep
  if (!policy?.blocked) throw new DriverError('broker-only qualification requires the UI incident guard', { category: 'qualification_gate' })
  if (!broker?.live || !broker.templateCurrent)
    throw new DriverError('broker-only qualification requires a current, live broker', { category: 'qualification_gate' })
  if (!record || record.sessionId !== session || record.isArchived && !allowArchived || currentSession === session ||
      registry?.kind !== 'create' || registry.cwd !== record.cwd ||
      !resolve(record.cwd || '').startsWith(prefix) || !/^claude-driver v2 pressure /.test(record.title || ''))
    throw new DriverError('expected an unopened, active, driver-owned v2 scratch fixture', { category: 'qualification_gate' })
  return session
}

export function nativeQualification(row,build,versions){
  const matches=!!row&&row.runtimeBuild===build&&row.versions?.app===versions.app&&row.versions?.cli===versions.cli
  const full=row?.topic==='v2-live-pressure'
  return {scope:full?'full-live':'native-broker-only',qualified:matches&&row.kind==='test_result'&&row.status==='passed',
    matchingRuntime:matches,...(row?{status:row.status,at:row.at,evidence:row.evidence}:{status:'unqualified'}),
    excluded:full?['physical-typing','UI-recovery']:['physical-typing','UI-recovery','focus-restoration','session-import']}
}
