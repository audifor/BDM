import type { GameWorld } from '@/domain/world'

export interface WorldDbCompetitionSeasonSourceV1 {
  readonly databaseId: string
  readonly competitionSeasonId: string
}

export interface WorldDbCompetitionRuntimeBundlePinV1 {
  readonly contentId: string
  readonly contentHash: string
  readonly worldDbSchema: string
}

export interface WorldDbCompetitionGameFixtureBindingV1 {
  readonly gameId: string
  readonly competitionFixtureId: string
}

export interface WorldDbResolvedStructurePositionV1 {
  readonly competitionStructurePositionId: string
  readonly competitionSeasonEntryId: string
}

export interface WorldDbCompetitionFixtureOutcomeV1 {
  readonly competitionFixtureId: string
  readonly winnerEntryId: string
  readonly loserEntryId: string
}

export interface WorldDbCompetitionRuntimeStateV1 {
  readonly schemaVersion: 1
  readonly competitionRuntimeBundle: WorldDbCompetitionRuntimeBundlePinV1 | null
  readonly competitionSeasonSources: readonly WorldDbCompetitionSeasonSourceV1[]
  readonly gameFixtureBindings: readonly WorldDbCompetitionGameFixtureBindingV1[]
  readonly resolvedStructurePositions: readonly WorldDbResolvedStructurePositionV1[]
  readonly fixtureOutcomes: readonly WorldDbCompetitionFixtureOutcomeV1[]
}

export type GameWorldWithWorldDbCompetitionRuntime = GameWorld & {
  readonly worldDbCompetitionRuntime: WorldDbCompetitionRuntimeStateV1
}

export const EMPTY_WORLD_DB_COMPETITION_RUNTIME_V1: WorldDbCompetitionRuntimeStateV1 = Object.freeze({
  schemaVersion: 1,
  competitionRuntimeBundle: null,
  competitionSeasonSources: Object.freeze([]),
  gameFixtureBindings: Object.freeze([]),
  resolvedStructurePositions: Object.freeze([]),
  fixtureOutcomes: Object.freeze([]),
})

export function assertWorldDbCompetitionRuntimeStateV1(value: unknown): asserts value is WorldDbCompetitionRuntimeStateV1 {
  const runtime = record(value, 'World DB competition runtime')
  exactKeys(runtime, ['schemaVersion', 'competitionRuntimeBundle', 'competitionSeasonSources', 'gameFixtureBindings', 'resolvedStructurePositions', 'fixtureOutcomes'], 'World DB competition runtime')
  if (runtime.schemaVersion !== 1) throw new TypeError('Unsupported World DB competition runtime version')
  if (runtime.competitionRuntimeBundle !== null) {
    const pin = record(runtime.competitionRuntimeBundle, 'World DB competition runtime bundle pin')
    exactKeys(pin, ['contentId', 'contentHash', 'worldDbSchema'], 'World DB competition runtime bundle pin')
    text(pin.contentId, 'World DB competition runtime bundle contentId')
    const hash = text(pin.contentHash, 'World DB competition runtime bundle contentHash')
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new TypeError('World DB competition runtime bundle contentHash must be a 64-character lowercase hex digest')
    text(pin.worldDbSchema, 'World DB competition runtime bundle worldDbSchema')
  }
  const sources = array(runtime.competitionSeasonSources, 'World DB competition season sources')
  const bindings = array(runtime.gameFixtureBindings, 'World DB game fixture bindings')
  const positions = array(runtime.resolvedStructurePositions, 'World DB resolved structure positions')
  const outcomes = array(runtime.fixtureOutcomes, 'World DB fixture outcomes')

  const sourceSeasonIds = new Set<string>()
  for (const [index, raw] of sources.entries()) {
    const row = record(raw, `World DB competition season source[${index}]`)
    exactKeys(row, ['databaseId', 'competitionSeasonId'], `World DB competition season source[${index}]`)
    text(row.databaseId, `World DB competition season source[${index}].databaseId`)
    const seasonId = text(row.competitionSeasonId, `World DB competition season source[${index}].competitionSeasonId`)
    unique(sourceSeasonIds, seasonId, `Duplicate World DB competition season source: ${seasonId}`)
  }

  const bindingPairs = new Set<string>()
  for (const [index, raw] of bindings.entries()) {
    const row = record(raw, `World DB game fixture binding[${index}]`)
    exactKeys(row, ['gameId', 'competitionFixtureId'], `World DB game fixture binding[${index}]`)
    const gameId = text(row.gameId, `World DB game fixture binding[${index}].gameId`)
    const fixtureId = text(row.competitionFixtureId, `World DB game fixture binding[${index}].competitionFixtureId`)
    unique(bindingPairs, `${gameId}\u0000${fixtureId}`, `Duplicate World DB game fixture binding: ${gameId} -> ${fixtureId}`)
  }

  const positionIds = new Set<string>()
  for (const [index, raw] of positions.entries()) {
    const row = record(raw, `World DB resolved structure position[${index}]`)
    exactKeys(row, ['competitionStructurePositionId', 'competitionSeasonEntryId'], `World DB resolved structure position[${index}]`)
    const positionId = text(row.competitionStructurePositionId, `World DB resolved structure position[${index}].competitionStructurePositionPositionId`)
    text(row.competitionSeasonEntryId, `World DB resolved structure position[${index}].competitionSeasonEntryId`)
    unique(positionIds, positionId, `Duplicate World DB resolved structure position: ${positionId}`)
  }

  const fixtureIds = new Set<string>()
  for (const [index, raw] of outcomes.entries()) {
    const row = record(raw, `World DB fixture outcome[${index}]`)
    exactKeys(row, ['competitionFixtureId', 'winnerEntryId', 'loserEntryId'], `World DB fixture outcome[${index}]`)
    const fixtureId = text(row.competitionFixtureId, `World DB fixture outcome[${index}].competitionFixtureId`)
    const winner = text(row.winnerEntryId, `World DB fixture outcome[${index}].winnerEntryId`)
    const loser = text(row.loserEntryId, `World DB fixture outcome[${index}].loserEntryId`)
    if (winner === loser) throw new Error(`World DB fixture outcome ${fixtureId} requires distinct winner and loser`)
    unique(fixtureIds, fixtureId, `Duplicate World DB fixture outcome: ${fixtureId}`)
  }
}

export function normalizeWorldDbCompetitionRuntimeStateV1(value: unknown): WorldDbCompetitionRuntimeStateV1 {
  assertWorldDbCompetitionRuntimeStateV1(value)
  return Object.freeze({
    schemaVersion: 1,
    competitionRuntimeBundle: value.competitionRuntimeBundle === null ? null : Object.freeze({ ...value.competitionRuntimeBundle }),
    competitionSeasonSources: Object.freeze(value.competitionSeasonSources.map((row) => Object.freeze({ ...row }))),
    gameFixtureBindings: Object.freeze(value.gameFixtureBindings.map((row) => Object.freeze({ ...row }))),
    resolvedStructurePositions: Object.freeze(value.resolvedStructurePositions.map((row) => Object.freeze({ ...row }))),
    fixtureOutcomes: Object.freeze(value.fixtureOutcomes.map((row) => Object.freeze({ ...row }))),
  })
}

export function getWorldDbCompetitionRuntimeStateV1(world: GameWorld): WorldDbCompetitionRuntimeStateV1 {
  const value = (world as GameWorld & { readonly worldDbCompetitionRuntime?: unknown }).worldDbCompetitionRuntime
  return value === undefined ? EMPTY_WORLD_DB_COMPETITION_RUNTIME_V1 : normalizeWorldDbCompetitionRuntimeStateV1(value)
}

export function withWorldDbCompetitionRuntimeStateV1(
  world: GameWorld,
  value: WorldDbCompetitionRuntimeStateV1,
): GameWorldWithWorldDbCompetitionRuntime {
  const runtime = normalizeWorldDbCompetitionRuntimeStateV1(value)
  return Object.freeze({ ...world, worldDbCompetitionRuntime: runtime }) as GameWorldWithWorldDbCompetitionRuntime
}

export function resolvedEntryIdByStructurePositionIdV1(
  runtime: WorldDbCompetitionRuntimeStateV1,
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const row of runtime.resolvedStructurePositions) result[row.competitionStructurePositionId] = row.competitionSeasonEntryId
  return Object.freeze(result)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`)
  return value as Record<string, unknown>
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  return value
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} must be a non-empty string`)
  return value
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has unexpected fields`)
  }
}

function unique(values: Set<string>, key: string, message: string): void {
  if (values.has(key)) throw new Error(message)
  values.add(key)
}
