import { closeSync, openSync, readSync, writeSync } from 'node:fs'
import { StringDecoder } from 'node:string_decoder'
import type { SaveGameEnvelopeV4 } from '@/save/GameWorldSaveV4'

/** Same JSON envelope, streamed by collection so total file size need not fit a V8 string. */
export function writeLargeSaveV4File(path: string, envelope: SaveGameEnvelopeV4): void {
  const file = openSync(path, 'w')
  let pending = ''
  const append = (text: string) => { pending += text; if (pending.length >= 65_536) { writeSync(file, pending); pending = '' } }
  try {
    append(`{"schemaVersion":4,"savedAt":${JSON.stringify(envelope.savedAt)},"payload":{`)
    let first = true
    for (const [key, value] of Object.entries(envelope.payload)) {
      if (value === undefined) continue
      append(`${first ? '' : ','}${JSON.stringify(key)}:`)
      first = false
      if (Array.isArray(value)) {
        append('[')
        for (let i = 0; i < value.length; i++) append(`${i === 0 ? '' : ','}${JSON.stringify(value[i]) ?? 'null'}`)
        append(']')
      } else append(JSON.stringify(value))
    }
    append('}}')
    if (pending) writeSync(file, pending)
  } finally { closeSync(file) }
}

/** Parse each collection entry with native JSON.parse; never concatenate the complete file. */
export function readLargeSaveV4File(path: string): unknown {
  const file = openSync(path, 'r')
  const decoder = new StringDecoder('utf8')
  const bytes = Buffer.allocUnsafe(2 * 1024 * 1024)
  let buffer = '', cursor = 0, ended = false
  const peek = (): string => {
    while (cursor >= buffer.length && !ended) {
      const count = readSync(file, bytes)
      buffer = count === 0 ? decoder.end() : decoder.write(bytes.subarray(0, count))
      cursor = 0
      if (count === 0) ended = true
    }
    return buffer[cursor] ?? ''
  }
  const whitespace = () => { while (peek() && /\s/.test(peek())) cursor++ }
  const take = (expected: string) => { whitespace(); if (peek() !== expected) throw new SyntaxError(`Expected ${expected} in Save V4 JSON`); cursor++ }
  const raw = (): unknown => {
    whitespace()
    const first = peek()
    if (!first) throw new SyntaxError('Unexpected end of Save V4 JSON')
    const container = first === '{' || first === '['
    const string = first === '"'
    let depth = 0, quoted = false, escaped = false, done = false
    const pieces: string[] = []
    while (!done) {
      if (!peek()) throw new SyntaxError('Unterminated Save V4 JSON value')
      const start = cursor
      while (cursor < buffer.length) {
        const char = buffer[cursor]!
        if (!container && !string && /[\s,}\]]/.test(char)) { done = true; break }
        cursor++
        if (quoted) {
          if (escaped) escaped = false
          else if (char === '\\') escaped = true
          else if (char === '"') { quoted = false; if (string) { done = true; break } }
        } else if (char === '"') quoted = true
        else if (char === '{' || char === '[') depth++
        else if (char === '}' || char === ']') { depth--; if (container && depth === 0) { done = true; break } }
      }
      pieces.push(buffer.slice(start, cursor))
      if (!container && !string && cursor >= buffer.length && !peek()) done = true
    }
    return JSON.parse(pieces.join(''))
  }
  const value = (): unknown => {
    whitespace()
    if (peek() === '[') {
      cursor++
      const array: unknown[] = []
      whitespace()
      if (peek() !== ']') while (true) { array.push(raw()); whitespace(); if (peek() !== ',') break; cursor++ }
      take(']')
      return array
    }
    if (peek() === '{') {
      cursor++
      const object: Record<string, unknown> = {}
      whitespace()
      if (peek() !== '}') while (true) {
        const key = raw()
        if (typeof key !== 'string') throw new SyntaxError('Non-string Save V4 object key')
        take(':')
        Object.defineProperty(object, key, { value: value(), enumerable: true, configurable: true, writable: true })
        whitespace()
        if (peek() !== ',') break
        cursor++
      }
      take('}')
      return object
    }
    return raw()
  }
  try { const parsed = value(); whitespace(); if (peek()) throw new SyntaxError('Trailing Save V4 JSON content'); return parsed } finally { closeSync(file) }
}
