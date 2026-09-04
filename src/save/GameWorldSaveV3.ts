import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createTeamFinances, type TeamFinances } from '@/domain/finance'
import { staffPersonIdFromString, teamIdFromString, type StaffPersonId } from '@/domain/ids'
import { createStaffEmployment, createStaffJobOpening, staffJobCandidacyIdFromString, staffJobOfferIdFromString, staffJobOpeningIdFromString, type StaffCareerHistoryEntry, type StaffEmployment, type StaffInterview, type StaffJobCandidacy, type StaffJobOffer, type StaffJobOpening } from '@/domain/staffCareer'
import { createStaffContract, staffContractIdFromString, type StaffContract } from '@/domain/staffContract'
import { createStaffReputationProfile, STAFF_REPUTATION_DIMENSIONS, type StaffReputationProfile } from '@/domain/staffReputation'
import { createStaffPoliticalCase, POLITICAL_AGENDAS, POLITICAL_CASE_SOURCE_KINDS, STAFF_POLITICAL_CASE_RESOLUTION_KINDS, STAFF_POLITICAL_CASE_STATUSES, type StaffPoliticalCase, type StaffPoliticalCaseResolutionKind } from '@/domain/staffPolitics'
import { ensureStaffContractStructure, ensureStaffEmploymentStructure, ensureStaffReputationStructure } from '@/engine/world/StaffCareerEnrichment'
import { parseGameDate } from '@/domain/date'
import { deserializeGameWorldV2, migrateGameWorldSaveV1ToV2, serializeGameWorldV2, assertExactKeys, type GameWorldSaveV2, type SaveGameEnvelopeV2 } from './GameWorldSaveV2'
import type { SaveGameEnvelopeV1 } from './GameWorldSaveV1'

/**
 * Wave 4A save layer (Issue #19 §10). V1/V2 remain legacy-readable and unweakened. Runtime
 * serialization writes V3 only. V3 owns: the new Staff Career/Contract/Reputation collections
 * (via `staffCareerRuntime`, mirroring how V2 layers `scoutingRuntime`/`marketRuntime` on top of
 * V1) and the new `TeamFinances.staffSalaryBudget` field (strictly validated here rather than left
 * to V1's loose backfilling reader, per the "changed contract" rule).
 */
/** `staffCareerRuntime` is REQUIRED (Wave 4A review Blocker 3) — V3 is precisely the format that owns Staff Career state; tolerance for its absence belongs only to the V1/V2 migration path (`migrateGameWorldSaveV1ToV3`/`migrateGameWorldSaveV2ToV3`), never to a canonical V3 payload. */
export interface GameWorldSaveV3 extends GameWorldSaveV2 { readonly staffCareerRuntime: Readonly<Record<string, unknown>> }
export interface SaveGameEnvelopeV3 { readonly schemaVersion: 3; readonly savedAt: string; readonly payload: GameWorldSaveV3 }

export function migrateGameWorldSaveV1ToV3(value: SaveGameEnvelopeV1): SaveGameEnvelopeV3 {
  return migrateGameWorldSaveV2ToV3(migrateGameWorldSaveV1ToV2(value))
}

/**
 * `deserializeGameWorldV2` never runs Staff Career enrichment (it always loads with
 * `enrichLegacy: false`, since V2 itself is a legacy layer that owns no Staff Career state) — so a
 * genuinely pre-Wave-4A V2 save arrives here with EMPTY Staff Career collections. This migration is
 * the one place responsible for deterministically backfilling `StaffEmployment`/`CareerHistory`/
 * `StaffContract`/`StaffReputation` before handing the world to V3's serializer, exactly once, pure
 * and idempotent (re-running this migration on an already-enriched world is a no-op per-enrichment
 * function).
 */
export function migrateGameWorldSaveV2ToV3(value: SaveGameEnvelopeV2): SaveGameEnvelopeV3 {
  const payload = record(value.payload, 'Save V2 payload')
  const trainingStaffAssignments = parseScheduledTrainingStaffAssignments(payload.scheduledTrainingSessions)
  const compatibilityPayload = stripScheduledTrainingStaffAssignments(payload)
  const baseWorld = deserializeGameWorldV2({ ...value, payload: compatibilityPayload })
  const enriched = ensureStaffReputationStructure(ensureStaffContractStructure(ensureStaffEmploymentStructure(baseWorld)))
  const world = restoreScheduledTrainingStaffAssignments(enriched, trainingStaffAssignments)
  return { schemaVersion: 3, savedAt: value.savedAt, payload: v3Payload(value.payload, world) }
}

export function serializeGameWorldV3(world: GameWorld, savedAt: string): SaveGameEnvelopeV3 {
  const compatibilityPayload = serializeGameWorldV2(world, savedAt)
  return { schemaVersion: 3, savedAt: compatibilityPayload.savedAt, payload: v3Payload(compatibilityPayload.payload, world) }
}

export function deserializeGameWorldV3(value: unknown): GameWorld {
  const envelope = record(value, 'Save V3 file')
  assertExactKeys(envelope, ['schemaVersion', 'savedAt', 'payload'], 'Save V3 envelope')
  if (envelope.schemaVersion !== 3) throw new Error('Unsupported save version')
  if (typeof envelope.savedAt !== 'string' || Number.isNaN(Date.parse(envelope.savedAt))) throw new TypeError('Save V3 savedAt must be an ISO-8601 timestamp')
  const payload = record(envelope.payload, 'Save V3 payload')
  const teamFinances = array(payload.teamFinances, 'Save V3 teamFinances').map(parseTeamFinancesV3)
  const runtime = parseStaffCareerRuntimeV3(payload.staffCareerRuntime)
  const trainingStaffAssignments = parseScheduledTrainingStaffAssignments(payload.scheduledTrainingSessions)
  // V2/V1 are legacy layers and do not own Staff Career. A current V3 session may carry concrete
  // execution-staff IDs, but validating those IDs requires V3 employment to exist. Strip only that
  // new field while constructing the compatibility world, restore V3 Staff Career, then restore the
  // assignments through updateGameWorld so the full canonical validator runs with employment live.
  const compatibilityPayload = stripScheduledTrainingStaffAssignments(payload)
  const world = deserializeGameWorldV2({ ...envelope, schemaVersion: 2, payload: compatibilityPayload })
  const withStaffCareer = updateGameWorld(world, {
    teamFinances,
    staffEmploymentByStaffId: runtime.staffEmploymentByStaffId,
    staffCareerHistoryByStaffId: runtime.staffCareerHistoryByStaffId,
    staffJobOpenings: runtime.staffJobOpenings,
    staffJobCandidacies: runtime.staffJobCandidacies,
    staffInterviewsByCandidacyId: runtime.staffInterviewsByCandidacyId,
    staffJobOffers: runtime.staffJobOffers,
    staffContracts: runtime.staffContracts,
    staffReputationProfilesByStaffId: runtime.staffReputationProfilesByStaffId,
    staffPoliticalCases: runtime.staffPoliticalCases,
  })
  return restoreScheduledTrainingStaffAssignments(withStaffCareer, trainingStaffAssignments)
}

function v3Payload(payload: GameWorldSaveV2, world: GameWorld): GameWorldSaveV3 {
  return {
    ...payload,
    teamFinances: Object.values(world.teamFinancesByTeamId).map((finances) => JSON.parse(JSON.stringify(finances)) as Readonly<Record<string, unknown>>),
    staffCareerRuntime: {
      staffEmployment: Object.entries(world.staffEmploymentByStaffId).map(([staffId, employment]) => ({ staffId, employment })),
      staffCareerHistory: Object.entries(world.staffCareerHistoryByStaffId).map(([staffId, history]) => ({ staffId, history })),
      staffJobOpenings: Object.values(world.staffJobOpeningsById),
      staffJobCandidacies: Object.values(world.staffJobCandidaciesById),
      staffInterviews: Object.values(world.staffInterviewsByCandidacyId),
      staffJobOffers: Object.values(world.staffJobOffersById),
      staffContracts: Object.values(world.staffContractsById),
      staffReputationProfiles: Object.entries(world.staffReputationProfilesByStaffId).map(([staffId, profile]) => ({ staffId, profile })),
      staffPoliticalCases: Object.values(world.staffPoliticalCasesById),
    },
  }
}

function parseTeamFinancesV3(value: unknown): TeamFinances {
  const v = record(value, 'Team finances V3')
  assertExactKeys(v, ['teamId', 'playerSalaryBudget', 'staffSalaryBudget'], 'Team finances V3')
  return createTeamFinances({ teamId: teamIdFromString(text(v.teamId, 'Team finances teamId')), playerSalaryBudget: integer(v.playerSalaryBudget, 'Team finances playerSalaryBudget'), staffSalaryBudget: integer(v.staffSalaryBudget, 'Team finances staffSalaryBudget') })
}

function parseStaffCareerRuntimeV3(value: unknown): {
  readonly staffEmploymentByStaffId: Readonly<Record<string, StaffEmployment>>
  readonly staffCareerHistoryByStaffId: Readonly<Record<string, readonly StaffCareerHistoryEntry[]>>
  readonly staffJobOpenings: readonly StaffJobOpening[]
  readonly staffJobCandidacies: readonly StaffJobCandidacy[]
  readonly staffInterviewsByCandidacyId: Readonly<Record<string, StaffInterview>>
  readonly staffJobOffers: readonly StaffJobOffer[]
  readonly staffContracts: readonly StaffContract[]
  readonly staffReputationProfilesByStaffId: Readonly<Record<string, StaffReputationProfile>>
  readonly staffPoliticalCases: readonly StaffPoliticalCase[]
} {
  // `value` is required for a canonical V3 payload (Blocker 3) — `record()` throws if it is
  // `undefined`/missing, so there is no "treat absence as empty" fallback here anymore.
  const runtime = record(value, 'Staff career runtime V3')
  assertExactKeys(runtime, ['staffEmployment', 'staffCareerHistory', 'staffJobOpenings', 'staffJobCandidacies', 'staffInterviews', 'staffJobOffers', 'staffContracts', 'staffReputationProfiles', ...(runtime.staffPoliticalCases === undefined ? [] : ['staffPoliticalCases'])], 'Staff career runtime V3')

  const staffEmploymentByStaffId = Object.fromEntries(array(runtime.staffEmployment, 'Staff career runtime staffEmployment').map((entry) => {
    const e = record(entry, 'Staff employment V3'); assertExactKeys(e, ['staffId', 'employment'], 'Staff employment V3')
    return [staffPersonIdFromString(text(e.staffId, 'Staff employment staffId')), parseStaffEmploymentV3(e.employment)]
  }))
  const staffCareerHistoryByStaffId = Object.fromEntries(array(runtime.staffCareerHistory, 'Staff career runtime staffCareerHistory').map((entry) => {
    const e = record(entry, 'Staff career history V3'); assertExactKeys(e, ['staffId', 'history'], 'Staff career history V3')
    return [staffPersonIdFromString(text(e.staffId, 'Staff career history staffId')), array(e.history, 'Staff career history entries').map(parseStaffCareerHistoryEntryV3)]
  }))
  const staffJobOpenings = array(runtime.staffJobOpenings, 'Staff career runtime staffJobOpenings').map(parseStaffJobOpeningV3)
  const staffJobCandidacies = array(runtime.staffJobCandidacies, 'Staff career runtime staffJobCandidacies').map(parseStaffJobCandidacyV3)
  const staffInterviewsByCandidacyId = Object.fromEntries(array(runtime.staffInterviews, 'Staff career runtime staffInterviews').map((entry) => {
    const e = record(entry, 'Staff interview V3'); assertExactKeys(e, ['candidacyId', 'status'], 'Staff interview V3')
    const candidacyId = staffJobCandidacyIdFromString(text(e.candidacyId, 'Staff interview candidacyId'))
    return [candidacyId, { candidacyId, status: enumValue(e.status, ['scheduled', 'completed'], 'Staff interview status') as StaffInterview['status'] }]
  }))
  const staffJobOffers = array(runtime.staffJobOffers, 'Staff career runtime staffJobOffers').map(parseStaffJobOfferV3)
  const staffContracts = array(runtime.staffContracts, 'Staff career runtime staffContracts').map(parseStaffContractV3)
  const staffReputationProfilesByStaffId = Object.fromEntries(array(runtime.staffReputationProfiles, 'Staff career runtime staffReputationProfiles').map((entry) => {
    const e = record(entry, 'Staff reputation profile V3'); assertExactKeys(e, ['staffId', 'profile'], 'Staff reputation profile V3')
    return [staffPersonIdFromString(text(e.staffId, 'Staff reputation staffId')), parseStaffReputationProfileV3(e.profile)]
  }))
  const staffPoliticalCases = runtime.staffPoliticalCases === undefined ? [] : array(runtime.staffPoliticalCases, 'Staff career runtime staffPoliticalCases').map(parseStaffPoliticalCaseV3)

  return { staffEmploymentByStaffId, staffCareerHistoryByStaffId, staffJobOpenings, staffJobCandidacies, staffInterviewsByCandidacyId, staffJobOffers, staffContracts, staffReputationProfilesByStaffId, staffPoliticalCases }
}

function parseStaffPoliticalCaseV3(value: unknown): StaffPoliticalCase {
  const item = record(value, 'Staff political case V3')
  assertExactKeys(item, ['id', 'scopeKey', 'teamId', 'sourceKind', 'sourceId', 'agenda', 'openedOn', 'lastEvaluatedOn', 'status', ...(item.subjectStaffId === undefined ? [] : ['subjectStaffId']), ...(item.resolution === undefined ? [] : ['resolution'])], 'Staff political case V3')
  const resolution = item.resolution === undefined ? undefined : (() => {
    const raw = record(item.resolution, 'Staff political case resolution V3')
    assertExactKeys(raw, ['kind', 'resolvedOn'], 'Staff political case resolution V3')
    return { kind: enumValue(raw.kind, STAFF_POLITICAL_CASE_RESOLUTION_KINDS, 'Staff political case resolution kind') as StaffPoliticalCaseResolutionKind, resolvedOn: parseGameDate(text(raw.resolvedOn, 'Staff political case resolution date')) }
  })()
  return createStaffPoliticalCase({ id: text(item.id, 'Staff political case id'), scopeKey: text(item.scopeKey, 'Staff political case scope key'), teamId: teamIdFromString(text(item.teamId, 'Staff political case team ID')), sourceKind: enumValue(item.sourceKind, POLITICAL_CASE_SOURCE_KINDS, 'Staff political case source kind') as StaffPoliticalCase['sourceKind'], sourceId: text(item.sourceId, 'Staff political case source ID'), agenda: enumValue(item.agenda, POLITICAL_AGENDAS, 'Staff political case agenda') as StaffPoliticalCase['agenda'], ...(item.subjectStaffId === undefined ? {} : { subjectStaffId: staffPersonIdFromString(text(item.subjectStaffId, 'Staff political case subject staff ID')) }), openedOn: parseGameDate(text(item.openedOn, 'Staff political case openedOn')), lastEvaluatedOn: parseGameDate(text(item.lastEvaluatedOn, 'Staff political case lastEvaluatedOn')), status: enumValue(item.status, STAFF_POLITICAL_CASE_STATUSES, 'Staff political case status') as StaffPoliticalCase['status'], ...(resolution === undefined ? {} : { resolution }) })
}

function parseStaffEmploymentV3(value: unknown): StaffEmployment {
  const v = record(value, 'Staff employment V3 value')
  const status = enumValue(v.status, ['employed', 'unemployed'], 'Staff employment status')
  if (status === 'unemployed') { assertExactKeys(v, ['status'], 'Staff employment V3 value (unemployed)'); return createStaffEmployment({ status: 'unemployed' }) }
  const keys = ['status', 'teamId', 'roleId', ...(v.startedOn === undefined ? [] : ['startedOn'])]
  assertExactKeys(v, keys, 'Staff employment V3 value (employed)')
  return createStaffEmployment({ status: 'employed', teamId: teamIdFromString(text(v.teamId, 'Staff employment teamId')), roleId: text(v.roleId, 'Staff employment roleId') as never, ...(v.startedOn === undefined ? {} : { startedOn: parseGameDate(text(v.startedOn, 'Staff employment startedOn')) }) })
}

function parseStaffCareerHistoryEntryV3(value: unknown): StaffCareerHistoryEntry {
  const v = record(value, 'Staff career history entry V3')
  const kind = enumValue(v.kind, ['appointment', 'departure'], 'Staff career history kind')
  if (kind === 'appointment') {
    assertExactKeys(v, ['kind', 'staffId', 'teamId', 'roleId', 'date', 'reason'], 'Staff career history appointment V3')
    return { kind: 'appointment', staffId: staffPersonIdFromString(text(v.staffId, 'Staff career history staffId')), teamId: teamIdFromString(text(v.teamId, 'Staff career history teamId')), roleId: text(v.roleId, 'Staff career history roleId') as never, date: parseGameDate(text(v.date, 'Staff career history date')), reason: enumValue(v.reason, ['initialAppointment', 'hired', 'promoted', 'reassigned'], 'Staff career history appointment reason') as never }
  }
  assertExactKeys(v, ['kind', 'staffId', 'teamId', 'date', 'reason'], 'Staff career history departure V3')
  return { kind: 'departure', staffId: staffPersonIdFromString(text(v.staffId, 'Staff career history staffId')), teamId: teamIdFromString(text(v.teamId, 'Staff career history teamId')), date: parseGameDate(text(v.date, 'Staff career history date')), reason: enumValue(v.reason, ['fired', 'resigned', 'acceptedOtherJob', 'retired'], 'Staff career history departure reason') as never }
}

function parseStaffJobOpeningV3(value: unknown): StaffJobOpening {
  const v = record(value, 'Staff job opening V3')
  assertExactKeys(v, ['id', 'teamId', 'roleId', 'status', 'createdOn'], 'Staff job opening V3')
  return createStaffJobOpening({ id: staffJobOpeningIdFromString(text(v.id, 'Staff job opening id')), teamId: teamIdFromString(text(v.teamId, 'Staff job opening teamId')), roleId: text(v.roleId, 'Staff job opening roleId') as never, status: enumValue(v.status, ['open', 'filled', 'closed'], 'Staff job opening status') as never, createdOn: parseGameDate(text(v.createdOn, 'Staff job opening createdOn')) })
}

function parseStaffJobCandidacyV3(value: unknown): StaffJobCandidacy {
  const v = record(value, 'Staff job candidacy V3')
  assertExactKeys(v, ['id', 'jobOpeningId', 'staffId', 'status', 'createdOn', ...(v.origin === undefined ? [] : ['origin'])], 'Staff job candidacy V3')
  return { id: staffJobCandidacyIdFromString(text(v.id, 'Staff job candidacy id')), jobOpeningId: staffJobOpeningIdFromString(text(v.jobOpeningId, 'Staff job candidacy opening')), staffId: staffPersonIdFromString(text(v.staffId, 'Staff job candidacy staffId')), status: enumValue(v.status, ['identified', 'interviewing', 'rejected', 'offered', 'withdrawn', 'hired'], 'Staff job candidacy status') as never, createdOn: parseGameDate(text(v.createdOn, 'Staff job candidacy createdOn')), ...(v.origin === undefined ? {} : { origin: enumValue(v.origin, ['teamIdentified', 'staffApplied'], 'Staff job candidacy origin') as import('@/domain/staffCareer').StaffJobCandidacyOrigin }) }
}

function parseStaffJobOfferV3(value: unknown): StaffJobOffer {
  const v = record(value, 'Staff job offer V3')
  const keys = ['id', 'jobOpeningId', 'staffId', 'teamId', 'createdOn', 'status', ...(v.annualSalary === undefined ? [] : ['annualSalary'])]
  assertExactKeys(v, keys, 'Staff job offer V3')
  return { id: staffJobOfferIdFromString(text(v.id, 'Staff job offer id')), jobOpeningId: staffJobOpeningIdFromString(text(v.jobOpeningId, 'Staff job offer opening')), staffId: staffPersonIdFromString(text(v.staffId, 'Staff job offer staffId')), teamId: teamIdFromString(text(v.teamId, 'Staff job offer teamId')), ...(v.annualSalary === undefined ? {} : { annualSalary: finite(v.annualSalary, 'Staff job offer annualSalary') }), createdOn: parseGameDate(text(v.createdOn, 'Staff job offer createdOn')), status: enumValue(v.status, ['pending', 'accepted', 'declined', 'withdrawn'], 'Staff job offer status') as never }
}

function parseStaffContractV3(value: unknown): StaffContract {
  const v = record(value, 'Staff contract V3')
  const keys = ['id', 'staffId', 'teamId', 'kind', 'term', 'compensation', ...(v.termination === undefined ? [] : ['termination'])]
  assertExactKeys(v, keys, 'Staff contract V3')
  const term = record(v.term, 'Staff contract V3 term'); assertExactKeys(term, ['startsOn', 'expiresOn'], 'Staff contract V3 term')
  const compensation = record(v.compensation, 'Staff contract V3 compensation'); assertExactKeys(compensation, ['annualSalary'], 'Staff contract V3 compensation')
  const termination = v.termination === undefined ? undefined : (() => { const t = record(v.termination, 'Staff contract V3 termination'); assertExactKeys(t, ['effectiveOn', 'reason'], 'Staff contract V3 termination'); return { effectiveOn: parseGameDate(text(t.effectiveOn, 'Staff contract termination effectiveOn')), reason: enumValue(t.reason, ['performance', 'budgetCuts', 'roleEliminated', 'resigned'], 'Staff contract termination reason') as never } })()
  return createStaffContract({
    id: staffContractIdFromString(text(v.id, 'Staff contract id')),
    staffId: staffPersonIdFromString(text(v.staffId, 'Staff contract staffId')),
    teamId: teamIdFromString(text(v.teamId, 'Staff contract teamId')),
    kind: enumValue(v.kind, ['standard'], 'Staff contract kind') as 'standard',
    term: { startsOn: parseGameDate(text(term.startsOn, 'Staff contract startsOn')), expiresOn: parseGameDate(text(term.expiresOn, 'Staff contract expiresOn')) },
    compensation: { annualSalary: finite(compensation.annualSalary, 'Staff contract annualSalary') },
    ...(termination === undefined ? {} : { termination }),
  })
}

function parseStaffReputationProfileV3(value: unknown): StaffReputationProfile {
  const v = record(value, 'Staff reputation profile V3 value')
  assertExactKeys(v, ['values'], 'Staff reputation profile V3 value')
  const values = record(v.values, 'Staff reputation values V3')
  assertExactKeys(values, [...STAFF_REPUTATION_DIMENSIONS], 'Staff reputation values V3')
  return createStaffReputationProfile({ values: Object.fromEntries(STAFF_REPUTATION_DIMENSIONS.map((dimension) => [dimension, finite(values[dimension], `Staff reputation ${dimension}`)])) as never })
}

function parseScheduledTrainingStaffAssignments(value: unknown): Readonly<Record<string, readonly StaffPersonId[]>> {
  if (value === undefined) return Object.freeze({})
  const result: Record<string, readonly StaffPersonId[]> = {}
  for (const entry of array(value, 'Save scheduled training sessions')) {
    const session = record(entry, 'Save scheduled training session')
    if (session.assignedStaffPersonIds === undefined) continue
    const sessionId = text(session.id, 'Scheduled training session id')
    const staffIds = array(session.assignedStaffPersonIds, `Scheduled training session ${sessionId} assigned staff`).map((staffId) => staffPersonIdFromString(text(staffId, `Scheduled training session ${sessionId} assigned staff id`)))
    if (new Set(staffIds).size !== staffIds.length) throw new TypeError(`Scheduled training session ${sessionId} assigned staff must be unique`)
    result[sessionId] = Object.freeze(staffIds)
  }
  return Object.freeze(result)
}

function stripScheduledTrainingStaffAssignments(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.scheduledTrainingSessions === undefined) return payload
  const scheduledTrainingSessions = array(payload.scheduledTrainingSessions, 'Save scheduled training sessions').map((entry) => {
    const session = { ...record(entry, 'Save scheduled training session') }
    delete session.assignedStaffPersonIds
    return session
  })
  return { ...payload, scheduledTrainingSessions }
}

function restoreScheduledTrainingStaffAssignments(world: GameWorld, assignments: Readonly<Record<string, readonly StaffPersonId[]>>): GameWorld {
  if (Object.keys(assignments).length === 0) return world
  const scheduledTrainingSessionsById = { ...world.scheduledTrainingSessionsById }
  for (const [sessionId, staffIds] of Object.entries(assignments)) {
    const session = scheduledTrainingSessionsById[sessionId]
    if (session === undefined) throw new TypeError(`Scheduled training staff assignment references missing session ${sessionId}`)
    scheduledTrainingSessionsById[sessionId] = { ...session, assignedStaffPersonIds: staffIds }
  }
  return updateGameWorld(world, { scheduledTrainingSessionsById })
}

/** Canonical read dispatcher (Issue #19 §10): V1/V2 are migrated purely up to V3; runtime serialization writes V3 only. Supersedes `GameWorldSaveV2.deserializeGameWorldSave`, which remains for its own layer's direct V1/V2 tests. */
export function deserializeGameWorldSave(value: unknown): GameWorld {
  const version = (value as { schemaVersion?: unknown }).schemaVersion
  if (version === 1) return deserializeGameWorldV3(migrateGameWorldSaveV1ToV3(value as SaveGameEnvelopeV1))
  if (version === 2) return deserializeGameWorldV3(migrateGameWorldSaveV2ToV3(value as SaveGameEnvelopeV2))
  if (version === 3) return deserializeGameWorldV3(value)
  throw new Error('Unsupported save version')
}

function record(value: unknown, name: string): Record<string, unknown> { if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`); return value as Record<string, unknown> }
function array(value: unknown, name: string): readonly unknown[] { if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`); return value }
function text(value: unknown, name: string): string { if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${name} must be a non-empty string`); return value }
function finite(value: unknown, name: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`); return value }
function integer(value: unknown, name: string): number { const result = finite(value, name); if (!Number.isInteger(result)) throw new TypeError(`${name} must be an integer`); return result }
function enumValue(value: unknown, allowed: readonly string[], name: string): string { const result = text(value, name); if (!allowed.includes(result)) throw new TypeError(`${name} is invalid`); return result }
