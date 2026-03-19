#!/usr/bin/env node
import { promisify } from 'util'
import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'

const execFileAsync = promisify(execFile)
const MAX_INLINE_CHARS = 80
const INDENT = '  '

const usage = () => {
  console.error('Usage: json-inline-format <path-to-input-file>')
  process.exit(1)
}

const toBackupPath = p => {
  const { dir, name, ext } = path.parse(p)
  return path.join(dir || '.', `${name}.bak${ext || '.txt'}`)
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
  const firstArrayIndex = input.indexOf('[')
  const firstObjectIndex = input.indexOf('{')

  let firstIndex = -1
  let foundChar = null

  if (firstArrayIndex === -1 && firstObjectIndex === -1) {
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

  if (lastIndex === -1) {
    throw new Error(`Could not find closing "${closingChar}" in input.`)
  }

  if (lastIndex < firstIndex) {
    throw new Error('Closing bracket was found before opening bracket.')
  }

  return {
    foundChar,
    firstIndex,
    lastIndex,
    stripped: input.slice(firstIndex, lastIndex + 1)
  }
}

const evaluateInterpolatedJsonLikeString = stripped => {
  try {
    return new Function(`return (${stripped})`)()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Inline evaluation failed: ${message}`)
  }
}

const classifyObjectValue = value => {
  if (isScalar(value)) return 0
  if (isScalarArray(value)) return 1
  if (isDepthOneObjectArray(value)) return 2
  return 3
}

const compareKeys = (a, b) => a.localeCompare(b)

const sortObjectKeysForFormatting = obj => {
  return Object.keys(obj).sort((a, b) => {
    const aClass = classifyObjectValue(obj[a])
    const bClass = classifyObjectValue(obj[b])

    if (aClass !== bClass) return aClass - bClass

    if (aClass === 0) {
      if (a === 'id' && b !== 'id') return -1
      if (b === 'id' && a !== 'id') return 1
    }

    return compareKeys(a, b)
  })
}

const sortRecursively = value => {
  if (isScalar(value)) return value

  if (Array.isArray(value)) {
    return value.map(sortRecursively)
  }

  if (isPlainObject(value)) {
    const sortedKeys = sortObjectKeysForFormatting(value)
    const result = {}

    for (const key of sortedKeys) {
      result[key] = sortRecursively(value[key])
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

    if (
      value.every(isScalarObject) &&
      allObjectsHaveSameKeys(value)
    ) {
      return formatAlignedObjectArray(value, indentLevel)
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

const copyToClipboard = async text => {
  try {
    await execFileAsync('pbcopy', [], { input: text })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Clipboard write failed: ${message}`)
  }
}

const main = async () => {
  const input = process.argv[2]
  if (!input) usage()

  const backup = toBackupPath(input)

  try {
    await fs.rm(backup, { force: true }).catch(() => {})
    await fs.copyFile(input, backup)
    console.log(`Backup created: ${backup}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Error creating backup: ${message}`)
    process.exit(2)
  }

  let raw
  try {
    raw = await fs.readFile(backup, 'utf8')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Error reading backup file: ${message}`)
    process.exit(3)
  }

  let stripped
  try {
    const extracted = extractJsonLikeSubstring(raw)
    stripped = extracted.stripped
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Error normalizing input: ${message}`)
    process.exit(4)
  }

  let parsed
  try {
    parsed = evaluateInterpolatedJsonLikeString(stripped)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(message)
    process.exit(5)
  }

  let sorted
  try {
    sorted = sortRecursively(parsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Error sorting parsed value: ${message}`)
    process.exit(6)
  }

  let output
  try {
    output = `${formatValue(sorted)}\n`
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Error formatting output: ${message}`)
    process.exit(7)
  }

  try {
    await copyToClipboard(output)
    console.log('Custom formatted JSON copied to clipboard.')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(message)
    process.exit(8)
  }
}

main().catch(err => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`Unexpected error: ${message}`)
  process.exit(99)
})