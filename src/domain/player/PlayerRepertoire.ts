import { parseGameDate, type GameDate } from '@/domain/date'

/** Verified WorldDB DDL-12 2.4-D2 source facts. Separate from PLAYER-8 specialties and PERSON traits. */
export const WORLDDB_PLAYER_REPERTOIRE_VERSION = 'PLAYER-2.4-D1-40-TRAITS-60-MOVES-V1' as const

export interface PlayerRepertoire {
  readonly playerId: string
  readonly version: typeof WORLDDB_PLAYER_REPERTOIRE_VERSION
  readonly contextualTraits: readonly { readonly code: string; readonly strength: number; readonly startedOn: GameDate }[]
  readonly technicalMoves: readonly { readonly code: string; readonly proficiency: number; readonly usageTendency: number; readonly asOfOn: GameDate }[]
  readonly basketballSpecializationTraits: readonly { readonly code: string; readonly startedOn: GameDate }[]
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`)
  return value as Record<string, unknown>
}
function keys(value: Record<string, unknown>, required: readonly string[], label: string): void {
  const actual = Object.keys(value)
  if (actual.length !== required.length || actual.some((key) => !required.includes(key))) {
    throw new TypeError(`${label} has unknown or missing fields`)
  }
}
function code(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(value)) throw new TypeError(`${label} must be a canonical uppercase code`)
  return value
}
function date(value: unknown, label: string): GameDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError(`${label} must be ISO YYYY-MM-DD`)
  return parseGameDate(value)
}
function percentage(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new RangeError(`${label} must be an integer 0..100`)
  }
  return value
}
function collection<T>(value: unknown, label: string, maxCount: number, parse: (row: Record<string, unknown>) => T & { readonly code: string }): readonly T[] {
  if (!Array.isArray(value) || value.length > maxCount) throw new TypeError(`${label} must have at most ${maxCount} entries`)
  const result = value.map((raw) => parse(object(raw, label)))
  const codes = result.map((row) => row.code)
  if (new Set(codes).size !== codes.length) throw new RangeError(`${label} contains duplicate codes`)
  return Object.freeze(result.sort((a, b) => a.code.localeCompare(b.code)))
}

/** Accept only the versioned source vocabulary. Never invent zero-valued rows for absent data. */
export function createPlayerRepertoire(input: unknown): PlayerRepertoire {
  const value = object(input, 'Player repertoire')
  keys(value, ['playerId', 'version', 'contextualTraits', 'technicalMoves', 'basketballSpecializationTraits'], 'Player repertoire')
  const playerId = value.playerId
  if (typeof playerId !== 'string' || playerId.trim() === '') throw new TypeError('Player repertoire requires playerId')
  if (value.version !== WORLDDB_PLAYER_REPERTOIRE_VERSION) throw new TypeError('Unsupported WorldDB Player repertoire version')
  const contextualTraits = collection(value.contextualTraits, 'contextual traits', 40, (entry) => {
    keys(entry, ['code', 'strength', 'startedOn'], 'Contextual trait')
    return Object.freeze({ code: code(entry.code, 'Contextual trait'), strength: percentage(entry.strength, 'Contextual strength'), startedOn: date(entry.startedOn, 'Contextual startedOn') })
  })
  const technicalMoves = collection(value.technicalMoves, 'technical moves', 60, (entry) => {
    keys(entry, ['code', 'proficiency', 'usageTendency', 'asOfOn'], 'Technical move')
    return Object.freeze({ code: code(entry.code, 'Technical move'), proficiency: percentage(entry.proficiency, 'Move proficiency'), usageTendency: percentage(entry.usageTendency, 'Move usage'), asOfOn: date(entry.asOfOn, 'Move asOfOn') })
  })
  const basketballSpecializationTraits = collection(value.basketballSpecializationTraits, 'basketball specialization traits', 8, (entry) => {
    keys(entry, ['code', 'startedOn'], 'Basketball specialization trait')
    return Object.freeze({ code: code(entry.code, 'Basketball specialization trait'), startedOn: date(entry.startedOn, 'Basketball startedOn') })
  })
  if (basketballSpecializationTraits.some((trait) => contextualTraits.some((other) => other.code === trait.code))) {
    throw new TypeError('Basketball specialization and contextual traits must have disjoint codes')
  }
  return Object.freeze({ playerId, version: WORLDDB_PLAYER_REPERTOIRE_VERSION, contextualTraits, technicalMoves, basketballSpecializationTraits })
}
