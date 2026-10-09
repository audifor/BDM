import { beforeAll, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { withShortGameFormat } from '@/app/game/testFixtures'
import { advanceGameDayWithResult, advanceGameDayWithResultAsync } from '@/app/game/advanceGameDay'
import { createInlineMatchRunner } from '@/app/matchNext/MatchSimulationRunner'
import { parseGameDate } from '@/domain/date'
import { createFacility, createFacilityComponent, createFacilityComponentConditionRecord, createFacilityUsageRight, createPlace } from '@/domain/facilities'
import { createFinancialReservation, createOperatingCostSource, createRevenueSource, ensureCanonicalFinanceFoundation, materializeOrganizationOpeningEconomicState, provisionOrganizationFinanceFoundation, getCashBalancesByCurrency } from '@/domain/finance'
import { createScheduledTrainingSession } from '@/domain/training'
import { getWorldValidationReport, updateGameWorld, updateScheduledTrainingSessionRecords, withSingleWorldValidation, type GameWorld } from '@/domain/world'
import { advanceDayWithTrace, getUserTeam } from '@/engine/calendar'
import { endPlayerCareer } from '@/engine/career/PlayerCareerLifecycle'
import { processClubFinanceForDate } from '@/engine/finance/ClubFinanceLifecycle'
import { executeScheduledTrainingSessions, scheduleTrainingSessionsBatch } from '@/engine/training/ScheduledTrainingEngine'
import { materializeTalentCandidate } from '@/engine/world/TalentSupply'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'

const savedAt = '2033-07-01T00:00:00.000Z'
const date = parseGameDate('2033-07-01')
let base: GameWorld
let materializedPlayerId: string
let payrollContractId: string
beforeAll(() => {
  let world = deserializeGameWorldV4(serializeGameWorldV4(createNewGame(), savedAt))
  const cohort = Object.values(world.talentCohortsById).find(item => item.candidateCapacity > 1)!
  const materialized = materializeTalentCandidate(world, cohort.id, 1, 'SCOUTING_DISCOVERY')
  world = materialized.world
  materializedPlayerId = materialized.player.id
  const retired = materializeTalentCandidate(world, cohort.id, 2, 'SCOUTING_DISCOVERY')
  world = endPlayerCareer(retired.world, retired.player.id)
  const team = getUserTeam(world)!
  const place = createPlace({ id: 'integration:place', kind: 'CAMPUS', name: 'Controlled test campus' })
  const facility = createFacility({ id: 'integration:facility', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Controlled test center' })
  const component = createFacilityComponent({ id: 'integration:court', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE', specification: { kind: 'COURT', isFullCourt: true, isIndoor: true } })
  world = updateGameWorld(world, { currentDate: parseGameDate('2033-06-30'), places: [...Object.values(world.placesById), place], facilities: [facility], facilityComponents: [component],
    facilityComponentConditionRecords: [createFacilityComponentConditionRecord({ id: 'integration:condition', componentId: component.id, effectiveFrom: '2033-06-30', physicalCondition: 80, serviceability: 'FULL' })],
    facilityUsageRights: [createFacilityUsageRight({ id: 'integration:right', facilityId: facility.id, teamId: team.id, purpose: 'OTHER', exclusivity: 'SHARED', validFrom: '2033-06-30' })],
  })
  // One explicit controlled contract occurrence is due alongside the Talent/physical checkpoint.
  const contract = Object.values(world.contractsById).find(item => item.teamId === team.id)!
  payrollContractId = contract.id
  world = updateGameWorld(world, { contracts: Object.values(world.contractsById).map(item => item.id === contract.id ? {
    ...item, term: { startsOn: date, expiresOn: parseGameDate('2034-07-01') },
    compensation: { annualSalary: 100, years: [{ cashSalary: 100, guaranteedAmount: 100, capTreatment: { policy: 'NOT_APPLICABLE' as const } }] },
  } : item) })
  world = ensureCanonicalFinanceFoundation(provisionOrganizationFinanceFoundation(world, team.organizationId, { currencyCode: 'EUR', asOfDate: world.currentDate }))
  const funded = materializeOrganizationOpeningEconomicState(world, { sourceAuthority: 'WORLD_DB', sourceEntityId: 'integration:opening', organizationId: team.organizationId, currencyCode: 'EUR', effectiveOn: world.currentDate, cashMinorUnits: 1_000_000, counterpartKind: 'RETAINED_NET_ASSETS', counterpartId: null })
  expect(funded.status).toBe('MATERIALIZED')
  world = funded.world
  world = updateGameWorld(world, {
    revenueSources: [createRevenueSource({ id: 'integration:revenue', organizationId: team.organizationId, teamId: team.id, category: 'COMPETITION', currencyCode: 'EUR', amount: { currencyCode: 'EUR', minorUnits: 50_000 }, startsOn: date, endsOn: date, sourceAuthority: 'MANUAL_SYSTEM_ACTION', generationPolicy: 'ONE_OFF', dueDatePolicy: 'ON_RECOGNITION', provenance: { kind: 'TEST_AUTHORIZED_SOURCE', id: 'integration:revenue' } })],
    operatingCostSources: [createOperatingCostSource({ id: 'integration:cost', organizationId: team.organizationId, teamId: team.id, category: 'MATCH_OPERATIONS', currencyCode: 'EUR', amount: { currencyCode: 'EUR', minorUnits: 10_000 }, startsOn: date, endsOn: date, sourceAuthority: 'MANUAL_SYSTEM_ACTION', generationPolicy: 'ONE_OFF', dueDatePolicy: 'ON_RECOGNITION', provenance: { kind: 'TEST_AUTHORIZED_SOURCE', id: 'integration:cost' } })],
    financialReservations: [createFinancialReservation({ id: 'integration:reservation', organizationId: team.organizationId, currency: 'EUR', amount: { currencyCode: 'EUR', minorUnits: 100 }, sourceAuthority: 'FACILITY', sourceEntityId: facility.id, createdOn: world.currentDate, status: 'OPEN' })],
  })
  base = scheduleTrainingSessionsBatch(withShortGameFormat(world, 0.1), [
    createScheduledTrainingSession({ id: 'integration:physical', teamId: team.id, date, startTime: '10:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' }),
    createScheduledTrainingSession({ id: 'integration:independent', teamId: team.id, date, startTime: '12:00', durationMinutes: 60, scope: 'team', definitionId: 'teamCohesion', intensity: 'normal' }),
  ])
}, 120_000)

function outOfService(world: GameWorld): GameWorld {
  return updateGameWorld(world, { facilityComponentConditionRecords: Object.values(world.facilityComponentConditionRecordsById).map(record => createFacilityComponentConditionRecord({ ...record, serviceability: 'OUT_OF_SERVICE' })) })
}
function restore(world: GameWorld): GameWorld {
  const records = Object.values(world.facilityComponentConditionRecordsById)
  const latest = [...records].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || (a.sequence ?? 0) - (b.sequence ?? 0)).at(-1)!
  return updateGameWorld(world, { facilityComponentConditionRecords: [...records, createFacilityComponentConditionRecord({ ...latest, id: 'integration:restored', effectiveFrom: world.currentDate, effectiveTo: null, serviceability: 'FULL', sequence: (latest.sequence ?? 0) + 1 })] })
}
function save(world: GameWorld) { return serializeGameWorldV4(world, savedAt) }
const financialKeys = ['financialTransactionsById', 'financialCommitmentsById', 'expenseRecognitionsById', 'revenueRecognitionsById', 'payablesById', 'receivablesById', 'treasuryApplicationsById', 'financialReservationsById'] as const

describe('Controlled BS15/BS16/BS17 production convergence', () => {
  it.each(['full', 'incremental'] as const)('rejects malformed physical attempt facts through batched %s publication without mutating input', validationMode => {
    const original = save(base)
    const session = base.scheduledTrainingSessionsById['integration:physical']!
    expect(() => withSingleWorldValidation(base, world => updateGameWorld(world, {
      scheduledTrainingSessionsById: updateScheduledTrainingSessionRecords(world.scheduledTrainingSessionsById, [{ ...session,
        physicalAttempt: { policyVersion: 'BS17D-P0-v1', operationId: 'threePoint', attemptedOn: parseGameDate('2034-07-01'), status: 'VERIFIED_UNAVAILABLE', resources: [] },
      }]),
    }), { validationMode })).toThrow('Invalid Training physical attempt')
    expect(save(base)).toEqual(original)
  })

  it('runs Talent supply, Finance and scoped Training on the same day; restoration retries only unexecuted work', () => {
    const blockedInput = outOfService(base)
    const source = save(blockedInput)
    const advance = (world: GameWorld) => withSingleWorldValidation(world, input => {
      const result = advanceDayWithTrace(input)
      expect(result.status).not.toBe('FAILED')
      expect(result.phases.filter(phase => phase.phaseId === 'CLUB_FINANCE_V2')).toHaveLength(1)
      expect(result.phases.find(phase => phase.phaseId === 'ANNUAL_TALENT_SUPPLY')?.worldChanged).toBe(true)
      return result.world
    }, { validationMode: 'incremental' })
    const available = advance(base), blocked = advance(blockedInput)
    expect(save(blockedInput)).toEqual(source)
    expect(blocked.currentDate).toBe(date)
    expect(blocked.scheduledTrainingSessionsById['integration:physical']).toMatchObject({ status: 'scheduled', physicalAttempt: { status: 'VERIFIED_UNAVAILABLE' } })
    expect(blocked.scheduledTrainingSessionsById['integration:independent']).toMatchObject({ status: 'completed', physicalAttempt: { status: 'NOT_REQUIRED' } })
    expect(available.scheduledTrainingSessionsById['integration:physical']).toMatchObject({ status: 'completed', physicalAttempt: { status: 'VERIFIED_AVAILABLE' } })
    expect(Object.values(blocked.developmentStimulusEventsById).filter(event => event.sourceId === 'integration:physical')).toHaveLength(0)
    expect(Object.values(available.developmentStimulusEventsById).filter(event => event.sourceId === 'integration:physical').length).toBeGreaterThan(0)
    for (const key of financialKeys) expect(blocked[key], key).toEqual(available[key])
    expect(Object.keys(blocked.revenueRecognitionsById)).toHaveLength(1)
    expect(Object.keys(blocked.treasuryApplicationsById)).toHaveLength(2)
    expect(Object.values(blocked.expenseRecognitionsById).filter(fact => fact.category === 'CONTRACT_PLAYER_SALARY_DUE' && String(fact.provenance.id).includes(payrollContractId))).toHaveLength(1)
    const team = getUserTeam(blocked)!
    expect(getCashBalancesByCurrency(blocked, team.organizationId, date).find(row => String(row.currencyCode) === 'EUR')?.totalCashMinorUnits).toBe(980_000)
    expect(processClubFinanceForDate(blocked).world).toEqual(blocked)
    expect(Object.keys(blocked.players)).toEqual(Object.keys(available.players))
    expect(blocked.talentCohortsById).toEqual(available.talentCohortsById)
    expect(blocked.players[materializedPlayerId as never]?.id).toBe(materializedPlayerId)
    expect(getWorldValidationReport(blocked)?.dirtyCollections).toContain('scheduledTrainingSessionsById')
    expect(getWorldValidationReport(blocked)?.blocks['27:validateScheduledTrainingHistory']?.reused).toBe(false)
    const restored = executeScheduledTrainingSessions(restore(blocked))
    expect(restored.scheduledTrainingSessionsById['integration:physical']).toMatchObject({ status: 'completed', physicalAttempt: { status: 'VERIFIED_AVAILABLE' } })
    expect(restored.scheduledTrainingSessionsById['integration:independent']).toEqual(blocked.scheduledTrainingSessionsById['integration:independent'])
    for (const key of financialKeys) expect(restored[key], key).toEqual(blocked[key])
    expect(executeScheduledTrainingSessions(restored)).toEqual(restored)
  }, 120_000)

  it('round-trips the combined V4 twice with historical Talent, NCAA, Finance and physical attempts', () => {
    const day = advanceDayWithTrace(outOfService(base))
    expect(day.status).not.toBe('FAILED')
    const world = day.world
    expect(Object.keys(world.talentMaterializationsByCandidateKey).length).toBeGreaterThan(0)
    expect(Object.keys(world.playerEnrollmentsById).length).toBeGreaterThan(0)
    expect(Object.values(world.players).some(player => player.careerEnd !== undefined)).toBe(true)
    const first = deserializeGameWorldV4(save(world)), second = deserializeGameWorldV4(save(first))
    expect(save(first)).toEqual(save(world))
    expect(save(second)).toEqual(save(world))
    for (const key of [...financialKeys, 'facilityUsageRightsById', 'facilityComponentConditionRecordsById', 'talentMaterializationsByCandidateKey', 'playerEnrollmentsById', 'scheduledTrainingSessionsById'] as const) expect(second[key], key).toEqual(world[key])
    const record = Object.values(world.talentMaterializationsByCandidateKey).find(item => String(item.playerId) === materializedPlayerId)!
    expect(materializeTalentCandidate(second, record.cohortId, record.candidateIndex, 'SCOUTING_DISCOVERY').created).toBe(false)
    expect(processClubFinanceForDate(second).world).toEqual(second)
    // Legacy V1 carries the optional attempt inside its Training record; V4 owns the complete world.
    const legacy = deserializeGameWorldV1(serializeGameWorldV1(world, savedAt))
    expect(legacy.scheduledTrainingSessionsById['integration:physical']?.physicalAttempt).toEqual(world.scheduledTrainingSessionsById['integration:physical']?.physicalAttempt)
    expect(legacy.scheduledTrainingSessionsById['integration:physical']?.physicalAttempt?.status).toBe('VERIFIED_UNAVAILABLE')
  }, 120_000)

  it('publishes an identical immutable world through sync and async commands with the physical gate', async () => {
    const input = outOfService(updateGameWorld(base, { currentDate: parseGameDate('2032-10-01'),
      scheduledTrainingSessionsById: Object.fromEntries(Object.values(base.scheduledTrainingSessionsById).map(session => [session.id, { ...session, date: parseGameDate('2032-10-02') }])),
      facilityComponentConditionRecords: Object.values(base.facilityComponentConditionRecordsById).map(record => createFacilityComponentConditionRecord({ ...record, effectiveFrom: '2032-10-01', effectiveTo: null })),
      facilityUsageRights: Object.values(base.facilityUsageRightsById).map(right => createFacilityUsageRight({ ...right, validFrom: '2032-10-01' })),
    }))
    const source = save(input)
    const sync = advanceGameDayWithResult(input, () => 151617, ['userGame'], { forceDetail: 'BACKGROUND' })
    const runner = createInlineMatchRunner()
    try {
      const asyncResult = await advanceGameDayWithResultAsync(input, runner, () => 151617, ['userGame'], { forceDetail: 'BACKGROUND' })
      expect(sync.failure).toBeUndefined()
      expect(asyncResult.failure).toBeUndefined()
      expect(save(asyncResult.world)).toEqual(save(sync.world))
      expect(save(input)).toEqual(source)
      expect(sync.phases.filter(phase => phase.phaseId === 'DAY_PUBLICATION')).toHaveLength(1)
      expect(new Set(sync.phases.map(phase => phase.phaseId)).size).toBe(sync.phases.length)
      expect(sync.world.scheduledTrainingSessionsById['integration:physical']).toMatchObject({ status: 'scheduled', physicalAttempt: { status: 'VERIFIED_UNAVAILABLE' } })
    } finally { runner.dispose() }
  }, 120_000)
})
