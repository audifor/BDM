import {
  EMPTY_WORLD_DB_COMPETITION_RUNTIME,
  attachWorldDbCompetitionRuntime,
  createWorldDbCompetitionRuntime,
  updateGameWorld,
  type GameWorld,
  type WorldDbCompetitionRuntime,
} from '@/domain/world'
import { createOrganization, createOrganizationSection, type Organization, type OrganizationSection } from '@/domain/organization'
import {
  deserializeGameWorldSave as deserializeLegacyGameWorldSave,
  deserializeGameWorldV3,
  serializeGameWorldV3,
  type GameWorldSaveV3,
  type SaveGameEnvelopeV3,
} from './GameWorldSaveV3'

export interface WorldDbCompetitionRuntimeSaveV4 {
  readonly competitionRuntimeBundle: {
    readonly contentId: string
    readonly contentHash: string
    readonly worldDbSchema: string
  } | null
  readonly competitionPlanIds: readonly string[]
  readonly competitionSeasonIds: readonly string[]
}

/** Save V4 persists canonical Organization records and the minimal World DB competition runtime. */
export interface GameWorldSaveV4 extends GameWorldSaveV3 {
  readonly worldDbCompetitionRuntime: WorldDbCompetitionRuntimeSaveV4
  readonly organizations: readonly Organization[]
  readonly organizationSections: readonly OrganizationSection[]
}

export interface SaveGameEnvelopeV4 {
  readonly schemaVersion: 4
  readonly savedAt: string
  readonly payload: GameWorldSaveV4
}

/**
 * V3 owns no World DB competition runtime. Migration validates the canonical V3 payload, preserves
 * every V3 field as-is, then adds normalized Organization records and the explicit empty V4 runtime.
 */
export function migrateGameWorldSaveV3ToV4(value: SaveGameEnvelopeV3): SaveGameEnvelopeV4 {
  const world = deserializeGameWorldV3(value)
  return Object.freeze({
    schemaVersion: 4,
    savedAt: value.savedAt,
    payload: Object.freeze({
      ...value.payload,
      worldDbCompetitionRuntime: serializeWorldDbCompetitionRuntimeV4(EMPTY_WORLD_DB_COMPETITION_RUNTIME),
      organizations: Object.values(world.organizationsById),
      organizationSections: Object.values(world.organizationSectionsById),
    }),
  })
}

export function serializeGameWorldV4(world: GameWorld, savedAt: string): SaveGameEnvelopeV4 {
  const compatibility = serializeGameWorldV3(world, savedAt)
  return Object.freeze({
    schemaVersion: 4,
    savedAt: compatibility.savedAt,
    payload: Object.freeze({
      ...compatibility.payload,
      worldDbCompetitionRuntime: serializeWorldDbCompetitionRuntimeV4(
        world.worldDbCompetitionRuntime ?? EMPTY_WORLD_DB_COMPETITION_RUNTIME,
      ),
      organizations: Object.values(world.organizationsById),
      organizationSections: Object.values(world.organizationSectionsById),
    }),
  })
}

export function deserializeGameWorldV4(value: unknown): GameWorld {
  const envelope = record(value, 'Save V4 file')
  exactKeys(envelope, ['schemaVersion', 'savedAt', 'payload'], 'Save V4 envelope')
  if (envelope.schemaVersion !== 4) throw new Error('Unsupported save version')
  const savedAt = isoTimestamp(envelope.savedAt, 'Save V4 savedAt')
  const payload = record(envelope.payload, 'Save V4 payload')
  const runtime = parseWorldDbCompetitionRuntimeV4(payload.worldDbCompetitionRuntime)
  const hasOrganizations = Object.prototype.hasOwnProperty.call(payload, 'organizations')
  const hasOrganizationSections = Object.prototype.hasOwnProperty.call(payload, 'organizationSections')
  if (hasOrganizations !== hasOrganizationSections) throw new TypeError('Save V4 Organization and OrganizationSection records must be stored together')
  const organizations = hasOrganizations ? parseOrganizations(payload.organizations) : undefined
  const organizationSections = hasOrganizationSections ? parseOrganizationSections(payload.organizationSections) : undefined
  const { worldDbCompetitionRuntime: _runtime, organizations: _organizations, organizationSections: _sections, ...compatibilityPayload } = payload
  const world = deserializeGameWorldV3({
    schemaVersion: 3,
    savedAt,
    payload: compatibilityPayload as unknown as GameWorldSaveV3,
  })
  const withOrganizations = organizations === undefined || organizationSections === undefined
    ? world
    : updateGameWorld(world, { organizations, organizationSections })
  return attachWorldDbCompetitionRuntime(withOrganizations, runtime)
}

function parseOrganizations(value: unknown): readonly Organization[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizations must be an array')
  return Object.freeze(value.map((entry) => {
    const organization = record(entry, 'Save V4 Organization')
    exactKeys(organization, ['id', 'entityId', 'legalName', 'foundedYear', 'dissolvedYear', 'primaryPlaceId', 'website'], 'Save V4 Organization')
    return createOrganization({
      id: nonEmptyText(organization.id, 'Save V4 Organization id') as Organization['id'],
      entityId: nullableText(organization.entityId, 'Save V4 Organization entityId'),
      legalName: nullableText(organization.legalName, 'Save V4 Organization legalName'),
      foundedYear: nullableInteger(organization.foundedYear, 'Save V4 Organization foundedYear'),
      dissolvedYear: nullableInteger(organization.dissolvedYear, 'Save V4 Organization dissolvedYear'),
      primaryPlaceId: nullableText(organization.primaryPlaceId, 'Save V4 Organization primaryPlaceId'),
      website: nullableText(organization.website, 'Save V4 Organization website'),
    })
  }))
}

function parseOrganizationSections(value: unknown): readonly OrganizationSection[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationSections must be an array')
  return Object.freeze(value.map((entry) => {
    const section = record(entry, 'Save V4 OrganizationSection')
    exactKeys(section, ['id', 'organizationId', 'sport', 'gender', 'categoryScope', 'canonicalName', 'validFrom', 'validTo'], 'Save V4 OrganizationSection')
    return createOrganizationSection({
      id: nonEmptyText(section.id, 'Save V4 OrganizationSection id') as OrganizationSection['id'],
      organizationId: nonEmptyText(section.organizationId, 'Save V4 OrganizationSection organizationId') as OrganizationSection['organizationId'],
      sport: nullableText(section.sport, 'Save V4 OrganizationSection sport'),
      gender: nullableText(section.gender, 'Save V4 OrganizationSection gender'),
      categoryScope: nullableText(section.categoryScope, 'Save V4 OrganizationSection categoryScope'),
      canonicalName: nonEmptyText(section.canonicalName, 'Save V4 OrganizationSection canonicalName'),
      validFrom: nullableText(section.validFrom, 'Save V4 OrganizationSection validFrom'),
      validTo: nullableText(section.validTo, 'Save V4 OrganizationSection validTo'),
    })
  }))
}

/** Reads V1-V4. Legacy saves normalize the V4-owned runtime projection to empty state. */
export function deserializeGameWorldSaveV4(value: unknown): GameWorld {
  const envelope = record(value, 'Save file')
  if (envelope.schemaVersion === 4) return deserializeGameWorldV4(value)
  return attachWorldDbCompetitionRuntime(
    deserializeLegacyGameWorldSave(value),
    EMPTY_WORLD_DB_COMPETITION_RUNTIME,
  )
}

function serializeWorldDbCompetitionRuntimeV4(
  value: WorldDbCompetitionRuntime,
): WorldDbCompetitionRuntimeSaveV4 {
  const runtime = createWorldDbCompetitionRuntime(value)
  const pin = runtime.competitionRuntimeBundle ?? null
  return Object.freeze({
    competitionRuntimeBundle: pin === null ? null : Object.freeze({ ...pin }),
    competitionPlanIds: runtime.competitionPlanIds,
    competitionSeasonIds: runtime.competitionSeasonIds,
  })
}

function parseWorldDbCompetitionRuntimeV4(value: unknown): WorldDbCompetitionRuntime {
  const runtime = record(value, 'World DB competition runtime V4')
  const hasRuntimeBundlePin = Object.prototype.hasOwnProperty.call(
    runtime,
    'competitionRuntimeBundle',
  )
  exactKeys(
    runtime,
    hasRuntimeBundlePin
      ? ['competitionRuntimeBundle', 'competitionPlanIds', 'competitionSeasonIds']
      : ['competitionPlanIds', 'competitionSeasonIds'],
    'World DB competition runtime V4',
  )
  return createWorldDbCompetitionRuntime({
    competitionRuntimeBundle: hasRuntimeBundlePin
      ? parseRuntimeBundlePin(runtime.competitionRuntimeBundle)
      : null,
    competitionPlanIds: idArray(runtime.competitionPlanIds, 'World DB competition plan IDs V4'),
    competitionSeasonIds: idArray(
      runtime.competitionSeasonIds,
      'World DB competition season IDs V4',
    ),
  })
}

function parseRuntimeBundlePin(
  value: unknown,
): WorldDbCompetitionRuntime['competitionRuntimeBundle'] {
  if (value === null) return null
  const pin = record(value, 'World DB competition runtime bundle pin V4')
  exactKeys(
    pin,
    ['contentId', 'contentHash', 'worldDbSchema'],
    'World DB competition runtime bundle pin V4',
  )
  return {
    contentId: nonEmptyText(pin.contentId, 'World DB competition runtime bundle contentId V4'),
    contentHash: nonEmptyText(pin.contentHash, 'World DB competition runtime bundle contentHash V4'),
    worldDbSchema: nonEmptyText(
      pin.worldDbSchema,
      'World DB competition runtime bundle worldDbSchema V4',
    ),
  }
}

function idArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  const ids = value.map((entry) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new TypeError(`${label} must contain non-empty strings`)
    }
    return entry
  })
  if (new Set(ids).size !== ids.length) throw new TypeError(`${label} must not contain duplicates`)
  return Object.freeze(ids)
}

function nonEmptyText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be non-empty`)
  return value
}

function nullableText(value: unknown, label: string): string | null {
  if (value !== null && typeof value !== 'string') throw new TypeError(`${label} must be a string or null`)
  return value as string | null
}

function nullableInteger(value: unknown, label: string): number | null {
  if (value !== null && (typeof value !== 'number' || !Number.isInteger(value))) throw new TypeError(`${label} must be an integer or null`)
  return value as number | null
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
