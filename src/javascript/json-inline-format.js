#!/usr/bin/env node
import { promises as fs, appendFileSync, writeFileSync } from 'fs'

const MAX_INLINE_CHARS = 100
const INDENT = '  '
const SPECIAL_KEYS = [ 'id', 'uid' ]

const LOG_PATH = '/Users/taylor/Desktop/log.txt'
const ERROR_SIGNAL = process.env.JSON_PARSE_ERROR_SIGNAL || '[JSON_PARSE_ERROR_SIGNAL]'

const log = message => {
  const line = `[${new Date().toISOString()}] ${message}\n`
  try {
    appendFileSync(LOG_PATH, line, 'utf8')
  } catch {
    // Logging should never interrupt main script execution.
  }
}

const resetLog = () => {
  try {
    writeFileSync(LOG_PATH, '', 'utf8')
  } catch {
    // If log reset fails, continue with best-effort logging.
  }
}

const describeValue = value => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `array(len=${value.length})`
  if (isPlainObject(value)) return `object(keys=${Object.keys(value).length})`
  return typeof value
}

const usage = () => {
  log('usage(): missing input path argument')
  console.error('Usage: json-inline-format <path-to-input-file>')
  process.exit(1)
}

const toErrorMessage = err => (err instanceof Error ? err.message : String(err))

const signalErrorMessage = message => `${ERROR_SIGNAL}[${message}]`

const runStep = async (label, fn) => {
  log(`${label}: start`)
  try {
    const result = await fn()
    log(`${label}: success`)
    return result
  } catch (err) {
    const message = toErrorMessage(err)
    log(`${label}: error, message=${message}`)
    throw new Error(`${label}: ${message}`)
  }
}

const writeSignaledErrorToFile = async (path, message) => {
  try {
    const signaledMessage = signalErrorMessage(message)
    await fs.writeFile(path, signaledMessage, 'utf8')
    log(`writeSignaledErrorToFile(): wrote signal to file, path=${path}, len=${signaledMessage.length}`)
  } catch (err) {
    const writeMessage = toErrorMessage(err)
    log(`writeSignaledErrorToFile(): failed, message=${writeMessage}`)
  }
}

const isAlignedScalarObjectArray = value => {
  return (
    Array.isArray(value) &&
    value.length > 1 &&
    value.every(isScalarObject) &&
    allObjectsHaveSameKeys(value)
  )
}

const isPlainObject = value => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const isScalar = value => {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

const getDepth = value => {
  if (isScalar(value)) return 0

  if (Array.isArray(value)) {
    if (value.length === 0) return 1
    return 1 + Math.max(...value.map(getDepth))
  }

  if (isPlainObject(value)) {
    const values = Object.values(value)
    if (values.length === 0) return 1
    return 1 + Math.max(...values.map(getDepth))
  }

  return 0
}

const isScalarObject = value => {
  if (!isPlainObject(value)) return false
  return Object.values(value).every(v => isScalar(v))
}

const isScalarArray = value => {
  return Array.isArray(value) && value.every(v => isScalar(v))
}

const isDepthOneObjectArray = value => {
  return Array.isArray(value) && value.every(v => isPlainObject(v) && getDepth(v) === 1)
}

const allObjectsHaveSameKeys = arr => {
  if (arr.length === 0) return true

  const firstKeys = Object.keys(arr[0]).sort()
  return arr.every(obj => {
    const keys = Object.keys(obj).sort()
    return keys.length === firstKeys.length && keys.every((key, i) => key === firstKeys[i])
  })
}

const extractJsonLikeSubstring = input => {
  log(`extractJsonLikeSubstring(): start, inputLen=${input.length}`)
  const firstArrayIndex = input.indexOf('[')
  const firstObjectIndex = input.indexOf('{')
  log(`extractJsonLikeSubstring(): firstArrayIndex=${firstArrayIndex}, firstObjectIndex=${firstObjectIndex}`)

  let firstIndex = -1
  let foundChar = null

  if (firstArrayIndex === -1 && firstObjectIndex === -1) {
    log('extractJsonLikeSubstring(): no opening [ or { found')
    throw new Error('Could not find "[" or "{" in input.')
  }

  if (firstArrayIndex === -1) {
    firstIndex = firstObjectIndex
    foundChar = '{'
  } else if (firstObjectIndex === -1) {
    firstIndex = firstArrayIndex
    foundChar = '['
  } else if (firstArrayIndex < firstObjectIndex) {
    firstIndex = firstArrayIndex
    foundChar = '['
  } else {
    firstIndex = firstObjectIndex
    foundChar = '{'
  }

  const closingChar = foundChar === '[' ? ']' : '}'
  const lastIndex = input.lastIndexOf(closingChar)
  log(`extractJsonLikeSubstring(): foundChar=${foundChar}, closingChar=${closingChar}, lastIndex=${lastIndex}`)

  if (lastIndex === -1) {
    log('extractJsonLikeSubstring(): no matching closing char found')
    throw new Error(`Could not find closing "${closingChar}" in input.`)
  }

  if (lastIndex < firstIndex) {
    log('extractJsonLikeSubstring(): closing index is before opening index')
    throw new Error('Closing bracket was found before opening bracket.')
  }

  const stripped = input.slice(firstIndex, lastIndex + 1)
  log(`extractJsonLikeSubstring(): success, firstIndex=${firstIndex}, lastIndex=${lastIndex}, strippedLen=${stripped.length}`)
  return {
    foundChar,
    firstIndex,
    lastIndex,
    stripped
  }
}

const evaluateInterpolatedJsonLikeString = stripped => {
  log(`evaluateInterpolatedJsonLikeString(): start, strippedLen=${stripped.length}`)
  try {
    const value = new Function(`return (${stripped})`)()
    log(`evaluateInterpolatedJsonLikeString(): success, result=${describeValue(value)}`)
    return value
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`evaluateInterpolatedJsonLikeString(): error, message=${message}`)
    throw new Error(`Inline evaluation failed: ${message}`)
  }
}

const isInlineScalarArray = value => {
  return isScalarArray(value) && JSON.stringify(value).length <= MAX_INLINE_CHARS
}

const isInlineScalarObject = value => {
  return isScalarObject(value) && JSON.stringify(value).length <= MAX_INLINE_CHARS
}

const isInlineSingleScalarObjectArray = value => {
  return (
    Array.isArray(value) &&
    value.length === 1 &&
    value.every(isScalarObject) &&
    allObjectsHaveSameKeys(value) &&
    JSON.stringify(value).length <= MAX_INLINE_CHARS
  )
}

const classifyObjectValue = value => {
  if (isScalar(value)) return 0
  if (isInlineScalarArray(value)) return 1
  if (isInlineScalarObject(value)) return 2
  if (isInlineSingleScalarObjectArray(value)) return 3
  if (isScalarArray(value)) return 4
  if (isAlignedScalarObjectArray(value)) return 5
  if (isDepthOneObjectArray(value)) return 6
  return 7
}

const compareKeys = (a, b) => a.localeCompare(b)

const getStringifiedLength = value => JSON.stringify(value).length

const sortObjectKeysForFormatting = (obj, { isTopLevel = false } = {}) => {
  return Object.keys(obj).sort((a, b) => {
    const aClass = classifyObjectValue(obj[a])
    const bClass = classifyObjectValue(obj[b])

    if (aClass !== bClass) return aClass - bClass

    if (aClass === 0) {
      const aSpecialRank = SPECIAL_KEYS.indexOf(a)
      const bSpecialRank = SPECIAL_KEYS.indexOf(b)

      if (aSpecialRank !== -1 && bSpecialRank === -1) return -1
      if (bSpecialRank !== -1 && aSpecialRank === -1) return 1
      if (aSpecialRank !== -1 && bSpecialRank !== -1) return aSpecialRank - bSpecialRank
    }

    if (isTopLevel && isPlainObject(obj[a]) && isPlainObject(obj[b])) {
      const aLength = getStringifiedLength(obj[a])
      const bLength = getStringifiedLength(obj[b])

      if (aLength !== bLength) return aLength - bLength
    }

    return compareKeys(a, b)
  })
}

const sortRecursively = (value, depth = 0) => {
  if (isScalar(value)) return value

  if (Array.isArray(value)) {
    return value.map(item => sortRecursively(item, depth + 1))
  }

  if (isPlainObject(value)) {
    const sortedKeys = sortObjectKeysForFormatting(value, { isTopLevel: depth === 0 })
    const result = {}

    for (const key of sortedKeys) {
      result[key] = sortRecursively(value[key], depth + 1)
    }

    return result
  }

  return value
}

const inlineScalarArray = arr => {
  const minified = JSON.stringify(arr)
  const inner = minified.slice(1, -1)
  return `[ ${inner} ]`
}

const inlineScalarObject = obj => {
  const entries = Object.entries(obj).map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
  return `{ ${entries.join(', ')} }`
}

const formatAlignedObjectArray = (arr, indentLevel) => {
  if (arr.length === 0) return '[]'

  const keys = Object.keys(arr[0])
  const colWidths = {}

  for (const key of keys) {
    let maxLen = 0

    for (const obj of arr) {
      const pair = `${JSON.stringify(key)}: ${JSON.stringify(obj[key])}`
      if (pair.length > maxLen) maxLen = pair.length
    }

    colWidths[key] = maxLen
  }

  const currentIndent = INDENT.repeat(indentLevel)
  const innerIndent = INDENT.repeat(indentLevel + 1)

  const lines = arr.map(obj => {
    const pairs = keys.map(key => {
      const pair = `${JSON.stringify(key)}: ${JSON.stringify(obj[key])}`
      return pair.padEnd(colWidths[key], ' ')
    })

    return `${innerIndent}{ ${pairs.join(', ')} }`
  })

  return `[\n${lines.join(',\n')}\n${currentIndent}]`
}

const formatValue = (value, indentLevel = 0) => {
  if (isScalar(value)) {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'

    if (isScalarArray(value) && JSON.stringify(value).length <= MAX_INLINE_CHARS) {
      return inlineScalarArray(value)
    }

    if (isAlignedScalarObjectArray(value)) {
      return formatAlignedObjectArray(value, indentLevel)
    }

    if (isInlineSingleScalarObjectArray(value)) {
      return inlineScalarArray(value)
    }

    const currentIndent = INDENT.repeat(indentLevel)
    const innerIndent = INDENT.repeat(indentLevel + 1)

    const lines = value.map(item => `${innerIndent}${formatValue(item, indentLevel + 1)}`)
    return `[\n${lines.join(',\n')}\n${currentIndent}]`
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value)

    if (keys.length === 0) return '{}'

    if (isScalarObject(value) && JSON.stringify(value).length <= MAX_INLINE_CHARS) {
      return inlineScalarObject(value)
    }

    const currentIndent = INDENT.repeat(indentLevel)
    const innerIndent = INDENT.repeat(indentLevel + 1)

    const lines = keys.map(key => {
      return `${innerIndent}${JSON.stringify(key)}: ${formatValue(value[key], indentLevel + 1)}`
    })

    return `{\n${lines.join(',\n')}\n${currentIndent}}`
  }

  return JSON.stringify(value)
}

const main = async () => {
  // throw new Error('Artificial test error (intentional)')
  resetLog()
  log('main(): started')
  log(`main(): argv=${JSON.stringify(process.argv)}`)
  const input = process.argv[2]
  if (!input) usage()
  log(`main(): input=${input}`)

  try {
    const raw = await runStep('Error reading input file', () => fs.readFile(input, 'utf8'))
    const stripped = await runStep('Error normalizing input', () => {
      const extracted = extractJsonLikeSubstring(raw)
      return extracted.stripped
    })
    const parsed = await runStep('Error evaluating input', () => evaluateInterpolatedJsonLikeString(stripped))
    const sorted = await runStep('Error sorting parsed value', () => sortRecursively(parsed))
    const output = await runStep('Error formatting output', () => `${formatValue(sorted)}\n`)
    await runStep('Error writing output file', () => fs.writeFile(input, output, 'utf8'))

    log('main(): completed successfully')
  } catch (err) {
    const message = toErrorMessage(err)
    log(`main(): failed, message=${message}`)
    await writeSignaledErrorToFile(input, message)
    console.error(message)
    process.exit(1)
  }
}

main().catch(async err => {
  const message = toErrorMessage(err)
  const input = process.argv[2]
  log(`main(): unexpected fatal error, message=${message}`)
  if (input) {
    await writeSignaledErrorToFile(input, message)
  }
  console.error(`Unexpected error: ${message}`)
  process.exit(99)
})