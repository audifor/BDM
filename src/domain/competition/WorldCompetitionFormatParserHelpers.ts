import type { JsonObject, JsonValue } from './WorldCompetitionFormatTypes'

export function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`)
  return value as Readonly<Record<string, unknown>>
}

export function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  return value
}

export function optionalArray(value: unknown, label: string): readonly unknown[] {
  return value === undefined || value === null ? [] : array(value, label)
}

export function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be a non-empty string`)
  return value
}

export function optionalText(value: unknown, label: string): string | undefined {
  return value === undefined || value === null ? undefined : text(value, label)
}

export function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be a boolean`)
  return value
}

export function optionalPositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined
  if (!Number.isInteger(value) || (value as number) <= 0) throw new RangeError(`${label} must be a positive integer`)
  return value as number
}

export function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) throw new TypeError(`${label} must be one of ${allowed.join(', ')}`)
  return value as T[number]
}

export function jsonObject(value: unknown, label: string): JsonObject {
  if (value === undefined || value === null) return Object.freeze({})
  const parsed = jsonValue(value, label)
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') throw new TypeError(`${label} must be a JSON object`)
  return parsed as JsonObject
}

function jsonValue(value: unknown, label: string): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} contains a non-finite number`)
    return value
  }
  if (Array.isArray(value)) return Object.freeze(value.map((item, index) => jsonValue(item, `${label}[${index}]`)))
  if (typeof value === 'object') {
    const output: Record<string, JsonValue> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) output[key] = jsonValue(nested, `${label}.${key}`)
    return Object.freeze(output)
  }
  throw new TypeError(`${label} contains a non-JSON value`)
}

export function requireUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new RangeError(`Duplicate ${label}`)
}
