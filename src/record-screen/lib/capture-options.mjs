import { EngineError } from './client.mjs'

export function hasCaptureOptions(target) {
  return target != null && typeof target === 'object' &&
    (Object.hasOwn(target, 'include_child_windows') || Object.hasOwn(target, 'exclude_apps'))
}

export function requireCaptureOptions(status) {
  if (status?.capabilities?.target_capture_options !== 1) {
    throw new EngineError('unsupported_capture_options', 'The installed recorder does not advertise target capture options v1. These options have not been applied. Qualify and install the candidate engine before using them.')
  }
}
