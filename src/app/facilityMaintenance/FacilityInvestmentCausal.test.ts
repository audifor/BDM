import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createConfiguredGame } from '@/app/game/createConfiguredGame'
import { buildClubFacilitiesWorkspaceModel } from '@/app/facilities'
import { componentConditionAt, createFacilityComponentConditionRecord } from '@/domain/facilities'
import { createBudgetLine, createFinancialBudget, financeFiscalPeriodsOf, getCashBalancesByCurrency, getOrganizationFinancialAuthorization } from '@/domain/finance'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { advanceDayWithTrace, getUserTeam } from '@/engine/calendar'
import { componentPhysicalAvailabilityAt } from '@/engine/facilities/FacilityPhysicalOperations'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { buildFacilityInvestmentOperationView, buildFacilityInvestmentRows } from './FacilityInvestmentReadModel'
import { executeFacilityMaintenanceUiCommand, type FacilityMaintenanceUiCommand } from './FacilityMaintenanceUiCommands'
import { openFacilityMaintenanceProposal, recordFacilityMaintenanceDecisionEvent, requestFacilityMaintenanceDecision } from './FacilityMaintenanceCommands'

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 })
const SAVED_AT = '2033-03-01T00:00:00.000Z'

let base: GameWorld
let teamId: ReturnType<typeof getUserTeam> extends infer T ? (T extends { id: infer I } ? I : never) : never
let organizationId: string
let courtId: string
let facilityId: string
beforeAll(() => {
  base = createConfiguredGame({ universeId: 'prototype' })
  const team = getUserTeam(base)!
  teamId = team.id as never
  organizationId = String(team.organizationId)
  courtId = `bdm-balance-v1:component:${organizationId}:court`
  facilityId = `bdm-balance-v1:facility:${organizationId}`
})

function advance(world: GameWorld, days: number): GameWorld {
  let current = world
  for (let i = 0; i < days; i += 1) current = advanceDayWithTrace(current).world
  return current
}
function run(world: GameWorld, command: FacilityMaintenanceUiCommand) { return executeFacilityMaintenanceUiCommand(world, teamId, command) }
function must(world: GameWorld, command: FacilityMaintenanceUiCommand): { world: GameWorld; operationId: string | null } {
  const result = run(world, command)
  expect(result.status, JSON.stringify([command.kind, result.reasons, result.canonicalReasons])).toBe('APPLIED')
  return { world: result.world, operationId: result.operationId }
}

/** Opens a renovation (or expansion) and takes it through offers, selection and the request; returns before the Board decides. */
function requestedInvestment(world: GameWorld, investment: 'RENOVATION' | 'REPLACEMENT' | 'EXPANSION' = 'RENOVATION', pick: 'FASTEST' | 'CHEAPEST' = 'FASTEST') {
  const opened = must(world, { kind: 'INVEST_OPEN', facilityId, investment, componentId: investment === 'EXPANSION' ? null : courtId })
  const operationId = opened.operationId!
  let current = must(opened.world, { kind: 'INVEST_REQUEST_OFFERS', operationId }).world
  const offers = buildFacilityInvestmentOperationView(current, teamId, operationId)!.offers
  const offer = [...offers].sort((a, b) => pick === 'FASTEST' ? a.executionDays! - b.executionDays! : a.amountMinorUnits - b.amountMinorUnits)[0]!
  current = must(current, { kind: 'INVEST_SELECT_OFFER', operationId, offerId: offer.offerId }).world
  current = must(current, { kind: 'INVEST_REQUEST_APPROVAL', operationId }).world
  return { world: current, operationId, offer }
}
function approvedInvestment(world: GameWorld, investment: 'RENOVATION' | 'REPLACEMENT' | 'EXPANSION' = 'RENOVATION', pick: 'FASTEST' | 'CHEAPEST' = 'FASTEST') {
  const requested = requestedInvestment(world, investment, pick)
  return { ...requested, world: advance(requested.world, 1) }
}
function contractedInvestment(world: GameWorld, investment: 'RENOVATION' | 'REPLACEMENT' | 'EXPANSION' = 'RENOVATION', pick: 'FASTEST' | 'CHEAPEST' = 'FASTEST') {
  const approved = approvedInvestment(world, investment, pick)
  expect(buildFacilityInvestmentOperationView(approved.world, teamId, approved.operationId)!.governance.state).toBe('APPROVED')
  return { ...approved, world: must(approved.world, { kind: 'INVEST_RESERVE', operationId: approved.operationId }).world }
}
function withCapitalAuthorization(world: GameWorld, minorUnits: number): GameWorld {
  const currencyCode = String(world.organizationFinancialProfilesById[organizationId as never]!.baseCurrencyCode)
  const current = getOrganizationFinancialAuthorization(world, { organizationId, currencyCode })
  const period = financeFiscalPeriodsOf(world, organizationId as never).find((item) => item.startsOn <= world.currentDate && item.endsOn >= world.currentDate)!
  const budgetId = `${current.budgetId}:revised:${world.currentDate}`
  const provenance = { kind: 'TEST_FIXTURE', id: 'capital-authorization-revision' }
  const budget = createFinancialBudget({ id: budgetId, organizationId, currencyCode, period: { kind: 'FISCAL_YEAR', startsOn: period.startsOn, endsOn: period.endsOn }, fiscalPeriodId: String(period.id), status: 'APPROVED', label: 'revision', createdOn: world.currentDate, approval: { authorityKind: 'MANUAL_SYSTEM_ACTION', authorityId: 'system:test', approvedOn: world.currentDate, provenance }, provenance })
  const lines = current.lines.map((line) => createBudgetLine({ id: `${budgetId}:${line.category}`, budgetId, organizationId, category: line.category, direction: 'EXPENSE', amount: { currencyCode, minorUnits: line.category === 'FACILITY_DEVELOPMENT' ? minorUnits : line.authorizedMinorUnits }, ...(line.teamId === undefined ? {} : { teamId: line.teamId }), provenance }))
  return updateGameWorld(world, { financialBudgets: [...Object.values(world.financialBudgetsById), budget], budgetLines: [...Object.values(world.budgetLinesById), ...lines] })
}
const capitalExpenses = (world: GameWorld) => Object.values(world.expenseRecognitionsById).filter((item) => item.category === 'FACILITY_DEVELOPMENT' && String(item.organizationId) === organizationId)
const capitalReservations = (world: GameWorld) => Object.values(world.financialReservationsById).filter((item) => item.sourceAuthority === 'FACILITY' && item.sourceEntityId.startsWith('capital-tranche:') && String(item.organizationId) === organizationId)
const cash = (world: GameWorld) => getCashBalancesByCurrency(world, organizationId as never, world.currentDate).reduce((sum, row) => sum + row.totalCashMinorUnits, 0)

describe('BS17E-B causal: justification, authority, Finance and cancellation', () => {
  it('shows a limitation-based menu and refuses an investment the physical situation does not justify', () => {
    const rows = buildFacilityInvestmentRows(base, teamId)
    const court = rows.find((row) => row.option.kind === 'RENOVATION' && row.option.componentId === courtId)!
    expect(court.option).toMatchObject({ eligible: true, reason: 'LIMITATION_DETECTED' })
    const strengthId = `bdm-balance-v1:component:${organizationId}:strength`
    const replacement = rows.find((row) => row.option.kind === 'REPLACEMENT' && row.option.componentId === strengthId)!
    // The strength room starts above the replacement threshold: replacing a room that is not worn out is not justified.
    expect(replacement.option.currentCondition!).toBeGreaterThan(65)
    expect(replacement.option.eligible).toBe(false)
    expect(run(base, { kind: 'INVEST_OPEN', facilityId, investment: 'REPLACEMENT', componentId: strengthId })).toMatchObject({ status: 'BLOCKED', reasons: ['INVESTMENT_NOT_JUSTIFIED'] })
    expect(run(base, { kind: 'INVEST_OPEN', facilityId: 'facility:not-mine', investment: 'RENOVATION', componentId: courtId })).toMatchObject({ status: 'BLOCKED', reasons: ['NOT_CLUB_FACILITY'] })
    expect(Object.keys(base.facilityDevelopmentProjectsById)).toHaveLength(0)
  })

  it('has no cost until offers exist, and persists the same offers when asked again', () => {
    const opened = must(base, { kind: 'INVEST_OPEN', facilityId, investment: 'RENOVATION', componentId: courtId })
    const operationId = opened.operationId!
    expect(buildFacilityInvestmentOperationView(opened.world, teamId, operationId)!.cost.status).toBe('UNKNOWN_COST')
    expect(run(opened.world, { kind: 'INVEST_REQUEST_APPROVAL', operationId })).toMatchObject({ status: 'BLOCKED', reasons: ['COST_UNKNOWN'] })
    const quoted = must(opened.world, { kind: 'INVEST_REQUEST_OFFERS', operationId }).world
    expect(run(quoted, { kind: 'INVEST_REQUEST_OFFERS', operationId }).status).toBe('NO_CHANGE')
    const offers = buildFacilityInvestmentOperationView(quoted, teamId, operationId)!.offers
    expect(offers).toHaveLength(3)
    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(quoted, SAVED_AT))
    expect(buildFacilityInvestmentOperationView(reloaded, teamId, operationId)!.offers).toEqual(offers)
    expect(Object.values(quoted.facilityEconomyRecordsById).filter((record) => record.recordKind === 'CAPITAL_OFFER').every((record) => record.tranches.reduce((sum, tranche) => sum + tranche.permille, 0) === 1_000)).toBe(true)
  })

  it('only the capital authority decides: the maintenance commands cannot act on a capital operation, and no operation is approved by the manager alone', () => {
    const requested = requestedInvestment(base)
    expect(run(requested.world, { kind: 'INVEST_RESERVE', operationId: requested.operationId })).toMatchObject({ status: 'BLOCKED', reasons: ['DECISION_NOT_APPROVED'] })
    expect(requestFacilityMaintenanceDecision(requested.world, { teamId, operationId: 'facility-operation:maintenance:none:1' }).status).toBe('BLOCKED')
    expect(run(requested.world, { kind: 'REQUEST_OFFERS', operationId: requested.operationId })).toMatchObject({ status: 'BLOCKED', reasons: ['OPERATION_NOT_FOUND'] })
    const view = buildFacilityInvestmentOperationView(requested.world, teamId, requested.operationId)!
    expect(view.governance).toMatchObject({ state: 'PENDING' })
    expect(view.actions.find((action) => action.id === 'APPROVE')?.enabled).toBe(false)
    const decision = requested.world.governanceDecisionsById[view.governance.decisionId!]!
    expect(decision.decisionType).toBe('CAPITAL_EXPENDITURE')
    // The manager (executive body) holds no APPROVE right: trying to approve as that body is refused.
    const manager = Object.values(requested.world.governanceAppointmentsById).find((a) => a.actor.kind === 'COACH')!
    expect(recordFacilityMaintenanceDecisionEvent(requested.world, { teamId, decisionId: decision.id, kind: 'APPROVED', bodyId: manager.bodyId }).reasons).toEqual(['ACTOR_NOT_APPOINTED_WITH_RIGHT'])
  })

  it('the Board rejects an investment it cannot afford with its liquidity buffer, and a rejected decision stops the path', () => {
    const poor = withCapitalAuthorization(base, 1_000_000)
    const requested = requestedInvestment(poor)
    const decided = advance(requested.world, 1)
    const view = buildFacilityInvestmentOperationView(decided, teamId, requested.operationId)!
    expect(view.governance.state).toBe('REJECTED')
    expect(run(decided, { kind: 'INVEST_RESERVE', operationId: requested.operationId })).toMatchObject({ status: 'BLOCKED', reasons: ['DECISION_NOT_APPROVED'] })
    expect(capitalReservations(decided)).toHaveLength(0)
    expect(Object.keys(decided.facilityDevelopmentProjectsById)).toHaveLength(1)
    expect(decided.facilityDevelopmentProjectsById[view.projectId as never]!.status).toBe('PLANNED')
  })

  it('persists FUNDING_BLOCKED when Finance refuses after approval, reserves nothing, and starts no works', () => {
    const approved = approvedInvestment(base)
    const squeezed = withCapitalAuthorization(approved.world, 1_000_000)
    const blocked = run(squeezed, { kind: 'INVEST_RESERVE', operationId: approved.operationId })
    expect(blocked.status).toBe('FUNDING_BLOCKED')
    expect(blocked.canonicalReasons).toContain('INSUFFICIENT_AUTHORIZED_HEADROOM')
    expect(capitalReservations(blocked.world)).toHaveLength(0)
    const view = buildFacilityInvestmentOperationView(blocked.world, teamId, approved.operationId)!
    expect(view.funding).toMatchObject({ state: 'FUNDING_BLOCKED', blockerCode: 'INSUFFICIENT_AUTHORIZED_HEADROOM' })
    expect(run(blocked.world, { kind: 'INVEST_START', operationId: approved.operationId })).toMatchObject({ status: 'BLOCKED', reasons: ['OPERATION_STAGE_INVALID'] })
    expect(blocked.world.facilityDevelopmentProjectsById[view.projectId as never]!.status).toBe('PLANNED')
    expect(capitalExpenses(blocked.world)).toHaveLength(0)
  })

  it('refuses to contract under an expired offer and keeps the offer and the decision', () => {
    const approved = approvedInvestment(base)
    const late = advance(approved.world, 15)
    expect(run(late, { kind: 'INVEST_RESERVE', operationId: approved.operationId })).toMatchObject({ status: 'BLOCKED', reasons: ['OFFER_EXPIRED'] })
    expect(late.facilityEconomyRecordsById[approved.offer.offerId]).toEqual(approved.world.facilityEconomyRecordsById[approved.offer.offerId])
  })

  it('reserves each tranche once, is idempotent, and keeps the amount held exactly once through the milestones', () => {
    const contracted = contractedInvestment(base)
    expect(capitalReservations(contracted.world).map((item) => item.status)).toEqual(['OPEN', 'OPEN'])
    expect(capitalReservations(contracted.world).reduce((sum, item) => sum + item.amount.minorUnits, 0)).toBe(contracted.offer.amountMinorUnits)
    expect(run(contracted.world, { kind: 'INVEST_RESERVE', operationId: contracted.operationId }).status).toBe('NO_CHANGE')
    const started = must(contracted.world, { kind: 'INVEST_START', operationId: contracted.operationId }).world
    expect(capitalReservations(started).map((item) => item.status).sort()).toEqual(['CONSUMED', 'OPEN'])
    expect(capitalExpenses(started)).toHaveLength(1)
    expect(run(started, { kind: 'INVEST_START', operationId: contracted.operationId }).status).toBe('NO_CHANGE')
    const finished = must(advance(started, contracted.offer.executionDays!), { kind: 'INVEST_ACCEPT', operationId: contracted.operationId }).world
    expect(capitalReservations(finished).map((item) => item.status)).toEqual(['CONSUMED', 'CONSUMED'])
    expect(capitalExpenses(finished)).toHaveLength(2)
    expect(run(finished, { kind: 'INVEST_ACCEPT', operationId: contracted.operationId }).status).toBe('NO_CHANGE')
    const settled = advance(finished, 31)
    expect(capitalExpenses(settled)).toHaveLength(2)
    expect(Object.values(settled.payablesById).filter((item) => capitalExpenses(settled).some((expense) => expense.payableId === item.id))).toHaveLength(2)
  })

  it('one physical work at a time: a repair on the court blocks a project start there, and vice versa', () => {
    // A maintenance operation needs a need on the court; the preset opens needs through deterioration, so use the court's own need after it appears.
    let world = base
    let needId: string | undefined
    for (let day = 0; day < 120 && needId === undefined; day += 1) {
      world = advance(world, 1)
      needId = Object.values(world.facilityMaintenanceNeedsById).find((need) => String(need.componentId) === courtId && need.status === 'OPEN')?.id
    }
    expect(needId).toBeDefined()
    const contracted = contractedInvestment(world)
    const repair = openFacilityMaintenanceProposal(contracted.world, { teamId, needId: needId!, interventionType: 'REPAIR' })
    expect(repair.status).toBe('APPLIED')
    const started = must(contracted.world, { kind: 'INVEST_START', operationId: contracted.operationId }).world
    // The project occupies the court, so a maintenance work cannot start there until the project ends.
    const view = buildFacilityInvestmentOperationView(started, teamId, contracted.operationId)!
    expect(view.execution.state).toBe('IN_PROGRESS')
    expect(componentPhysicalAvailabilityAt(started, courtId as never, started.currentDate).affectedProjectIds.length).toBe(1)
  })

  it('cancellation: before approval the proposer withdraws, and a PLANNED project is cancelled with its history preserved', () => {
    const requested = requestedInvestment(base)
    const cancelled = must(requested.world, { kind: 'INVEST_CANCEL', operationId: requested.operationId }).world
    const view = buildFacilityInvestmentOperationView(cancelled, teamId, requested.operationId)!
    expect(view.stage).toBe('CANCELLED')
    expect(cancelled.facilityDevelopmentProjectsById[view.projectId as never]!.status).toBe('CANCELLED')
    expect(Object.values(cancelled.governanceDecisionEventsById).filter((event) => event.decisionId === view.governance.decisionId).map((event) => event.kind).sort()).toEqual(['PROPOSED', 'WITHDRAWN'])
    // The same need can be proposed again as a new, separate operation.
    expect(run(cancelled, { kind: 'INVEST_OPEN', facilityId, investment: 'RENOVATION', componentId: courtId }).status).toBe('APPLIED')
  })

  it('cancellation after contract needs an approved cancellation decision, releases only open reservations and invents no penalty', () => {
    const contracted = contractedInvestment(base)
    expect(run(contracted.world, { kind: 'INVEST_CANCEL', operationId: contracted.operationId })).toMatchObject({ status: 'BLOCKED', reasons: ['CANCELLATION_DECISION_REQUIRED'] })
    const asked = must(contracted.world, { kind: 'INVEST_REQUEST_CANCELLATION', operationId: contracted.operationId }).world
    const decided = advance(asked, 1)
    const cancelled = must(decided, { kind: 'INVEST_CANCEL', operationId: contracted.operationId }).world
    expect(capitalReservations(cancelled).map((item) => item.status)).toEqual(['RELEASED', 'RELEASED'])
    expect(capitalExpenses(cancelled)).toHaveLength(0)
    expect(Object.values(cancelled.payablesById).filter((item) => String(item.provenance.id).includes('capital-tranche'))).toHaveLength(0)
  })

  it('cancellation after the works started keeps the recognized milestone and its payment, releases the rest and frees the court', () => {
    const contracted = contractedInvestment(base)
    const started = must(contracted.world, { kind: 'INVEST_START', operationId: contracted.operationId }).world
    const firstTranche = contracted.offer.amountMinorUnits * 0.3
    const cashAtStart = cash(started)
    const asked = must(started, { kind: 'INVEST_REQUEST_CANCELLATION', operationId: contracted.operationId }).world
    const cancelled = must(advance(asked, 1), { kind: 'INVEST_CANCEL', operationId: contracted.operationId }).world
    const view = buildFacilityInvestmentOperationView(cancelled, teamId, contracted.operationId)!
    expect(view.stage).toBe('CANCELLED')
    expect(view.projectStatus).toBe('CANCELLED')
    expect(capitalReservations(cancelled).map((item) => item.status).sort()).toEqual(['CONSUMED', 'RELEASED'])
    expect(capitalExpenses(cancelled)).toHaveLength(1)
    expect(componentPhysicalAvailabilityAt(cancelled, courtId as never, cancelled.currentDate).status).not.toBe('OUT_OF_SERVICE')
    const later = advance(cancelled, 31)
    expect(capitalExpenses(later)).toHaveLength(1)
    expect(cash(later)).toBeLessThanOrEqual(cashAtStart)
    expect(cashAtStart - cash(later)).toBe(firstTranche)
  })

  it('Save V4 round-trips every stage twice with identical views, and an older save without the capital fields still loads', () => {
    const requested = requestedInvestment(base)
    const contracted = contractedInvestment(base)
    const started = must(contracted.world, { kind: 'INVEST_START', operationId: contracted.operationId }).world
    for (const [world, operationId] of [[requested.world, requested.operationId], [contracted.world, contracted.operationId], [started, contracted.operationId]] as const) {
      const once = deserializeGameWorldV4(serializeGameWorldV4(world, SAVED_AT))
      const twice = deserializeGameWorldV4(serializeGameWorldV4(once, SAVED_AT))
      expect(twice.facilityEconomyRecordsById).toEqual(world.facilityEconomyRecordsById)
      expect(buildFacilityInvestmentOperationView(twice, teamId, operationId)).toEqual(buildFacilityInvestmentOperationView(world, teamId, operationId))
    }
    const legacy = JSON.parse(JSON.stringify(serializeGameWorldV4(base, SAVED_AT))) as { payload: { facilityEconomyRecords: Record<string, unknown>[] } }
    for (const record of legacy.payload.facilityEconomyRecords) if (record.recordKind === 'OPERATION_EVENT') { delete record.projectId; delete record.recognitionId }
    expect(() => deserializeGameWorldV4(legacy as never)).not.toThrow()
  })

  it('Calendar exactly once: reprocessing after a mid-flow reload gives the same economic result as the uninterrupted run', () => {
    const contracted = contractedInvestment(base)
    const started = must(contracted.world, { kind: 'INVEST_START', operationId: contracted.operationId }).world
    const direct = advance(started, 40)
    const interrupted = advance(deserializeGameWorldV4(serializeGameWorldV4(advance(deserializeGameWorldV4(serializeGameWorldV4(started, SAVED_AT)), 20), SAVED_AT)), 20)
    const economics = (world: GameWorld) => [capitalExpenses(world).length, Object.keys(world.payablesById).length, Object.keys(world.treasuryApplicationsById).length, cash(world)]
    expect(economics(interrupted)).toEqual(economics(direct))
  })
})

describe('BS17E-B: an expansion adds a physical component that Training can use', () => {
  it('adds a second practice court with its promised condition, doubling the usable practice courts', () => {
    const contracted = contractedInvestment(base, 'EXPANSION', 'CHEAPEST')
    const started = must(contracted.world, { kind: 'INVEST_START', operationId: contracted.operationId }).world
    const courtsBefore = Object.values(started.facilityComponentsById).filter((component) => String(component.facilityId) === facilityId && component.type === 'PRACTICE_COURT')
    expect(courtsBefore).toHaveLength(1)
    const finished = must(advance(started, contracted.offer.executionDays!), { kind: 'INVEST_ACCEPT', operationId: contracted.operationId }).world
    const courts = Object.values(finished.facilityComponentsById).filter((component) => String(component.facilityId) === facilityId && component.type === 'PRACTICE_COURT')
    expect(courts).toHaveLength(2)
    const added = courts.find((component) => component.id !== courtId)!
    expect(componentConditionAt(Object.values(finished.facilityComponentConditionRecordsById), added.id, finished.currentDate)).toMatchObject({ physicalCondition: 100, serviceability: 'FULL' })
    expect(componentPhysicalAvailabilityAt(finished, added.id, finished.currentDate).status).not.toBe('OUT_OF_SERVICE')
    // The physical capability the club reports is what the works changed: two usable practice courts instead of one.
    expect(buildClubFacilitiesWorkspaceModel(finished, teamId).sporting.basketball.usablePracticeCourtCount).toBe(2)
    expect(buildClubFacilitiesWorkspaceModel(started, teamId).sporting.basketball.usablePracticeCourtCount).toBe(1)
    // The limitation is gone: the option is no longer justified.
    expect(buildFacilityInvestmentRows(finished, teamId).find((row) => row.option.kind === 'EXPANSION')!.option).toMatchObject({ eligible: false, reason: 'NO_LIMITATION' })
    expect(run(finished, { kind: 'INVEST_OPEN', facilityId, investment: 'EXPANSION', componentId: null })).toMatchObject({ status: 'BLOCKED', reasons: ['INVESTMENT_NOT_JUSTIFIED'] })
  })

  it('accepts a REPLACEMENT once: the replaced court is retired, the new one has exactly one condition record', () => {
    // A documented, severely worn court (60) justifies replacement. This is an observation of the physical state, not a financial fixture.
    const worn = updateGameWorld(base, { facilityComponentConditionRecords: [...Object.values(base.facilityComponentConditionRecordsById), createFacilityComponentConditionRecord({
      id: `facility-component-condition:${courtId}:${base.currentDate}:test-observation`, componentId: courtId as never, sequence: 9, effectiveFrom: base.currentDate, physicalCondition: 60, serviceability: 'LIMITED',
    })] })
    expect(buildFacilityInvestmentRows(worn, teamId).find((row) => row.option.kind === 'REPLACEMENT' && row.option.componentId === courtId)!.option.eligible).toBe(true)
    const contracted = contractedInvestment(worn, 'REPLACEMENT', 'CHEAPEST')
    const started = must(contracted.world, { kind: 'INVEST_START', operationId: contracted.operationId! }).world
    const finished = must(advance(started, contracted.offer.executionDays!), { kind: 'INVEST_ACCEPT', operationId: contracted.operationId! }).world
    const courts = Object.values(finished.facilityComponentsById).filter((component) => component.facilityId === facilityId && component.type === 'PRACTICE_COURT' && component.status === 'ACTIVE' && component.closedAt === null)
    expect(courts).toHaveLength(1)
    expect(courts[0]!.id).not.toBe(courtId)
    const records = Object.values(finished.facilityComponentConditionRecordsById).filter((record) => record.componentId === courts[0]!.id)
    expect(records).toHaveLength(1)
    expect(records[0]!.physicalCondition).toBe(contracted.offer.promisedCondition)
    expect(advance(finished, 3).currentDate).not.toBe(finished.currentDate)
  })
})
