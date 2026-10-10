import { createNewGame } from '@/app/game'
import { addDays, type GameDate } from '@/domain/date'
import {
  createFacility,
  createFacilityComponent,
  createFacilityComponentConditionRecord,
  createFacilityInspection,
  createFacilityMaintenanceNeed,
  createFacilityOwnershipInterest,
  createFacilityUsageRight,
  createPlace,
  type FacilityInspection,
} from '@/domain/facilities'
import { getUserTeam } from '@/engine/calendar'
import {
  createFacilityMaintenanceOffer,
  createFacilityProvider,
  type FacilityMaintenanceOffer,
  type FacilityProvider,
} from '@/domain/facilityEconomy'
import {
  createBudgetLine,
  createFinancialBudget,
    financeFiscalPeriodsOf,
  getOrganizationFinancialAuthorization,
} from '@/domain/finance'
import { financingDrawdownForTest } from '@/domain/finance/financeTestFixture'
import { updateGameWorld, type GameWorld } from '@/domain/world'

/**
 * BS17E-A fixture — VALID INPUTS ONLY.
 *
 * The shipped universes contain no Governance institution, no Facility, no FACILITY budget line, no cost
 * catalog and no provider. Each of those is therefore stated here as explicit INPUT state, built through the
 * canonical creators, exactly like the MX0.6 (Facilities) and MX0.7 (Governance) fixtures before it:
 *
 *   - a Governance graph whose FACILITIES rights are stated per body (the fixture only says which bodies the
 *     actors are appointed to and which rights those bodies hold);
 *   - an APPROVED budget fact with an explicit FACILITY expense line (the fixture never edits a balance);
 *   - canonical liquidity from a declared financing drawdown (a legitimate Finance source);
 *   - a DOCUMENTED provider and an ACCREDITED_OFFER with explicit validity and payment terms.
 *
 * It never inserts a grant implicitly, never writes a Finance collection directly except through the
 * budget/line creators used by the existing Finance fixtures, and never completes work by mutation.
 */
export const FM_INSTITUTION = 'institution:fm'
export const FM_OWNER = 'body:fm:owner'
export const FM_EXECUTIVE = 'body:fm:executive'
export const FM_BOARD = 'body:fm:board'
export const FM_OPERATIONS = 'body:fm:operations'

export interface FacilityMaintenanceBase {
  readonly world: GameWorld
  readonly teamId: ReturnType<typeof getUserTeam> extends infer T ? (T extends { id: infer I } ? I : never) : never
  readonly organizationId: string
  readonly trainingCenterId: string
  readonly physioComponentId: string
  readonly asOf: GameDate
}

export interface FacilityMaintenanceScenario {
  readonly base: FacilityMaintenanceBase
  readonly world: GameWorld
  readonly teamId: FacilityMaintenanceBase['teamId']
  readonly organizationId: string
  readonly currencyCode: string
  readonly needId: string
  readonly facilityId: string
  readonly offerId: string
  readonly providerId: string
  readonly asOf: GameDate
  readonly offer: FacilityMaintenanceOffer
  readonly provider: FacilityProvider
  readonly secondNeedId: string
  readonly secondOffer: FacilityMaintenanceOffer
}

export interface FacilityMaintenanceScenarioOptions {
  readonly facilityBudgetMinorUnits?: number
  readonly drawdownMinorUnits?: number
  readonly offerAmountMinorUnits?: number
  readonly offerValidDays?: number
  readonly paymentDueDays?: number | null
  readonly executionDays?: number | null
  readonly withBoardApproval?: boolean
  readonly withBoardVeto?: boolean
  readonly registerEvidence?: boolean
  readonly withGovernance?: boolean
  readonly withFacilityBudget?: boolean
}

/** Facilities truth as input state on top of the shipped, Finance-activated prototype world (which contains no Facility). */
export function createFacilityMaintenanceBase(): FacilityMaintenanceBase {
  const game = createNewGame()
  const team = getUserTeam(game)!
  const organizationId = team.organizationId
  const asOf = game.currentDate
  const campus = createPlace({ id: 'place:fm-campus', kind: 'CAMPUS', name: 'FM Campus' })
  const facility = createFacility({ id: 'facility:fm-training-center', placeId: campus.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], capabilities: [], status: 'ACTIVE', canonicalName: 'FM Training Center', physical: { openedOn: '2004-09-01', courtCount: 1 } })
  const physio = createFacilityComponent({ id: 'component:fm-physio', facilityId: facility.id, type: 'PHYSIO_ROOM', name: 'Physiotherapy Room', status: 'ACTIVE', openedAt: '2004-09-01' })
  const world = updateGameWorld(game, {
    places: [...Object.values(game.placesById), campus],
    facilities: [facility],
    facilityComponents: [physio],
    facilityComponentConditionRecords: [createFacilityComponentConditionRecord({ id: 'condition:fm-physio', componentId: physio.id, effectiveFrom: addDays(asOf, -120), serviceability: 'SEVERELY_LIMITED', physicalCondition: 38 })],
    facilityMaintenanceNeeds: [
      createFacilityMaintenanceNeed({ id: 'need:mx06-physio-critical', facilityId: facility.id, componentId: physio.id, detectedAt: addDays(asOf, -45), type: 'EQUIPMENT', severity: 'CRITICAL', status: 'OPEN', source: 'FM fixture inspection' }),
      createFacilityMaintenanceNeed({ id: 'need:fm:second', facilityId: facility.id, componentId: physio.id, detectedAt: addDays(asOf, -10), type: 'ROUTINE', severity: 'MINOR', status: 'OPEN', source: 'FM fixture inspection' }),
    ],
    facilityOwnershipInterests: [createFacilityOwnershipInterest({ id: 'ownership:fm-club', facilityId: facility.id, owner: { kind: 'ORGANIZATION', organizationId }, ownershipPercentage: 100, validFrom: '2004-09-01' })],
    facilityUsageRights: [createFacilityUsageRight({ id: 'usage:fm-club-training', facilityId: facility.id, componentIds: null, organizationId, teamId: team.id, purpose: 'TRAINING', exclusivity: 'EXCLUSIVE', validFrom: '2004-09-01' })],
  })
  return Object.freeze({ world, teamId: team.id as never, organizationId: String(organizationId), trainingCenterId: String(facility.id), physioComponentId: String(physio.id), asOf })
}

export function createFacilityMaintenanceScenario(options: FacilityMaintenanceScenarioOptions = {}): FacilityMaintenanceScenario {
  const base = createFacilityMaintenanceBase()
  const asOf = base.asOf
  const organizationId = base.organizationId
  const currencyCode = String(base.world.organizationFinancialProfilesById[organizationId as never]!.baseCurrencyCode)
  let world = financingDrawdownForTest(base.world, base.teamId, options.drawdownMinorUnits ?? 1_000_000_000, 'fm:liquidity')

  if (options.withFacilityBudget !== false) world = withFacilityBudgetLine(world, base.teamId, organizationId, currencyCode, options.facilityBudgetMinorUnits ?? 50_000_000)
  if (options.withGovernance !== false) world = withFacilityGovernance(world, base.teamId, options.withBoardApproval !== false, options.withBoardVeto === true)

  const provider = createFacilityProvider({ id: 'provider:fm:documented', displayName: 'Documented Court Services', identityKind: 'DOCUMENTED_ENTITY', market: 'EU', provenance: { kind: 'DOCUMENTED_SOURCE', id: 'source:fm:provider-registry' }, registeredOn: asOf })
  const offer = createFacilityMaintenanceOffer({
    id: 'offer:fm:physio-repair:v1', organizationId, facilityId: base.trainingCenterId, needId: 'need:mx06-physio-critical', componentId: base.physioComponentId,
    interventionType: 'REPAIR', classification: 'OPEX_RESTORATIVE_REPAIR', providerId: provider.id, sourceKind: 'ACCREDITED_OFFER', evidence: { sourceId: 'source:fm:quote-2032-10-01' },
    amount: { currencyCode, minorUnits: options.offerAmountMinorUnits ?? 1_200_000 }, market: 'EU', issuedOn: asOf, validFrom: asOf, validUntil: addDays(asOf, options.offerValidDays ?? 30),
    terms: { paymentDueDays: options.paymentDueDays === undefined ? 30 : options.paymentDueDays, executionDays: options.executionDays === undefined ? 1 : options.executionDays },
  })
  const secondOffer = createFacilityMaintenanceOffer({
    id: 'offer:fm:second-routine:v1', organizationId, facilityId: base.trainingCenterId, needId: 'need:fm:second', componentId: base.physioComponentId, interventionType: 'ROUTINE_MAINTENANCE', classification: 'OPEX_ROUTINE_MAINTENANCE',
    providerId: provider.id, sourceKind: 'ACCREDITED_OFFER', evidence: { sourceId: 'source:fm:quote-routine-2032-10-01' }, amount: { currencyCode, minorUnits: 600_000 }, market: 'EU', issuedOn: asOf, validFrom: asOf, validUntil: addDays(asOf, 30),
    terms: { paymentDueDays: 30, executionDays: 1 },
  })
  if (options.registerEvidence === true) world = updateGameWorld(world, { facilityEconomyRecords: [provider, offer, secondOffer] })
  return Object.freeze({ base, world, teamId: base.teamId, organizationId, currencyCode, needId: 'need:mx06-physio-critical', facilityId: base.trainingCenterId, offerId: offer.id, providerId: provider.id, asOf, offer, provider, secondNeedId: 'need:fm:second', secondOffer })
}

/** An APPROVED budget fact that keeps the effective authorization lines and adds an explicit FACILITY expense line. */
export function withFacilityBudgetLine(world: GameWorld, teamId: string, organizationId: string, currencyCode: string, minorUnits: number): GameWorld {
  const period = financeFiscalPeriodsOf(world, organizationId as never).find((item) => item.startsOn <= world.currentDate && item.endsOn >= world.currentDate)
  if (period === undefined) throw new Error('Facility budget fixture needs a canonical fiscal period covering the current date')
  const current = getOrganizationFinancialAuthorization(world, { organizationId, currencyCode })
  const provenance = { kind: 'TEST_FIXTURE', id: 'bs17e-a-facility-budget' }
  const revision = Object.keys(world.financialBudgetsById).filter((id) => id.startsWith(`budget:test-facility-authorization:${organizationId}:`)).length + 1
  const budgetId = `budget:test-facility-authorization:${organizationId}:${String(period.id)}:r${revision}`
  const budget = createFinancialBudget({
    id: budgetId, organizationId, currencyCode, period: { kind: 'FISCAL_YEAR', startsOn: period.startsOn, endsOn: period.endsOn }, fiscalPeriodId: String(period.id), status: 'APPROVED',
    label: 'BS17E-A facility authorization', createdOn: world.currentDate,
    approval: { authorityKind: 'MANUAL_SYSTEM_ACTION', authorityId: 'system:bs17e-a-test-fixture', approvedOn: world.currentDate, provenance }, provenance,
  })
  const carried = current.lines.filter((line) => line.category !== 'FACILITY').map((line) => createBudgetLine({
    id: `${budgetId}:${line.lineId}`, budgetId, organizationId, category: line.category, direction: 'EXPENSE', amount: { currencyCode, minorUnits: line.authorizedMinorUnits },
    ...(line.teamId === undefined ? {} : { teamId: line.teamId }), ...(line.organizationSectionId === undefined ? {} : { organizationSectionId: line.organizationSectionId }), provenance,
  }))
  const facilityLine = createBudgetLine({ id: `${budgetId}:FACILITY`, budgetId, organizationId, category: 'FACILITY', direction: 'EXPENSE', amount: { currencyCode, minorUnits }, teamId, purpose: 'Facility maintenance authorization', provenance })
  return updateGameWorld(world, {
    financialBudgets: [...Object.values(world.financialBudgetsById), budget],
    budgetLines: [...Object.values(world.budgetLinesById), ...carried, facilityLine],
  })
}

/**
 * Governance graph stated as input: the OWNER delegates FACILITIES to the EXECUTIVE (PROPOSE + EXECUTE) and to
 * the BOARD (APPROVE, all-of). The user coach is appointed to both; a second, unrelated STAFF actor is
 * appointed to OPERATIONS, a body that holds NO rights at all (used to prove that appointment alone is not authority).
 */
export function withFacilityGovernance(world: GameWorld, teamId: string, boardApproves = true, boardVetoes = false): GameWorld {
  const granted = '2000-01-01' as GameDate
  const userCoachId = world.userCoachId
  const bodies = [
    { id: FM_OWNER, institutionId: FM_INSTITUTION, kind: 'OWNERSHIP' as const, name: 'Ownership' },
    { id: FM_EXECUTIVE, institutionId: FM_INSTITUTION, kind: 'EXECUTIVE' as const, name: 'Executive' },
    { id: FM_BOARD, institutionId: FM_INSTITUTION, kind: 'BOARD' as const, name: 'Board' },
    { id: FM_OPERATIONS, institutionId: FM_INSTITUTION, kind: 'COMPLIANCE' as const, name: 'Operations (no rights)' },
  ]
  const authorityGrants = [
    { id: 'authority:fm:owner-executive', fromBodyId: FM_OWNER, toBodyId: FM_EXECUTIVE, decision: 'FACILITIES' as const, grantedOn: granted },
    { id: 'authority:fm:owner-board', fromBodyId: FM_OWNER, toBodyId: FM_BOARD, decision: 'FACILITIES' as const, grantedOn: granted },
  ]
  const participation = [
    { id: 'right:fm:executive:propose', authorityGrantId: 'authority:fm:owner-executive', bodyId: FM_EXECUTIVE, edgeParticipant: 'DELEGATE' as const, right: 'PROPOSE' as const },
    { id: 'right:fm:executive:execute', authorityGrantId: 'authority:fm:owner-executive', bodyId: FM_EXECUTIVE, edgeParticipant: 'DELEGATE' as const, right: 'EXECUTE' as const },
    ...(boardVetoes ? [{ id: 'right:fm:board:veto', authorityGrantId: 'authority:fm:owner-board', bodyId: FM_BOARD, edgeParticipant: 'DELEGATE' as const, right: 'VETO' as const }] : []),
    ...(boardApproves ? [{ id: 'right:fm:board:approve', authorityGrantId: 'authority:fm:owner-board', bodyId: FM_BOARD, edgeParticipant: 'DELEGATE' as const, right: 'APPROVE' as const, approvalRequirement: 'ALL_OF' as const }] : []),
  ]
  const appointments = [
    { id: 'appointment:fm:user-executive', bodyId: FM_EXECUTIVE, actor: { kind: 'COACH' as const, id: userCoachId }, role: 'CEO' as const, startedOn: granted },
    { id: 'appointment:fm:user-board', bodyId: FM_BOARD, actor: { kind: 'COACH' as const, id: userCoachId }, role: 'BOARD_MEMBER' as const, startedOn: granted },
    { id: 'appointment:fm:outsider-operations', bodyId: FM_OPERATIONS, actor: { kind: 'EXTERNAL' as const, id: 'external:fm:outsider' }, role: 'COMPLIANCE_OFFICER' as const, startedOn: granted },
  ]
  return updateGameWorld(world, {
    governanceInstitutions: [...Object.values(world.governanceInstitutionsById), { id: FM_INSTITUTION, universe: 'PROFESSIONAL_CLUB', name: 'FM test institution', teamIds: [teamId as never] }],
    governanceBodies: [...Object.values(world.governanceBodiesById), ...bodies],
    governanceAuthorityGrants: [...Object.values(world.governanceAuthorityGrantsById), ...authorityGrants],
    governanceDecisionParticipationGrants: [...Object.values(world.governanceDecisionParticipationGrantsById), ...participation],
    governanceAppointments: [...Object.values(world.governanceAppointmentsById), ...appointments],
  })
}

/** A real inspection of the facility, which is what completion reads (finding, observed condition, serviceability). */
export function inspectionFor(scenario: FacilityMaintenanceScenario, id: string, on: GameDate, finding: FacilityInspection['finding'] = 'NO_ISSUE'): FacilityInspection {
  return createFacilityInspection({ id, facilityId: scenario.facilityId, componentId: scenario.base.physioComponentId, inspectedAt: on, finding, observedCondition: 90, observedServiceability: 'FULL' })
}

import {
  recordFacilityMaintenanceDecisionEvent,
  openFacilityMaintenanceProposal,
  requestFacilityMaintenanceDecision,
  reserveAndContractFacilityMaintenance,
  selectFacilityMaintenanceOffer,
  startFacilityMaintenanceWork,
  completeFacilityMaintenanceWork,
  type FacilityMaintenanceCommandResult,
} from './FacilityMaintenanceCommands'
import { advanceDayWithTrace } from '@/engine/calendar'

export function must(result: FacilityMaintenanceCommandResult): GameWorld {
  if (result.status !== 'APPLIED') throw new Error(`Expected APPLIED but got ${result.status}: ${result.reasons.join(',')} ${result.canonicalReasons.join(',')}`)
  return result.world
}

export function advance(world: GameWorld, days: number): GameWorld {
  let current = world
  for (let i = 0; i < days; i += 1) current = advanceDayWithTrace(current).world
  return current
}

export interface FlowState { readonly world: GameWorld; readonly operationId: string; readonly decisionId: string | null }

/** open -> select -> request approval (stops before any approval) on a scenario created with `registerEvidence: true`. */
export function requested(s: FacilityMaintenanceScenario): FlowState {
  const opened = openFacilityMaintenanceProposal(s.world, { teamId: s.teamId, needId: s.needId, interventionType: 'REPAIR' })
  const operationId = opened.operationId!
  let world = must(opened)
  world = must(selectFacilityMaintenanceOffer(world, { teamId: s.teamId, operationId, offerId: s.offerId }))
  const request = requestFacilityMaintenanceDecision(world, { teamId: s.teamId, operationId })
  return { world: must(request), operationId, decisionId: request.decisionId }
}

export function approved(s: FacilityMaintenanceScenario): FlowState {
  const flow = requested(s)
  return { ...flow, world: must(recordFacilityMaintenanceDecisionEvent(flow.world, { teamId: s.teamId, decisionId: flow.decisionId!, kind: 'APPROVED', bodyId: FM_BOARD })) }
}

export function contracted(s: FacilityMaintenanceScenario): FlowState {
  const flow = approved(s)
  return { ...flow, world: must(reserveAndContractFacilityMaintenance(flow.world, { teamId: s.teamId, operationId: flow.operationId })) }
}

export function working(s: FacilityMaintenanceScenario): FlowState {
  const flow = contracted(s)
  return { ...flow, world: must(startFacilityMaintenanceWork(flow.world, { teamId: s.teamId, operationId: flow.operationId })) }
}

/** Completed on the Calendar day after the start, with a real inspection of that day. The cost fact is authorized for the day after. */
export function completed(s: FacilityMaintenanceScenario): FlowState {
  const flow = working(s)
  let world = advance(flow.world, 1)
  const inspection = inspectionFor(s, 'inspection:fm:completion', world.currentDate)
  world = updateGameWorld(world, { facilityInspections: [...Object.values(world.facilityInspectionsById), inspection] })
  return { ...flow, world: must(completeFacilityMaintenanceWork(world, { teamId: s.teamId, operationId: flow.operationId, inspectionId: inspection.id })) }
}
