import { EngineError } from './client.mjs'

export function hasCaptureOptions(target) {
  return target != null && typeof target === 'object' &&
    (Object.hasOwn(target, 'include_child_windows') || Object.hasOwn(target, 'exclude_apps') || Object.hasOwn(target, 'include_apps'))
}

export function requireCaptureOptions(status, target) {
  if (status?.capabilities?.target_capture_options !== 1) {
    throw new EngineError('unsupported_capture_options', 'The installed recorder does not advertise target capture options v1. These options have not been applied. Qualify and install the candidate engine before using them.')
  }
  if (target && Object.hasOwn(target, 'include_apps') && status?.capabilities?.application_filter !== 1) {
    throw new EngineError('unsupported_application_filter', 'The loaded engine does not advertise guarded application_filter v1. App inclusion has not been applied; qualify a capable engine before capture.')
  }
}
