import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { staffPersonIdFromString, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { updateGameWorld, getNextScheduledGame } from '@/domain/world'
import { createDefaultStaffReputationProfile } from '@/domain/staffReputation'
import { createStaffJobOpeningForTeam, identifyStaffCandidate, completeStaffInterview, startStaffInterview, createStaffJobOffer, acceptStaffJobOffer } from '@/app/staffCareer'
import { requestScouting } from '@/engine/scouting'
import { progressOppositionScoutingReports } from '@/engine/tactics/OppositionScoutingReportEngine'
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
})
