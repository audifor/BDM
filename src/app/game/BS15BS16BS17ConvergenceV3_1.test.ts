import { beforeAll, describe, expect, it } from 'vitest'
import { equippedMedicalFixture } from './testSupport/EquippedMedicalFixture'
import { getFreeAgentMarketTerms, signFreeAgent } from '@/app/market/MarketService'
import { parseGameDate } from '@/domain/date'
import { createFacilityComponentConditionRecord } from '@/domain/facilities'
import { createScheduledTrainingSession } from '@/domain/training'
import { createCapitalContribution, createFinancingDrawdown, getOrganizationFinancialAuthorization, getEffectiveAuthorizedHeadroomMinorUnits, evaluateTeamGameplayFinancialDecision } from '@/domain/finance'
import { authorizeTeamSalaryForTest, financingDrawdownForTest } from '@/domain/finance/financeTestFixture'
import { updateGameWorld, withSingleWorldValidation, type GameWorld } from '@/domain/world'
import { advanceDayWithTrace } from '@/engine/calendar'
import { processClubFinanceForDate } from '@/engine/finance/ClubFinanceLifecycle'
import { equippedActs, executeEquippedRehabilitationForDay } from '@/engine/injury/EquippedRehabilitation'
import { materializeTalentCandidate } from '@/engine/world/TalentSupply'
import { executeScheduledTrainingSessions, scheduleTrainingSessionsBatch } from '@/engine/training/ScheduledTrainingEngine'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

const savedAt = '2026-10-10T00:00:00.000Z'
let fixture: ReturnType<typeof equippedMedicalFixture>
let base: GameWorld
let candidate: ReturnType<typeof materializeTalentCandidate>
const save = (world: GameWorld) => serializeGameWorldV4(world, savedAt)
// Project every Finance collection, including terminal facts and annual policy carried by profiles.
const finance = (world: GameWorld) => Object.fromEntries(Object.entries(world).filter(([key]) => /^(financial|organizationFinancial|fiscal|budget|forecast|revenue|expense|payables|receivables|treasury|operatingCost|debt|financing|capitalContribution|competitionDistribution|exchangeRates|economicObservations|financeDecision)/.test(key)))
const identities = (world: GameWorld) => ({ players: Object.keys(world.players), materializations: world.talentMaterializationsByCandidateKey, facilities: world.facilitiesById, components: world.facilityComponentsById })
beforeAll(() => {
  fixture = equippedMedicalFixture()
  const cohort = Object.values(fixture.scheduled.talentCohortsById).find(item => item.candidateCapacity > 0)!
  candidate = materializeTalentCandidate(fixture.scheduled, cohort.id, 1, 'SCOUTING_DISCOVERY')
  // The explicit fixture clinician crosses the existing neutral Staff save-compatibility boundary.
  base = scheduleTrainingSessionsBatch(deserializeGameWorldV4(save(candidate.world)), [createScheduledTrainingSession({ id: 'v3:training', teamId: fixture.team.id, date: fixture.date, startTime: '12:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })])
}, 30_000)

describe('Convergence V3.1 canonical cross-system composition', () => {
  it('A: bootstraps Talent and final Finance together, then accepts explicit physical source facts', () => {
    expect(Object.keys(base.talentCohortsById).length).toBeGreaterThan(0)
    expect(Object.keys(base.playerEnrollmentsById).length).toBeGreaterThan(0)
    expect(Object.keys(base.organizationFinancialProfilesById)).toHaveLength(48)
    expect(base.organizationFinancialProfilesById[fixture.team.organizationId]?.authorizationRenewalPolicy).toBeDefined()
    expect(Object.keys(base.financialAccountsById).length).toBeGreaterThan(0)
    expect(Object.keys(base.financialTransactionsById).length).toBeGreaterThan(0)
    expect(base.facilityComponentsById[fixture.component.id]).toEqual(fixture.component)
    expect(new Set(Object.values(base.players).map(player => player.id)).size).toBe(Object.keys(base.players).length)
    expect(base.players[candidate.player.id]?.personId).toBe(candidate.player.personId)
  })

  it('B: executes due Talent, Finance and physical lifecycles once through the shared Calendar', () => {
    const input = updateGameWorld(base, { currentDate: parseGameDate('2033-06-30'), scheduledTrainingSessionsById: {} })
    const result = advanceDayWithTrace(input)
    expect(result.failure).toBeUndefined()
    expect(result.world.currentDate).toBe('2033-07-01')
    for (const phaseId of ['ANNUAL_TALENT_SUPPLY', 'PLAYER_CAREER_END', 'COLLEGE_ELIGIBILITY_EXITS', 'CLUB_FINANCE_V2', 'TRAINING', 'MEDICAL_AND_ROSTER_ADVISORIES']) expect(result.phases.filter(phase => phase.phaseId === phaseId)).toHaveLength(1)
    expect(result.phases.find(phase => phase.phaseId === 'ANNUAL_TALENT_SUPPLY')?.worldChanged).toBe(true)
    expect(processClubFinanceForDate(result.world).world).toEqual(result.world)
    const record = Object.values(result.world.talentMaterializationsByCandidateKey).find(item => item.playerId === candidate.player.id)!
    expect(materializeTalentCandidate(result.world, record.cohortId, record.candidateIndex, 'SCOUTING_DISCOVERY').created).toBe(false)
    const ordinaryStart = performance.now()
    const ordinary = advanceDayWithTrace(base)
    const ordinaryMs = performance.now() - ordinaryStart
    expect(ordinary.failure).toBeUndefined()
    expect(ordinary.world.scheduledTrainingSessionsById['v3:training']?.status).toBe('completed')
    expect(equippedActs(ordinary.world).find(act => act.id === fixture.indication.id)?.status).toBe('COMPLETED')
    expect(executeScheduledTrainingSessions(ordinary.world)).toEqual(ordinary.world)
    expect(executeEquippedRehabilitationForDay(ordinary.world)).toEqual(ordinary.world)
    process.stdout.write(`[V3 performance] ordinary day ms=${ordinaryMs.toFixed(2)}\n`)
  }, 30_000)

  it('C: round-trips combined identity, full Finance, Facilities, C1 and Medical evidence twice', () => {
    const funded = financingDrawdownForTest(base, fixture.team.id, 1_000_000_000, 'v3:roundtrip')
    const world = advanceDayWithTrace(funded).world
    const started = performance.now()
    const restored = deserializeGameWorldV4(save(world))
    const roundtripMs = performance.now() - started
    expect(save(restored)).toEqual(save(world))
    expect(save(deserializeGameWorldV4(save(restored)))).toEqual(save(world))
    expect(finance(restored)).toEqual(finance(world))
    expect(identities(restored)).toEqual(identities(world))
    expect(restored.scheduledTrainingSessionsById).toEqual(world.scheduledTrainingSessionsById)
    expect(restored.injuriesById).toEqual(world.injuriesById)
    expect(Object.keys(restored.financingAgreementsById)).toHaveLength(1)
    expect(processClubFinanceForDate(restored).world).toEqual(restored)
    process.stdout.write(`[V3 performance] combined roundtrip ms=${roundtripMs.toFixed(2)}\n`)
  }, 30_000)

  it('D: signs an existing Talent PlayerId with one consumed bridge and contract-owned capacity', () => {
    let world = financingDrawdownForTest(base, fixture.team.id, 100_000_000_000, 'v3:contract')
    world = authorizeTeamSalaryForTest(world, fixture.team.id, { currencyCode: 'EUR', playerSalaryMinorUnits: 100_000_000_000, staffSalaryMinorUnits: 100_000_000_000 })
    const authorization = (snapshot: GameWorld) => getEffectiveAuthorizedHeadroomMinorUnits(getOrganizationFinancialAuthorization(snapshot, { organizationId: fixture.team.organizationId, currencyCode: 'EUR' }), 'PLAYER_SALARY')
    const before = authorization(world)
    const terms = getFreeAgentMarketTerms(world, candidate.player.id)
    const signed = signFreeAgent(world, fixture.team.id, candidate.player.id)
    expect(signed.players[candidate.player.id]).toEqual(world.players[candidate.player.id])
    expect(Object.keys(signed.players)).toEqual(Object.keys(world.players))
    expect(signed.talentMaterializationsByCandidateKey).toEqual(world.talentMaterializationsByCandidateKey)
    expect(signed.teams[fixture.team.id]?.rosterPlayerIds.filter(id => id === candidate.player.id)).toHaveLength(1)
    expect(before - authorization(signed)).toBe(terms.annualSalary * 100)
    const contract = Object.values(signed.contractsById).find(item => item.playerId === candidate.player.id)!
    expect(Object.values(signed.financialReservationsById).filter(item => item.sourceEntityId === contract.id)).toMatchObject([{ status: 'CONSUMED' }])
    expect(signed.financialTransactionsById).toEqual(world.financialTransactionsById)
    expect(signed.teamFinancesByTeamId).toEqual(world.teamFinancesByTeamId)
  }, 30_000)

  it('E: a physical Training block and a Finance signing block preserve each other’s authority', () => {
    const input = updateGameWorld(base, { currentDate: fixture.date, facilityComponentConditionRecords: Object.values(base.facilityComponentConditionRecordsById).map(record => createFacilityComponentConditionRecord({ ...record, serviceability: 'OUT_OF_SERVICE' })) })
    const source = save(input)
    const started = performance.now()
    const blocked = executeScheduledTrainingSessions(input)
    const operationMs = performance.now() - started
    expect(blocked.scheduledTrainingSessionsById['v3:training']?.physicalAttempt?.status).toBe('VERIFIED_UNAVAILABLE')
    expect(Object.values(blocked.developmentStimulusEventsById).filter(event => event.sourceId === 'v3:training')).toHaveLength(0)
    expect(finance(blocked)).toEqual(finance(input))
    const decision = evaluateTeamGameplayFinancialDecision(input, { teamId: fixture.team.id, action: 'PLAYER_SIGNING', legacyAnnualAmountMajorUnits: 1_000_000, sourceAuthority: 'V3_TEST', sourceEntityId: candidate.player.id })
    expect(decision.allowed).toBe(false)
    expect(() => signFreeAgent(input, fixture.team.id, candidate.player.id)).toThrow('Team cannot afford salary')
    expect(identities(input)).toEqual(identities(blocked))
    expect(save(input)).toEqual(source)
    process.stdout.write(`[V3 performance] blocked Training operation ms=${operationMs.toFixed(2)}\n`)
  })

  it('F: equipped Medical uses its confirmed C1 claim without creating a financial cost', () => {
    const input = updateGameWorld(base, { currentDate: fixture.date })
    const completed = executeEquippedRehabilitationForDay(input)
    const act = equippedActs(completed).find(item => item.id === fixture.indication.id)!
    expect(act.status).toBe('COMPLETED')
    expect(act.physicalAllocations?.some(allocation => allocation.consumer?.kind === 'MEDICAL')).toBe(true)
    expect(finance(completed)).toEqual(finance(input))
    expect(executeEquippedRehabilitationForDay(completed)).toBe(completed)
    expect(completed.injuriesById[fixture.injury.id]?.expectedReturnDate).toBe(input.injuriesById[fixture.injury.id]?.expectedReturnDate)
  })

  it('G: fiscal rollover renews once through Calendar while Talent and physical identities remain fixed', () => {
    const input = updateGameWorld(base, { currentDate: parseGameDate('2033-09-30'), scheduledTrainingSessionsById: {} })
    const result = advanceDayWithTrace(input)
    expect(result.failure).toBeUndefined()
    expect(result.phases.filter(phase => phase.phaseId === 'CLUB_FINANCE_V2')).toHaveLength(1)
    const organizationId = fixture.team.organizationId
    const periods = Object.values(result.world.fiscalPeriodsById).filter(period => period.organizationId === organizationId && period.startsOn === '2033-10-01')
    expect(periods).toHaveLength(1)
    const renewed = Object.values(result.world.financialBudgetsById).filter(budget => budget.organizationId === organizationId && budget.fiscalPeriodId === periods[0]!.id)
    expect(renewed).toHaveLength(1)
    expect(getOrganizationFinancialAuthorization(result.world, { organizationId, currencyCode: 'EUR' }).state).toBe('ACTIVE')
    expect(identities(result.world)).toEqual(identities(input))
    expect(processClubFinanceForDate(result.world).world).toEqual(result.world)
    const next = advanceDayWithTrace(result.world).world
    expect(next.fiscalPeriodsById).toEqual(result.world.fiscalPeriodsById)
    expect(next.financialBudgetsById).toEqual(result.world.financialBudgetsById)
  }, 30_000)

  it.each(['full', 'incremental'] as const)('retains strict final Finance source-link validation in %s batched publication', validationMode => {
    const source = save(base)
    const provenance = { kind: 'TEST_FIXTURE', id: 'v3:invalid-source-links' }
    const drawdown = createFinancingDrawdown({ id: 'v3:invalid-drawdown', agreementId: 'v3:missing-agreement', organizationId: fixture.team.organizationId, amount: { currencyCode: 'EUR', minorUnits: 100 }, drawnOn: base.currentDate, provenance })
    expect(() => withSingleWorldValidation(base, world => updateGameWorld(world, { financingDrawdowns: [drawdown] }), { validationMode })).toThrow(/unknown financing agreement/)
    const contribution = createCapitalContribution({ id: 'v3:invalid-capital', recipientOrganizationId: 'v3:missing-organization', contributor: { kind: 'EXTERNAL', label: 'Explicit fixture investor' }, currencyCode: 'EUR', amount: { currencyCode: 'EUR', minorUnits: 100 }, effectiveOn: base.currentDate, provenance })
    expect(() => withSingleWorldValidation(base, world => updateGameWorld(world, { capitalContributions: [contribution] }), { validationMode })).toThrow(/unknown recipient/)
    expect(save(base)).toEqual(source)
  })
})
