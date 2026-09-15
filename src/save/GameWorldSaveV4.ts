import type { GameWorld } from '@/domain/world'
import {
  deserializeGameWorldSave as deserializeLegacyGameWorldSave,
  deserializeGameWorldV3,
  serializeGameWorldV3,
  type GameWorldSaveV3,
  type SaveGameEnvelopeV3,
} from './GameWorldSaveV3'

/**
 * Save V4A is deliberately structural only. It advances the envelope version while preserving the
 * canonical V3 payload unchanged. World DB competition runtime state is introduced separately.
 */
export type GameWorldSaveV4 = GameWorldSaveV3

export interface SaveGameEnvelopeV4 {
  readonly schemaVersion: 4
  readonly savedAt: string
  readonly payload: GameWorldSaveV4
}

/**
 * V4A changes only the envelope contract. A canonical V3 payload is already valid V4A payload data,
 * so migration must not deserialize and reserialize it. Doing so runs V3 enrichment and can reorder
 * or add neutral derived entries, making an otherwise structural migration non identity-preserving.
 */
export function migrateGameWorldSaveV3ToV4(value: SaveGameEnvelopeV3): SaveGameEnvelopeV4 {
  deserializeGameWorldV3(value)
  return Object.freeze({
    schemaVersion: 4,
    savedAt: value.savedAt,
    payload: value.payload,
  })
}

export function serializeGameWorldV4(world: GameWorld, savedAt: string): SaveGameEnvelopeV4 {
  const compatibility = serializeGameWorldV3(world, savedAt)
  return Object.freeze({
    schemaVersion: 4,
    savedAt: compatibility.savedAt,
    payload: compatibility.payload,
  })
}

export function deserializeGameWorldV4(value: unknown): GameWorld {
  const envelope = record(value, 'Save V4 file')
  exactKeys(envelope, ['schemaVersion', 'savedAt', 'payload'], 'Save V4 envelope')
  if (envelope.schemaVersion !== 4) throw new Error('Unsupported save version')
  const savedAt = isoTimestamp(envelope.savedAt, 'Save V4 savedAt')
  return deserializeGameWorldV3({ schemaVersion: 3, savedAt, payload: envelope.payload } as SaveGameEnvelopeV3)
}

/** Reads V1-V4. V1-V3 keep using the existing legacy migration chain. */
export function deserializeGameWorldSaveV4(value: unknown): GameWorld {
  const envelope = record(value, 'Save file')
  if (envelope.schemaVersion === 4) return deserializeGameWorldV4(value)
  return deserializeLegacyGameWorldSave(value)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has unexpected fields`)
}

function isoTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new TypeError(`${label} must be an ISO-8601 timestamp`)
  return value
}
