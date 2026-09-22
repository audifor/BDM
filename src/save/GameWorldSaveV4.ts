import {
  EMPTY_WORLD_ANNUAL_DEVELOPMENT_CYCLE,
  EMPTY_WORLD_DB_COMPETITION_RUNTIME,
  attachWorldDbCompetitionRuntime,
  createWorldDbCompetitionRuntime,
  updateGameWorld,
  type GameWorld,
  type WorldAnnualDevelopmentCycle,
  type WorldDbCompetitionRuntime,
} from '@/domain/world'
import { createOrganization, createOrganizationSection, type Organization, type OrganizationSection } from '@/domain/organization'
import { createOrganizationControl, createOrganizationOwnership, type OrganizationControl, type OrganizationOwnership, type OrganizationOwnershipActor } from '@/domain/ownership'
import { organizationIdFromString, personIdFromString } from '@/domain/ids'
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

export interface WorldAnnualDevelopmentCycleSaveV4 {
  readonly lastAppliedCycleId: string | null
}

/** Save V4 persists the minimal World DB competition runtime projection. */
export interface GameWorldSaveV4 extends GameWorldSaveV3 {
  readonly worldDbCompetitionRuntime: WorldDbCompetitionRuntimeSaveV4
  readonly worldAnnualDevelopmentCycle: WorldAnnualDevelopmentCycleSaveV4
  readonly organizations: readonly Organization[]
  readonly organizationSections: readonly OrganizationSection[]
  readonly organizationOwnership: readonly OrganizationOwnership[]
  readonly organizationControl: readonly OrganizationControl[]
}

export interface SaveGameEnvelopeV4 {
  readonly schemaVersion: 4
  readonly savedAt: string
  readonly payload: GameWorldSaveV4
}

/**
 * V3 owns no World DB competition runtime. Migration validates the canonical V3 payload, preserves
 * every V3 field as-is, and adds the explicit empty V4 runtime projection exactly once.
 */
export function migrateGameWorldSaveV3ToV4(value: SaveGameEnvelopeV3): SaveGameEnvelopeV4 {
  const world = deserializeGameWorldV3(value)
  return Object.freeze({
    schemaVersion: 4,
    savedAt: value.savedAt,
    payload: Object.freeze({
      ...value.payload,
      worldDbCompetitionRuntime: serializeWorldDbCompetitionRuntimeV4(EMPTY_WORLD_DB_COMPETITION_RUNTIME),
      worldAnnualDevelopmentCycle: serializeWorldAnnualDevelopmentCycleV4(EMPTY_WORLD_ANNUAL_DEVELOPMENT_CYCLE),
      organizations: Object.values(world.organizationsById),
      organizationSections: Object.values(world.organizationSectionsById),
      organizationOwnership: [],
      organizationControl: [],
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
      worldAnnualDevelopmentCycle: serializeWorldAnnualDevelopmentCycleV4(
        world.worldAnnualDevelopmentCycle ?? EMPTY_WORLD_ANNUAL_DEVELOPMENT_CYCLE,
      ),
      organizations: Object.values(world.organizationsById),
      organizationSections: Object.values(world.organizationSectionsById),
      organizationOwnership: Object.values(world.organizationOwnershipById),
      organizationControl: Object.values(world.organizationControlById),
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
  const developmentCycle = parseWorldAnnualDevelopmentCycleV4(payload.worldAnnualDevelopmentCycle)
  const hasOrganizations = Object.prototype.hasOwnProperty.call(payload, 'organizations')
  const hasOrganizationSections = Object.prototype.hasOwnProperty.call(payload, 'organizationSections')
  const ownership = Object.prototype.hasOwnProperty.call(payload, 'organizationOwnership')
    ? parseOrganizationOwnership(payload.organizationOwnership)
    : []
  const control = Object.prototype.hasOwnProperty.call(payload, 'organizationControl')
    ? parseOrganizationControl(payload.organizationControl)
    : []
  if (hasOrganizations !== hasOrganizationSections) throw new TypeError('Save V4 Organization and OrganizationSection records must be stored together')
  const organizations = hasOrganizations ? parseOrganizations(payload.organizations) : undefined
  const organizationSections = hasOrganizationSections ? parseOrganizationSections(payload.organizationSections) : undefined
  const { worldDbCompetitionRuntime: _runtime, worldAnnualDevelopmentCycle: _cycle, organizations: _organizations, organizationSections: _sections, organizationOwnership: _ownership, organizationControl: _control, ...compatibilityPayload } = payload
  const world = deserializeGameWorldV3({
    schemaVersion: 3,
    savedAt,
    payload: compatibilityPayload as unknown as GameWorldSaveV3,
  })
  const withOrganizations = organizations === undefined || organizationSections === undefined
    ? world
    : updateGameWorld(world, { organizations, organizationSections })
  const withOwnership = updateGameWorld(withOrganizations, { organizationOwnership: ownership, organizationControl: control })
  return Object.freeze({ ...attachWorldDbCompetitionRuntime(withOwnership, runtime), worldAnnualDevelopmentCycle: developmentCycle })
}

/** Reads V1-V4. Legacy saves normalize the V4-owned runtime projection to empty state. */
export function deserializeGameWorldSaveV4(value: unknown): GameWorld {
  const envelope = record(value, 'Save file')
  if (envelope.schemaVersion === 4) return deserializeGameWorldV4(value)
  return Object.freeze({
    ...attachWorldDbCompetitionRuntime(deserializeLegacyGameWorldSave(value), EMPTY_WORLD_DB_COMPETITION_RUNTIME),
    worldAnnualDevelopmentCycle: EMPTY_WORLD_ANNUAL_DEVELOPMENT_CYCLE,
  })
}

function parseOrganizations(value: unknown): readonly Organization[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizations must be an array')
  return Object.freeze(value.map((entry) => {
    const organization = record(entry, 'Save V4 Organization')
    exactKeys(organization, ['id', 'entityId', 'legalName', 'foundedYear', 'dissolvedYear', 'primaryPlaceId', 'website'], 'Save V4 Organization')
    return createOrganization({ id: nonEmptyText(organization.id, 'Save V4 Organization id') as Organization['id'], entityId: nullableText(organization.entityId, 'Save V4 Organization entityId'), legalName: nullableText(organization.legalName, 'Save V4 Organization legalName'), foundedYear: nullableInteger(organization.foundedYear, 'Save V4 Organization foundedYear'), dissolvedYear: nullableInteger(organization.dissolvedYear, 'Save V4 Organization dissolvedYear'), primaryPlaceId: nullableText(organization.primaryPlaceId, 'Save V4 Organization primaryPlaceId'), website: nullableText(organization.website, 'Save V4 Organization website') })
  }))
}

function parseOrganizationSections(value: unknown): readonly OrganizationSection[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationSections must be an array')
  return Object.freeze(value.map((entry) => {
    const section = record(entry, 'Save V4 OrganizationSection')
    exactKeys(section, ['id', 'organizationId', 'sport', 'gender', 'categoryScope', 'canonicalName', 'validFrom', 'validTo'], 'Save V4 OrganizationSection')
    return createOrganizationSection({ id: nonEmptyText(section.id, 'Save V4 OrganizationSection id') as OrganizationSection['id'], organizationId: nonEmptyText(section.organizationId, 'Save V4 OrganizationSection organizationId') as OrganizationSection['organizationId'], sport: nullableText(section.sport, 'Save V4 OrganizationSection sport'), gender: nullableText(section.gender, 'Save V4 OrganizationSection gender'), categoryScope: nullableText(section.categoryScope, 'Save V4 OrganizationSection categoryScope'), canonicalName: nonEmptyText(section.canonicalName, 'Save V4 OrganizationSection canonicalName'), validFrom: nullableText(section.validFrom, 'Save V4 OrganizationSection validFrom'), validTo: nullableText(section.validTo, 'Save V4 OrganizationSection validTo') })
  }))
}

function parseOrganizationOwnership(value: unknown): readonly OrganizationOwnership[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationOwnership must be an array')
  return Object.freeze(value.map((entry) => {
    const ownership = record(entry, 'Save V4 OrganizationOwnership')
    exactKeys(ownership, ['id', 'organizationId', 'owner', 'ownershipPercentage', 'validFrom', 'validTo'], 'Save V4 OrganizationOwnership')
    return createOrganizationOwnership({
      id: nonEmptyText(ownership.id, 'Save V4 OrganizationOwnership id'),
      organizationId: nonEmptyText(ownership.organizationId, 'Save V4 OrganizationOwnership organizationId'),
      owner: parseOrganizationOwnershipActor(ownership.owner, 'Save V4 OrganizationOwnership owner'),
      ownershipPercentage: nullableNumber(ownership.ownershipPercentage, 'Save V4 OrganizationOwnership ownershipPercentage'),
      validFrom: nullableText(ownership.validFrom, 'Save V4 OrganizationOwnership validFrom'),
      validTo: nullableText(ownership.validTo, 'Save V4 OrganizationOwnership validTo'),
    })
  }))
}

function parseOrganizationControl(value: unknown): readonly OrganizationControl[] {
  if (!Array.isArray(value)) throw new TypeError('Save V4 organizationControl must be an array')
  return Object.freeze(value.map((entry) => {
    const control = record(entry, 'Save V4 OrganizationControl')
    exactKeys(control, ['id', 'organizationId', 'controller', 'validFrom', 'validTo'], 'Save V4 OrganizationControl')
    return createOrganizationControl({
      id: nonEmptyText(control.id, 'Save V4 OrganizationControl id'),
      organizationId: nonEmptyText(control.organizationId, 'Save V4 OrganizationControl organizationId'),
      controller: parseOrganizationOwnershipActor(control.controller, 'Save V4 OrganizationControl controller'),
      validFrom: nullableText(control.validFrom, 'Save V4 OrganizationControl validFrom'),
      validTo: nullableText(control.validTo, 'Save V4 OrganizationControl validTo'),
    })
  }))
}

function parseOrganizationOwnershipActor(value: unknown, label: string): OrganizationOwnershipActor {
  const actor = record(value, label)
  if (actor.kind === 'PERSON') {
    exactKeys(actor, ['kind', 'personId'], label)
    return { kind: 'PERSON', personId: personIdFromString(nonEmptyText(actor.personId, `${label} personId`)) }
  }
  if (actor.kind === 'ORGANIZATION') {
    exactKeys(actor, ['kind', 'organizationId'], label)
    return { kind: 'ORGANIZATION', organizationId: organizationIdFromString(nonEmptyText(actor.organizationId, `${label} organizationId`)) }
  }
  throw new TypeError(`${label} kind must be PERSON or ORGANIZATION`)
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

function serializeWorldAnnualDevelopmentCycleV4(value: WorldAnnualDevelopmentCycle): WorldAnnualDevelopmentCycleSaveV4 {
  return Object.freeze({ lastAppliedCycleId: value.lastAppliedCycleId })
}

function parseWorldAnnualDevelopmentCycleV4(value: unknown): WorldAnnualDevelopmentCycle {
  const cycle = record(value, 'World annual development cycle V4')
  exactKeys(cycle, ['lastAppliedCycleId'], 'World annual development cycle V4')
  if (cycle.lastAppliedCycleId !== null && (typeof cycle.lastAppliedCycleId !== 'string' || cycle.lastAppliedCycleId.length === 0)) {
    throw new TypeError('World annual development cycle V4 lastAppliedCycleId must be a non-empty string or null')
  }
  return Object.freeze({ lastAppliedCycleId: cycle.lastAppliedCycleId })
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

function nullableNumber(value: unknown, label: string): number | null {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) throw new TypeError(`${label} must be a finite number or null`)
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
