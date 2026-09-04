import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { staffPersonIdFromString, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { updateGameWorld, getNextScheduledGame } from '@/domain/world'
import { createDefaultStaffReputationProfile } from '@/domain/staffReputation'
import { createStaffJobOpeningForTeam, identifyStaffCandidate, completeStaffInterview, startStaffInterview, createStaffJobOffer, acceptStaffJobOffer } from '@/app/staffCareer'
import { requestScouting } from '@/engine/scouting'
import { progressOppositionScoutingReports } from '@/engine/tactics/OppositionScoutingReportEngine'
import { advanceGameDay } from '@/app/game/advanceGameDay'
import { setTeamResponsibility } from '@/app/staffResponsibilities'
import { serializeGameWorldV1 } from './GameWorldSaveV1'
import { serializeGameWorldV2 } from './GameWorldSaveV2'
import { serializeGameWorldV3, deserializeGameWorldV3, deserializeGameWorldSave, migrateGameWorldSaveV1ToV3, migrateGameWorldSaveV2ToV3 } from './GameWorldSaveV3'

const savedAt = '2032-10-01T00:00:00.000Z'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as StaffAttributes

function worldWithHiredStaff() {
  const base = createNewGame()
  const teamId = Object.values(base.teams)[0]!.id
  const staffId = staffPersonIdFromString('v3-hired-staff')
  const withPerson = updateGameWorld(base, { staffPeople: [...Object.values(base.staffPeopleById), { id: staffId, identity: { firstName: 'Vee', lastName: 'Three' }, professional: { attributes: flatAttributes } }] })
  const withReputation = updateGameWorld(withPerson, { staffReputationProfilesByStaffId: { ...withPerson.staffReputationProfilesByStaffId, [staffId]: createDefaultStaffReputationProfile() } })
  const { world: withOpening, opening } = createStaffJobOpeningForTeam(withReputation, { teamId, roleId: 'advanceScout' })
  const candidate = identifyStaffCandidate(withOpening, { openingId: opening.id, staffId })
  const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
  const offered = createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })
  const hired = acceptStaffJobOffer(offered.world, offered.offerId)
  return { world: hired, teamId, staffId }
}

describe('GameWorldSaveV3', () => {
  it('round-trips a fresh world through V3', () => {
    const world = createNewGame()
    const saved = serializeGameWorldV3(world, savedAt)
    expect(saved.schemaVersion).toBe(3)
    const loaded = deserializeGameWorldV3(saved)
    expect(loaded.teamFinancesByTeamId).toEqual(world.teamFinancesByTeamId)
    expect(Object.values(loaded.teamFinancesByTeamId)[0]!.staffSalaryBudget).toBeGreaterThan(0)
  })

  it('V3 round-trip of every new collection: employment, career history, job openings/candidacies/interviews/offers, contracts, reputation', () => {
    const { world } = worldWithHiredStaff()
    const loaded = deserializeGameWorldV3(serializeGameWorldV3(world, savedAt))
    expect(loaded.staffEmploymentByStaffId).toEqual(world.staffEmploymentByStaffId)
    expect(loaded.staffCareerHistoryByStaffId).toEqual(world.staffCareerHistoryByStaffId)
    expect(loaded.staffJobOpeningsById).toEqual(world.staffJobOpeningsById)
    expect(loaded.staffJobCandidaciesById).toEqual(world.staffJobCandidaciesById)
    expect(loaded.staffInterviewsByCandidacyId).toEqual(world.staffInterviewsByCandidacyId)
    expect(loaded.staffJobOffersById).toEqual(world.staffJobOffersById)
    expect(loaded.staffContractsById).toEqual(world.staffContractsById)
    expect(loaded.staffReputationProfilesByStaffId).toEqual(world.staffReputationProfilesByStaffId)
  })

  it('round-trips open and resolved Staff Political Cases, while legacy V3 defaults them to empty', () => {
    const { world, teamId, staffId } = worldWithHiredStaff()
    const [supporter, opponent, mediator] = Object.keys(world.staffPeopleById).filter((id) => id !== staffId).slice(0, 3) as [string, string, string]
    const openCase = { id: `staff-political-case:${teamId}:CAREER_REQUEST:request-open`, scopeKey: teamId, teamId, sourceKind: 'CAREER_REQUEST' as const, sourceId: 'request-open', agenda: 'CAREER' as const, subjectStaffId: staffId, openedOn: world.currentDate, lastEvaluatedOn: world.currentDate, status: 'OPEN' as const, positions: [{ actorId: supporter as never, stance: 'SUPPORT' as const, since: world.currentDate, lastEvaluatedOn: world.currentDate }, { actorId: opponent as never, stance: 'OPPOSE' as const, since: world.currentDate, lastEvaluatedOn: world.currentDate }, { actorId: mediator as never, stance: 'MEDIATE' as const, since: world.currentDate, lastEvaluatedOn: world.currentDate }] }
    const resolvedCase = { id: `staff-political-case:${teamId}:CAREER_REQUEST:request-resolved`, scopeKey: teamId, teamId, sourceKind: 'CAREER_REQUEST' as const, sourceId: 'request-resolved', agenda: 'CAREER' as const, subjectStaffId: staffId, openedOn: world.currentDate, lastEvaluatedOn: world.currentDate, status: 'RESOLVED' as const, resolution: { kind: 'APPROVED' as const, resolvedOn: world.currentDate }, positions: [] }
    const withCases = updateGameWorld(world, { staffPoliticalCases: [openCase, resolvedCase] })
    const saved = serializeGameWorldV3(withCases, savedAt)
    expect(deserializeGameWorldV3(saved).staffPoliticalCasesById).toEqual(withCases.staffPoliticalCasesById)
    const legacy = structuredClone(saved)
    delete (legacy.payload.staffCareerRuntime as Record<string, unknown>).staffPoliticalCases
    expect(deserializeGameWorldV3(legacy).staffPoliticalCasesById).toEqual({})
  })

  it('rejects malformed Staff Political Cases on load', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const saved = serializeGameWorldV3(world, savedAt)
    const tampered = structuredClone(saved)
    ;(tampered.payload.staffCareerRuntime as Record<string, unknown>).staffPoliticalCases = [{ id: 'alternate-case-id', scopeKey: teamId, teamId, sourceKind: 'CAREER_REQUEST', sourceId: 'request', agenda: 'CAREER', openedOn: world.currentDate, lastEvaluatedOn: world.currentDate, status: 'OPEN' }]
    expect(() => deserializeGameWorldV3(tampered)).toThrow()
  })

  it('rejects malformed persisted Staff Political Position rows', () => {
    const { world, teamId, staffId } = worldWithHiredStaff(); const actor = Object.keys(world.staffPeopleById).find((id) => id !== staffId)!
    const politicalCase = { id: `staff-political-case:${teamId}:CAREER_REQUEST:position-malformed`, scopeKey: teamId, teamId, sourceKind: 'CAREER_REQUEST' as const, sourceId: 'position-malformed', agenda: 'CAREER' as const, subjectStaffId: staffId, openedOn: world.currentDate, lastEvaluatedOn: world.currentDate, status: 'OPEN' as const, positions: [{ actorId: actor as never, stance: 'SUPPORT' as const, since: world.currentDate, lastEvaluatedOn: world.currentDate }] }
    const saved = serializeGameWorldV3(updateGameWorld(world, { staffPoliticalCases: [politicalCase] }), savedAt)
    for (const mutate of [(positions: Record<string, unknown>[]) => positions.push({ ...positions[0] }), (positions: Record<string, unknown>[]) => { positions[0]!.stance = 'NEUTRAL' }, (positions: Record<string, unknown>[]) => { positions[0]!.since = '1900-01-01' }]) { const tampered = structuredClone(saved); const positions = ((tampered.payload.staffCareerRuntime as Record<string, unknown>).staffPoliticalCases as { positions: Record<string, unknown>[] }[])[0]!.positions; mutate(positions); expect(() => deserializeGameWorldV3(tampered)).toThrow() }
  })

  it('V2 -> V3 migration is deterministic', () => {
    const world = createNewGame()
    const v2 = serializeGameWorldV2(world, savedAt)
    const first = migrateGameWorldSaveV2ToV3(v2)
    const second = migrateGameWorldSaveV2ToV3(v2)
    expect(first).toEqual(second)
    expect(first.schemaVersion).toBe(3)
  })

  it('V1 -> V2 -> V3 still works (via the V1 -> V3 migration path)', () => {
    const world = createNewGame()
    const v1 = serializeGameWorldV1(world, savedAt)
    const migrated = migrateGameWorldSaveV1ToV3(v1)
    const loaded = deserializeGameWorldV3(migrated)
    expect(loaded.currentSeasonId).toBe(world.currentSeasonId)
    expect(Object.values(loaded.teamFinancesByTeamId)[0]!.staffSalaryBudget).toBeGreaterThan(0)
  })

  it('an old V2 finance row (no staffSalaryBudget) receives one deterministically during migration', () => {
    const world = createNewGame()
    const v2 = serializeGameWorldV2(world, savedAt)
    // V2 payload's teamFinances entries never had staffSalaryBudget when V2 was the current write format.
    const legacyFinances = v2.payload.teamFinances.map((entry) => { const { staffSalaryBudget: _s, ...rest } = entry as Record<string, unknown>; return rest })
    const legacyV2 = { ...v2, payload: { ...v2.payload, teamFinances: legacyFinances } }
    const migrated = migrateGameWorldSaveV2ToV3(legacyV2 as never)
    const loaded = deserializeGameWorldV3(migrated)
    for (const finance of Object.values(loaded.teamFinancesByTeamId)) expect(finance.staffSalaryBudget).toBeGreaterThan(0)
  })

  it('rejects a malformed V3 Staff contract (missing required field)', () => {
    const { world } = worldWithHiredStaff()
    const saved = serializeGameWorldV3(world, savedAt)
    const runtime = saved.payload.staffCareerRuntime as { staffContracts: Record<string, unknown>[] }
    const tampered = structuredClone(saved)
    const tamperedRuntime = tampered.payload.staffCareerRuntime as { staffContracts: Record<string, unknown>[] }
    delete tamperedRuntime.staffContracts[0]!.compensation
    void runtime
    expect(() => deserializeGameWorldV3(tampered)).toThrow()
  })

  it('rejects a malformed V3 Staff reputation profile (out-of-range value)', () => {
    const { world } = worldWithHiredStaff()
    const saved = serializeGameWorldV3(world, savedAt)
    const tampered = structuredClone(saved)
    const runtime = tampered.payload.staffCareerRuntime as { staffReputationProfiles: { profile: { values: Record<string, number> } }[] }
    runtime.staffReputationProfiles[0]!.profile.values.competence = 99_999
    expect(() => deserializeGameWorldV3(tampered)).toThrow()
  })

  it('rejects a malformed V3 Staff employment (unemployed status carrying a team)', () => {
    const { world } = worldWithHiredStaff()
    const saved = serializeGameWorldV3(world, savedAt)
    const tampered = structuredClone(saved)
    const runtime = tampered.payload.staffCareerRuntime as { staffEmployment: { employment: Record<string, unknown> }[] }
    const employedEntry = runtime.staffEmployment.find((entry) => entry.employment.status === 'employed')!
    employedEntry.employment = { status: 'unemployed', teamId: 'stray-team' }
    expect(() => deserializeGameWorldV3(tampered)).toThrow()
  })

  it('rejects a malformed V3 teamFinances row (out-of-range staffSalaryBudget)', () => {
    const world = createNewGame()
    const saved = serializeGameWorldV3(world, savedAt)
    const tampered = structuredClone(saved)
    ;(tampered.payload.teamFinances[0] as Record<string, unknown>).staffSalaryBudget = -5
    expect(() => deserializeGameWorldV3(tampered)).toThrow()
  })

  it('Wave 1-3 collections survive V3 round-trip unchanged: responsibilities, delegation outcomes, scouting runtime, opposition reports, staffFamiliarity', async () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams).map((team) => team.id).find((id) => getNextScheduledGame(base, id) !== undefined) as TeamId | undefined
    if (teamId === undefined) return
    const scout = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === teamId && item.role === 'regionalScout')
    const player = Object.values(base.players).find((candidate) => !base.teams[teamId]!.rosterPlayerIds.includes(candidate.id))
    let world = base
    if (scout !== undefined && player !== undefined) {
      world = requestScouting(base, { organizationId: `organization:${teamId}` as never, playerId: player.id, missionType: 'QUICK_LOOK', evaluatorStaffId: scout.staffPersonId })
    }
    world = progressOppositionScoutingReports(world)

    const loaded = deserializeGameWorldV3(serializeGameWorldV3(world, savedAt))
    expect(loaded.responsibilitiesById).toEqual(world.responsibilitiesById)
    expect(loaded.delegationOutcomesById).toEqual(world.delegationOutcomesById)
    expect(loaded.scoutingAssignmentsById).toEqual(world.scoutingAssignmentsById)
    expect(loaded.evaluatorReportsById).toEqual(world.evaluatorReportsById)
    expect(loaded.oppositionScoutingReportsById).toEqual(world.oppositionScoutingReportsById)
    expect(loaded.organizationKnowledge).toEqual(world.organizationKnowledge)
  })

  it('Wave 4C3: DelegationOutcome userDisposition/userDecidedOn round-trip through V3, and remain unset for a legacy outcome with neither field', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const responsibilityId = Object.keys(base.responsibilitiesById).find((id) => base.responsibilitiesById[id as never]!.teamId === teamId) as never
    const staffId = Object.values(base.teamStaffAssignmentsById).find((assignment) => assignment.teamId === teamId)!.staffPersonId
    const accepted = { id: 'outcome:v3-accepted' as never, responsibilityId, staffId, decidedOn: base.currentDate, kind: 'createTeamTrainingPlan' as const, applied: true, qualityScore: 70, payload: {}, userDisposition: 'accepted' as const, userDecidedOn: base.currentDate }
    const dismissed = { id: 'outcome:v3-dismissed' as never, responsibilityId, staffId, decidedOn: base.currentDate, kind: 'createTeamTrainingPlan' as const, applied: false, qualityScore: 40, payload: {}, userDisposition: 'dismissed' as const, userDecidedOn: base.currentDate }
    const legacy = { id: 'outcome:v3-legacy' as never, responsibilityId, staffId, decidedOn: base.currentDate, kind: 'createTeamTrainingPlan' as const, applied: true, qualityScore: 55, payload: {} }
    const world = updateGameWorld(base, { delegationOutcomes: [...Object.values(base.delegationOutcomesById), accepted, dismissed, legacy] })

    const loaded = deserializeGameWorldV3(serializeGameWorldV3(world, savedAt))
    expect(loaded.delegationOutcomesById).toEqual(world.delegationOutcomesById)
    expect(loaded.delegationOutcomesById['outcome:v3-accepted' as never]!.userDisposition).toBe('accepted')
    expect(loaded.delegationOutcomesById['outcome:v3-dismissed' as never]!.userDisposition).toBe('dismissed')
    expect(loaded.delegationOutcomesById['outcome:v3-legacy' as never]!.userDisposition).toBeUndefined()
    expect(loaded.delegationOutcomesById['outcome:v3-legacy' as never]!.userDecidedOn).toBeUndefined()
    expect(serializeGameWorldV3(world, savedAt).schemaVersion).toBe(3)
  })

  it('Wave 4C3: malformed save — userDecidedOn present without userDisposition is rejected atomically on load', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const responsibilityId = Object.keys(base.responsibilitiesById).find((id) => base.responsibilitiesById[id as never]!.teamId === teamId) as never
    const staffId = Object.values(base.teamStaffAssignmentsById).find((assignment) => assignment.teamId === teamId)!.staffPersonId
    const dismissed = { id: 'outcome:v3-malformed-decidedon-only' as never, responsibilityId, staffId, decidedOn: base.currentDate, kind: 'createTeamTrainingPlan' as const, applied: false, qualityScore: 40, payload: {}, userDisposition: 'dismissed' as const, userDecidedOn: base.currentDate }
    const world = updateGameWorld(base, { delegationOutcomes: [...Object.values(base.delegationOutcomesById), dismissed] })

    const saved = serializeGameWorldV3(world, savedAt)
    const malformedOutcomes = saved.payload.delegationOutcomes!.map((entry) => entry.id === 'outcome:v3-malformed-decidedon-only' ? { ...entry, userDisposition: undefined } : entry)
    const tampered = { ...saved, payload: { ...saved.payload, delegationOutcomes: malformedOutcomes } }

    expect(() => deserializeGameWorldV3(tampered)).toThrow()
  })

  it('Wave 4C3: malformed save — an unrecognized userDisposition value is rejected atomically on load', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const responsibilityId = Object.keys(base.responsibilitiesById).find((id) => base.responsibilitiesById[id as never]!.teamId === teamId) as never
    const staffId = Object.values(base.teamStaffAssignmentsById).find((assignment) => assignment.teamId === teamId)!.staffPersonId
    const dismissed = { id: 'outcome:v3-malformed-bad-enum' as never, responsibilityId, staffId, decidedOn: base.currentDate, kind: 'createTeamTrainingPlan' as const, applied: false, qualityScore: 40, payload: {}, userDisposition: 'dismissed' as const, userDecidedOn: base.currentDate }
    const world = updateGameWorld(base, { delegationOutcomes: [...Object.values(base.delegationOutcomesById), dismissed] })

    const saved = serializeGameWorldV3(world, savedAt)
    const malformedOutcomes = saved.payload.delegationOutcomes!.map((entry) => entry.id === 'outcome:v3-malformed-bad-enum' ? { ...entry, userDisposition: 'invalid-value' } : entry)
    const tampered = { ...saved, payload: { ...saved.payload, delegationOutcomes: malformedOutcomes } }

    expect(() => deserializeGameWorldV3(tampered)).toThrow()
  })

  it('dispatch accepts V1/V2/V3 and the current serializer emits V3', () => {
    const world = createNewGame()
    const v1 = serializeGameWorldV1(world, savedAt)
    const v2 = serializeGameWorldV2(world, savedAt)
    const v3 = serializeGameWorldV3(world, savedAt)
    expect(v3.schemaVersion).toBe(3)
    expect(deserializeGameWorldSave(v1).teamFinancesByTeamId).toBeDefined()
    expect(deserializeGameWorldSave(v2).teamFinancesByTeamId).toBeDefined()
    expect(deserializeGameWorldSave(v3).teamFinancesByTeamId).toEqual(world.teamFinancesByTeamId)
  })

  it('V1/V2 never carry Staff Career state: serializeGameWorldV2 omits all 8 Staff Career collection keys', () => {
    const world = createNewGame()
    const v2 = serializeGameWorldV2(world, savedAt)
    const staffCareerKeys = ['staffEmploymentByStaffId', 'staffCareerHistoryByStaffId', 'staffJobOpenings', 'staffJobCandidacies', 'staffInterviews', 'staffJobOffers', 'staffContracts', 'staffReputationProfilesByStaffId']
    for (const key of staffCareerKeys) expect(key in v2.payload).toBe(false)
  })

  it('a genuinely pre-Wave-4A V2 save (no Staff Career fields at all, teamFinances without staffSalaryBudget) migrates V2 -> V3 producing valid, deterministic, idempotent Staff Career structure', () => {
    const world = createNewGame()
    const v2 = serializeGameWorldV2(world, savedAt)
    // Build an AUTHENTIC legacy V2 payload: strip every Staff Career key entirely (not merely
    // empty-array them) and strip staffSalaryBudget off every teamFinances row, matching exactly
    // what a real save written before Wave 4A would contain.
    const { organizationKnowledge, scoutingRuntime, marketRuntime, ...v1Shape } = v2.payload as unknown as Record<string, unknown>
    const staffCareerKeys = ['staffEmploymentByStaffId', 'staffCareerHistoryByStaffId', 'staffJobOpenings', 'staffJobCandidacies', 'staffInterviews', 'staffJobOffers', 'staffContracts', 'staffReputationProfilesByStaffId']
    const legacyV1Shape = Object.fromEntries(Object.entries(v1Shape).filter(([key]) => !staffCareerKeys.includes(key)))
    const legacyTeamFinances = (v2.payload.teamFinances as Record<string, unknown>[]).map((entry) => { const { staffSalaryBudget: _s, ...rest } = entry; return rest })
    const authenticLegacyV2 = { schemaVersion: 2 as const, savedAt, payload: { ...legacyV1Shape, teamFinances: legacyTeamFinances, organizationKnowledge, scoutingRuntime, marketRuntime } as never }

    for (const key of staffCareerKeys) expect(key in authenticLegacyV2.payload).toBe(false)

    const migrated = migrateGameWorldSaveV2ToV3(authenticLegacyV2)
    const loaded = deserializeGameWorldV3(migrated)

    // Deterministic backfill: every real Staff person now has canonical employment state.
    for (const staffId of Object.keys(loaded.staffPeopleById)) expect(loaded.staffEmploymentByStaffId[staffId as never]).toBeDefined()
    // Every employed Staff person has exactly one active contract.
    for (const [staffId, employment] of Object.entries(loaded.staffEmploymentByStaffId)) {
      if (employment.status !== 'employed') continue
      const activeContracts = Object.values(loaded.staffContractsById).filter((contract) => contract.staffId === staffId && contract.termination === undefined)
      expect(activeContracts).toHaveLength(1)
    }
    // Every real Staff person has a reputation profile.
    for (const staffId of Object.keys(loaded.staffPeopleById)) expect(loaded.staffReputationProfilesByStaffId[staffId as never]).toBeDefined()
    // staffSalaryBudget was backfilled deterministically for every team.
    for (const finance of Object.values(loaded.teamFinancesByTeamId)) expect(finance.staffSalaryBudget).toBeGreaterThan(0)

    // Deterministic: migrating the same authentic legacy V2 payload again produces the identical V3 payload.
    const migratedAgain = migrateGameWorldSaveV2ToV3(authenticLegacyV2)
    expect(migratedAgain).toEqual(migrated)

    // Idempotent: re-serializing the loaded (now-enriched) world and migrating it again does not change Staff Career state.
    const reserializedV2 = serializeGameWorldV2(loaded, savedAt)
    const remigrated = migrateGameWorldSaveV2ToV3(reserializedV2)
    const reloaded = deserializeGameWorldV3(remigrated)
    expect(reloaded.staffEmploymentByStaffId).toEqual(loaded.staffEmploymentByStaffId)
    expect(reloaded.staffContractsById).toEqual(loaded.staffContractsById)
    expect(reloaded.staffReputationProfilesByStaffId).toEqual(loaded.staffReputationProfilesByStaffId)
  })

  it('repeated enrichment via the V1 legacy path is idempotent for Staff Career state', () => {
    const world = createNewGame()
    const v1 = serializeGameWorldV1(world, savedAt)
    const migratedOnce = migrateGameWorldSaveV1ToV3(v1)
    const loadedOnce = deserializeGameWorldV3(migratedOnce)
    const migratedTwice = migrateGameWorldSaveV1ToV3(serializeGameWorldV1(loadedOnce, savedAt))
    const loadedTwice = deserializeGameWorldV3(migratedTwice)
    expect(loadedTwice.staffEmploymentByStaffId).toEqual(loadedOnce.staffEmploymentByStaffId)
    expect(loadedTwice.staffContractsById).toEqual(loadedOnce.staffContractsById)
    expect(loadedTwice.staffReputationProfilesByStaffId).toEqual(loadedOnce.staffReputationProfilesByStaffId)
  })

  // --- Wave 4A review Blocker 1: V1/V2 must never carry staffSalaryBudget ---

  it('V1 teamFinances rows never carry staffSalaryBudget', () => {
    const world = createNewGame()
    const v1 = serializeGameWorldV1(world, savedAt)
    for (const row of v1.payload.teamFinances as Record<string, unknown>[]) {
      expect('staffSalaryBudget' in row).toBe(false)
      expect(Object.keys(row).sort()).toEqual(['playerSalaryBudget', 'teamId'])
    }
  })

  it('V2 teamFinances rows never carry staffSalaryBudget (inherits V1 serialization)', () => {
    const world = createNewGame()
    const v2 = serializeGameWorldV2(world, savedAt)
    for (const row of v2.payload.teamFinances as Record<string, unknown>[]) {
      expect('staffSalaryBudget' in row).toBe(false)
    }
  })

  it('V3 teamFinances rows carry a valid staffSalaryBudget, and V3 round-trip preserves it exactly', () => {
    const world = createNewGame()
    const v3 = serializeGameWorldV3(world, savedAt)
    for (const row of v3.payload.teamFinances as Record<string, unknown>[]) {
      expect(typeof row.staffSalaryBudget).toBe('number')
      expect(row.staffSalaryBudget as number).toBeGreaterThan(0)
    }
    const loaded = deserializeGameWorldV3(v3)
    expect(loaded.teamFinancesByTeamId).toEqual(world.teamFinancesByTeamId)
  })

  // --- Wave 4A review Blocker 3: staffCareerRuntime is mandatory in V3 ---

  it('a valid V3 payload with staffCareerRuntime present deserializes successfully', () => {
    const { world } = worldWithHiredStaff()
    const saved = serializeGameWorldV3(world, savedAt)
    expect(saved.payload.staffCareerRuntime).toBeDefined()
    expect(() => deserializeGameWorldV3(saved)).not.toThrow()
  })

  it('a V3 payload missing staffCareerRuntime entirely is rejected', () => {
    const world = createNewGame()
    const saved = structuredClone(serializeGameWorldV3(world, savedAt))
    delete (saved.payload as unknown as Record<string, unknown>).staffCareerRuntime
    expect(() => deserializeGameWorldV3(saved)).toThrow()
  })

  it('a V3 payload with staffCareerRuntime = {} is rejected by the closed schema', () => {
    const world = createNewGame()
    const saved = structuredClone(serializeGameWorldV3(world, savedAt))
    ;(saved.payload as unknown as Record<string, unknown>).staffCareerRuntime = {}
    expect(() => deserializeGameWorldV3(saved)).toThrow()
  })

  it('a V3 payload with staffCareerRuntime missing a required sub-collection is rejected', () => {
    const { world } = worldWithHiredStaff()
    const saved = structuredClone(serializeGameWorldV3(world, savedAt))
    const runtime = (saved.payload as unknown as Record<string, unknown>).staffCareerRuntime as Record<string, unknown>
    delete runtime.staffContracts
    expect(() => deserializeGameWorldV3(saved)).toThrow()
  })

  it('V1/V2 without Staff Career still migrate to a V3 whose staffCareerRuntime is complete', () => {
    const world = createNewGame()
    const v1 = serializeGameWorldV1(world, savedAt)
    const migrated = migrateGameWorldSaveV1ToV3(v1)
    expect(migrated.payload.staffCareerRuntime).toBeDefined()
    const loaded = deserializeGameWorldV3(migrated)
    for (const staffId of Object.keys(loaded.staffPeopleById)) expect(loaded.staffEmploymentByStaffId[staffId as never]).toBeDefined()
  })
})

describe('Wave 5A — Staff Human State V3 save round-trip', () => {
  it('creates a human context/expectations/human state/event/reaction, saves, and reloads with exact relevant state preserved', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = staffPersonIdFromString(Object.values(base.teamStaffAssignmentsById).find((assignment) => assignment.teamId === teamId)!.staffPersonId)
    const advanced = advanceGameDay(base)
    expect(Object.keys(advanced.staffHumanContextsById).length).toBeGreaterThan(0)
    const granted = setTeamResponsibility(advanced, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: staffId })

    const saved = serializeGameWorldV3(granted, savedAt)
    const loaded = deserializeGameWorldV3(saved)
    expect(loaded.staffHumanContextsById).toEqual(granted.staffHumanContextsById)
    expect(loaded.staffHumanStatesByContextId).toEqual(granted.staffHumanStatesByContextId)
    expect(loaded.staffExpectationProfilesByContextId).toEqual(granted.staffExpectationProfilesByContextId)
    expect(loaded.staffReactionRecordsById).toEqual(granted.staffReactionRecordsById)
  })

  it('a legacy V3 save missing Human State fields loads validly with deterministic empty collections, no crash', () => {
    const world = createNewGame()
    const saved = serializeGameWorldV3(world, savedAt)
    const legacyPayload = { ...saved.payload } as Record<string, unknown>
    delete legacyPayload.staffHumanContexts
    delete legacyPayload.staffHumanStates
    delete legacyPayload.staffExpectationProfiles
    delete legacyPayload.staffReactionRecords
    const legacySave = { ...saved, payload: legacyPayload } as unknown as typeof saved
    const loaded = deserializeGameWorldV3(legacySave)
    expect(Object.keys(loaded.staffHumanContextsById)).toHaveLength(0)
    expect(Object.keys(loaded.staffHumanStatesByContextId)).toHaveLength(0)
    expect(Object.keys(loaded.staffExpectationProfilesByContextId)).toHaveLength(0)
    expect(Object.keys(loaded.staffReactionRecordsById)).toHaveLength(0)
    expect(saved.schemaVersion).toBe(3)
  })

  it('save/load/reprocess the same source event produces no duplicate ReactionRecord and no second state delta', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = staffPersonIdFromString(Object.values(base.teamStaffAssignmentsById).find((assignment) => assignment.teamId === teamId)!.staffPersonId)
    const advanced = advanceGameDay(base)
    const granted = setTeamResponsibility(advanced, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: staffId })
    const reactionCountBefore = Object.keys(granted.staffReactionRecordsById).length

    const loaded = deserializeGameWorldV3(serializeGameWorldV3(granted, savedAt))
    // Reprocessing the exact same (teamId, kind, mode, holder) transition again must be idempotent —
    // it is the same before/after Responsibility pair, so no new Human Event/reaction is emitted.
    const reprocessed = setTeamResponsibility(loaded, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: staffId })
    expect(Object.keys(reprocessed.staffReactionRecordsById)).toHaveLength(reactionCountBefore)
    expect(reprocessed.staffHumanStatesByContextId).toEqual(loaded.staffHumanStatesByContextId)
  })

  it('the expectation profile initial snapshot persists independently from current after adaptation', () => {
    const base = createNewGame()
    const advanced = advanceGameDay(base)
    const contextId = Object.keys(advanced.staffHumanContextsById)[0] as never
    const profile = advanced.staffExpectationProfilesByContextId[contextId]!
    const adapted = { ...profile, current: { ...profile.current, autonomy: Math.min(100, profile.current.autonomy + 5) } }
    const withAdapted = updateGameWorld(advanced, { staffExpectationProfiles: [...Object.values(advanced.staffExpectationProfilesByContextId).filter((item) => item.contextId !== contextId), adapted] })
    const loaded = deserializeGameWorldV3(serializeGameWorldV3(withAdapted, savedAt))
    expect(loaded.staffExpectationProfilesByContextId[contextId]!.initial).toEqual(profile.initial)
    expect(loaded.staffExpectationProfilesByContextId[contextId]!.current.autonomy).toBe(adapted.current.autonomy)
    expect(loaded.staffExpectationProfilesByContextId[contextId]!.initial).not.toEqual(loaded.staffExpectationProfilesByContextId[contextId]!.current)
  })
})
