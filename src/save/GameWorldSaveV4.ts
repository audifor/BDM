import type { GameWorld } from '@/domain/world'
import {
  EMPTY_WORLD_DB_COMPETITION_RUNTIME_V1,
  getWorldDbCompetitionRuntimeStateV1,
  normalizeWorldDbCompetitionRuntimeStateV1,
  withWorldDbCompetitionRuntimeStateV1,
  type WorldDbCompetitionRuntimeStateV1,
} from '@/domain/worldDb/CompetitionRuntimeState'
import {
  deserializeGameWorldSave as deserializeLegacyGameWorldSave,
  deserializeGameWorldV3,
  serializeGameWorldV3,
  type GameWorldSaveV3,
  type SaveGameEnvelopeV3,
} from './GameWorldSaveV3'

export interface GameWorldSaveV4 extends GameWorldSaveV3 {
  readonly worldDbCompetitionRuntime: WorldDbCompetitionRuntimeStateV1
}

export interface SaveGameEnvelopeV4 {
  readonly schemaVersion: 4
  readonly savedAt: string
  readonly payload: GameWorldSaveV4
}

/** V4 owns mutable World DB competition execution state. V3 remains unchanged and legacy-readable. */
export function migrateGameWorldSaveV3ToV4(value: SaveGameEnvelopeV3): SaveGameEnvelopeV4 {
  const world = deserializeGameWorldV3(value)
  return serializeGameWorldV4(
    withWorldDbCompetitionRuntimeStateV1(world, EMPTY_WORLD_DB_COMPETITION_RUNTIME_V1),
    value.savedAt,
  )
}

export function serializeGameWorldV4(world: GameWorld, savedAt: string): SaveGameEnvelopeV4 {
  const compatibility = serializeGameWorldV3(world, savedAt)
  return Object.freeze({
    schemaVersion: 4,
    savedAt: compatibility.savedAt,
    payload: Object.freeze({
      ...compatibility.payload,
      worldDbCompetitionRuntime: getWorldDbCompetitionRuntimeStateV1(world),
    }),
  })
}

export function deserializeGameWorldV4(value: unknown): GameWorld {
  const envelope = record(value, 'Save V4 file')
  exactKeys(envelope, ['schemaVersion', 'savedAt', 'payload'], 'Save V4 envelope')
  if (envelope.schemaVersion !== 4) throw new Error('Unsupported save version')
  const savedAt = isoTimestamp(envelope.savedAt, 'Save V4 savedAt')
  const payload = record(envelope.payload, 'Save V4 payload')
  if (!Object.prototype.hasOwnProperty.call(payload, 'worldDbCompetitionRuntime')) {
    throw new TypeError('Save V4 payload requires worldDbCompetitionRuntime')
  }
  const runtime = normalizeWorldDbCompetitionRuntimeStateV1(payload.worldDbCompetitionRuntime)
  const compatibilityPayload = { ...payload }
  delete compatibilityPayload.worldDbCompetitionRuntime
  const world = deserializeGameWorldV3({
    schemaVersion: 3,
    savedAt,
    payload: compatibilityPayload,
  })
  return withWorldDbCompetitionRuntimeStateV1(world, runtime)
}

/** Reads V1-V4. Legacy saves migrate in memory to an empty V4 competition runtime. */
export function deserializeGameWorldSaveV4(value: unknown): GameWorld {
  const envelope = record(value, 'Save file')
  if (envelope.schemaVersion === 4) return deserializeGameWorldV4(value)
  const world = deserializeLegacyGameWorldSave(value)
  return withWorldDbCompetitionRuntimeStateV1(world, EMPTY_WORLD_DB_COMPETITION_RUNTIME_V1)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has unexpected fields`)
  }
}

function isoTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new TypeError(`${label} must be an ISO-8601 timestamp`)
  return value
}
