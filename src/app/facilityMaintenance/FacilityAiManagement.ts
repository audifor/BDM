/**
 * BS17F — facility management by AI clubs.
 *
 * The AI acts through exactly the commands, rights and Finance gates the user has: the simulated general manager (the EXTERNAL appointee
 * of the club's operator body) proposes, contracts, starts and accepts; the Board (FacilityBoardAi) approves or rejects. No state is
 * written directly and there is no RNG: every choice is a deterministic function of the world.
 *
 *  - Planning day: one deterministic day per club per month. At most ONE new proposal is opened per club per month.
 *  - Priority: open needs by severity (then id) first, a conservation service next, a justified capital investment last. A candidate is
 *    pursued only when its cheapest valid offer is affordable and the Board would accept it, so scarce funds go to the most severe need
 *    and nothing is proposed that cannot be paid.
 *  - Progress: every day, each open operation of an AI club advances one step through its own stage machine (approval -> contract ->
 *    start -> acceptance). Every step is idempotent by stage, so nothing can happen twice in the same period or after Save/reload.
 *  - Unaffordable, rejected or expired operations are cancelled through the ordinary cancellation command (history kept, no penalty).
 */

import { compareGameDates } from '@/domain/date'
import { deriveFacilityOperationLifecycle, facilityOperationEvents, facilityOperationIds, type FacilityOperationLifecycle } from '@/domain/facilityEconomy'
import { evaluateOrganizationFinancialCommitment } from '@/domain/finance'
import type { GovernanceActor } from '@/domain/governance'
import type { TeamId } from '@/domain/ids'
import { type GameWorld } from '@/domain/world'
import { gameBalanceHash, gameBalanceId } from '@/app/gameBalance/BdmGameBalanceV1'
import { gameBalanceActorId } from '@/app/gameBalance/GameBalanceBootstrap'
import { boardApprovesInvestment, boardApprovesService, boardApprovesWork } from './FacilityBoardAi'
import { buildFacilityMaintenanceNeedRows } from './FacilityMaintenanceReadModel'
import {
  cancelFacilityMaintenanceOperation,
  completeFacilityMaintenanceWork,
  facilityMaintenanceDecisionState,
  openFacilityMaintenanceProposal,
  requestFacilityMaintenanceDecision,
  reserveAndContractFacilityMaintenance,
  selectFacilityMaintenanceOffer,
  startFacilityMaintenanceWork,
  type FacilityMaintenanceCommandResult,
} from './FacilityMaintenanceCommands'
import { offersForOperation, requestFacilityOffers } from './FacilityMaintenanceOffers'
import {
  acceptFacilityInvestmentWork,
  cancelFacilityInvestment,
  capitalOffersForOperation,
  listFacilityInvestmentOptions,
  openFacilityInvestmentProposal,
  requestFacilityInvestmentOffers,
  reserveAndContractFacilityInvestment,
  selectFacilityInvestmentOffer,
  startFacilityInvestmentWork,
} from './FacilityCapitalCommands'
import {
  listFacilityServiceOptions,
  openFacilityServiceProposal,
  requestFacilityServiceOffers,
  selectFacilityServiceOffer,
  serviceOffersForOperation,
  signFacilityServiceContract,
  terminateFacilityServiceContract,
} from './FacilityServiceCommands'

const SEVERITY_RANK: Readonly<Record<string, number>> = Object.freeze({ CRITICAL: 4, MAJOR: 3, MODERATE: 2, MINOR: 1 })

/** The simulated general manager of an AI club, if the preset created one. The user's club is never managed by the AI. */
function aiManager(world: GameWorld, teamId: TeamId): GovernanceActor | null {
  const team = world.teams[teamId]
  if (team === undefined || team.coachId === world.userCoachId) return null
  const organizationId = String(team.organizationId)
  const appointment = world.governanceAppointmentsById[gameBalanceId('appointment', organizationId, 'manager') as never]
  if (appointment === undefined || appointment.actor.kind !== 'EXTERNAL' || appointment.actor.id !== gameBalanceActorId(organizationId, 'manager')) return null
  return appointment.actor
}

/** The deterministic day of the month (1..28) on which a club plans. */
export function aiPlanningDay(organizationId: string): number { return 1 + (gameBalanceHash(`${organizationId}:facility-ai-planning`) % 28) }

const dayOfMonth = (date: string): number => Number(String(date).slice(8, 10))
const monthOf = (date: string): string => String(date).slice(0, 7)

const applied = (result: FacilityMaintenanceCommandResult): boolean => result.status === 'APPLIED'
const affordableNow = (world: GameWorld, organizationId: string, amount: { readonly currencyCode: string; readonly minorUnits: number }, category: 'FACILITY' | 'FACILITY_DEVELOPMENT'): boolean =>
  evaluateOrganizationFinancialCommitment(world, { organizationId, currency: amount.currencyCode, amount, category }).status === 'AFFORDABLE_NOW'

type Kind = 'MAINTENANCE' | 'CAPITAL' | 'SERVICE'
const kindOf = (lifecycle: FacilityOperationLifecycle): Kind => lifecycle.interventionType === 'SERVICE_CONSERVATION' ? 'SERVICE' : lifecycle.projectId !== null ? 'CAPITAL' : 'MAINTENANCE'

interface Candidate { readonly offerId: string; readonly amount: number }

/** The cheapest valid affordable offer of an operation, as (id, amount) pairs ordered by price. */
function cheapestAffordable(world: GameWorld, lifecycle: FacilityOperationLifecycle): readonly Candidate[] {
  const organizationId = lifecycle.organizationId!
  const kind = kindOf(lifecycle)
  const rows: Candidate[] = kind === 'MAINTENANCE'
    ? offersForOperation(world, lifecycle.operationId).filter((offer) => affordableNow(world, organizationId, offer.amount, 'FACILITY')).map((offer) => ({ offerId: offer.id, amount: offer.amount.minorUnits }))
    : kind === 'CAPITAL'
      ? capitalOffersForOperation(world, lifecycle.operationId).filter((offer) => affordableNow(world, organizationId, offer.amount, 'FACILITY_DEVELOPMENT')).map((offer) => ({ offerId: offer.id, amount: offer.amount.minorUnits }))
      : serviceOffersForOperation(world, lifecycle.operationId).filter((offer) => affordableNow(world, organizationId, offer.amountPerPeriod, 'FACILITY')).map((offer) => ({ offerId: offer.id, amount: offer.amountPerPeriod.minorUnits }))
  return rows.sort((a, b) => a.amount - b.amount || a.offerId.localeCompare(b.offerId))
}

function requestOffers(world: GameWorld, teamId: TeamId, lifecycle: FacilityOperationLifecycle): GameWorld {
  const kind = kindOf(lifecycle)
  const result = kind === 'MAINTENANCE' ? requestFacilityOffers(world, { teamId, operationId: lifecycle.operationId }) : kind === 'CAPITAL' ? requestFacilityInvestmentOffers(world, { teamId, operationId: lifecycle.operationId }) : requestFacilityServiceOffers(world, { teamId, operationId: lifecycle.operationId })
  return applied(result) ? result.world : world
}

function selectOffer(world: GameWorld, teamId: TeamId, lifecycle: FacilityOperationLifecycle, offerId: string): FacilityMaintenanceCommandResult {
  const kind = kindOf(lifecycle)
  const input = { teamId, operationId: lifecycle.operationId, offerId }
  return kind === 'MAINTENANCE' ? selectFacilityMaintenanceOffer(world, input) : kind === 'CAPITAL' ? selectFacilityInvestmentOffer(world, input) : selectFacilityServiceOffer(world, input)
}

function boardWouldApprove(world: GameWorld, operationId: string, kind: Kind): boolean {
  return kind === 'MAINTENANCE' ? boardApprovesWork(world, operationId) : kind === 'CAPITAL' ? boardApprovesInvestment(world, operationId) : boardApprovesService(world, operationId)
}

function cancel(world: GameWorld, teamId: TeamId, lifecycle: FacilityOperationLifecycle, actor: GovernanceActor): GameWorld {
  const kind = kindOf(lifecycle)
  const input = { teamId, operationId: lifecycle.operationId, actor }
  const result = kind === 'MAINTENANCE' ? cancelFacilityMaintenanceOperation(world, input) : kind === 'CAPITAL' ? cancelFacilityInvestment(world, input) : terminateFacilityServiceContract(world, input)
  return applied(result) ? result.world : world
}

/**
 * Opens an operation, requests offers, chooses the cheapest affordable offer the Board would accept and asks for approval, all in one
 * go. When no offer qualifies the operation is cancelled so the club can consider the next candidate the same day.
 */
function pursue(world: GameWorld, teamId: TeamId, actor: GovernanceActor, opened: FacilityMaintenanceCommandResult): { readonly world: GameWorld; readonly pursued: boolean } {
  if (!applied(opened) || opened.operationId === null) return { world, pursued: false }
  let current = opened.world
  const operationId = opened.operationId
  const lifecycleOf = () => deriveFacilityOperationLifecycle(facilityOperationEvents(current, operationId))!
  current = requestOffers(current, teamId, lifecycleOf())
  const lifecycle = lifecycleOf()
  const kind = kindOf(lifecycle)
  for (const candidate of cheapestAffordable(current, lifecycle)) {
    const selected = selectOffer(current, teamId, lifecycle, candidate.offerId)
    if (!applied(selected) || !boardWouldApprove(selected.world, operationId, kind)) continue
    const requested = requestFacilityMaintenanceDecision(selected.world, { teamId, operationId, initiator: actor })
    if (applied(requested)) return { world: requested.world, pursued: true }
  }
  // Nothing affordable or acceptable: withdraw the unsigned proposal (history kept) and let the caller try something else.
  return { world: world, pursued: false }
}

/** Plans at most one new proposal for a club today: needs by severity, then a conservation service, then a justified investment. */
function planClub(world: GameWorld, teamId: TeamId, actor: GovernanceActor): GameWorld {
  const team = world.teams[teamId]!
  const organizationId = String(team.organizationId)
  const month = monthOf(world.currentDate)
  const alreadyThisMonth = facilityOperationIds(world).some((id) => {
    const events = facilityOperationEvents(world, id)
    const first = events[0]
    return first !== undefined && first.organizationId === organizationId && monthOf(first.effectiveOn) === month
  })
  if (alreadyThisMonth) return world

  const needs = buildFacilityMaintenanceNeedRows(world, teamId)
    .filter((row) => row.active === null && row.openProposalAction.enabled)
    .sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0) || a.needId.localeCompare(b.needId))
  for (const row of needs) {
    const interventionType = (SEVERITY_RANK[row.severity] ?? 0) >= SEVERITY_RANK.MODERATE! ? 'REPAIR' as const : 'PREVENTIVE_MAINTENANCE' as const
    const outcome = pursue(world, teamId, actor, openFacilityMaintenanceProposal(world, { teamId, needId: row.needId, interventionType, actor }))
    if (outcome.pursued) return outcome.world
  }
  for (const option of listFacilityServiceOptions(world, teamId)) {
    if (!option.eligible) continue
    const outcome = pursue(world, teamId, actor, openFacilityServiceProposal(world, { teamId, facilityId: option.facilityId, actor }))
    if (outcome.pursued) return outcome.world
  }
  const investments = listFacilityInvestmentOptions(world, teamId).filter((option) => option.eligible && option.kind !== 'EXPANSION')
    .sort((a, b) => (a.currentCondition ?? 100) - (b.currentCondition ?? 100) || a.key.localeCompare(b.key))
  for (const option of investments) {
    const outcome = pursue(world, teamId, actor, openFacilityInvestmentProposal(world, { teamId, facilityId: option.facilityId, kind: option.kind, componentId: option.componentId, actor }))
    if (outcome.pursued) return outcome.world
  }
  return world
}

/** Advances one open operation one step. Every branch is gated by the operation's stage, so repeating a day changes nothing. */
function advanceOperation(world: GameWorld, teamId: TeamId, actor: GovernanceActor, lifecycle: FacilityOperationLifecycle): GameWorld {
  const kind = kindOf(lifecycle)
  const operationId = lifecycle.operationId
  const decision = lifecycle.decisionId === null ? undefined : world.governanceDecisionsById[lifecycle.decisionId]
  const state = facilityMaintenanceDecisionState(world, decision)
  const offer = lifecycle.selectedOfferId === null ? undefined : world.facilityEconomyRecordsById[lifecycle.selectedOfferId]
  const validUntil = offer === undefined ? null : offer.recordKind === 'SERVICE_OFFER' || offer.recordKind === 'OFFER' || offer.recordKind === 'CAPITAL_OFFER' ? offer.validUntil : null
  switch (lifecycle.stage) {
    case 'COST_UNKNOWN':
    case 'PENDING_APPROVAL':
    case 'FUNDING_BLOCKED':
    case 'APPROVED_PENDING_FUNDING': {
      if (state !== null && (state.status === 'REJECTED' || state.status === 'VETOED' || state.status === 'WITHDRAWN')) return cancel(world, teamId, lifecycle, actor)
      if (state !== null && state.complete) {
        if (validUntil !== null && compareGameDates(world.currentDate, validUntil) > 0) return cancel(world, teamId, lifecycle, actor)
        const result = kind === 'MAINTENANCE' ? reserveAndContractFacilityMaintenance(world, { teamId, operationId, actor }) : kind === 'CAPITAL' ? reserveAndContractFacilityInvestment(world, { teamId, operationId, actor }) : signFacilityServiceContract(world, { teamId, operationId, actor })
        return result.status === 'APPLIED' || result.status === 'FUNDING_BLOCKED' ? result.world : world
      }
      // A proposal that never reached a decision (e.g. interrupted) or whose offer lapsed is withdrawn.
      if (state === null && lifecycle.stage === 'COST_UNKNOWN') return cancel(world, teamId, lifecycle, actor)
      if (state !== null && !state.complete && validUntil !== null && compareGameDates(world.currentDate, validUntil) > 0) return cancel(world, teamId, lifecycle, actor)
      return world
    }
    case 'RESERVED':
    case 'CONTRACTED': {
      if (kind === 'SERVICE') return world
      const result = kind === 'MAINTENANCE' ? startFacilityMaintenanceWork(world, { teamId, operationId }) : startFacilityInvestmentWork(world, { teamId, operationId })
      return applied(result) ? result.world : world
    }
    case 'WORK_IN_PROGRESS': {
      if (kind === 'SERVICE') return world
      const result = kind === 'MAINTENANCE' ? completeFacilityMaintenanceWork(world, { teamId, operationId, actor }) : acceptFacilityInvestmentWork(world, { teamId, operationId, actor })
      return applied(result) ? result.world : world
    }
    default: return world
  }
}

/** AI clubs of the world with a simulated manager, in stable order. */
function aiClubs(world: GameWorld): readonly { readonly teamId: TeamId; readonly organizationId: string; readonly actor: GovernanceActor }[] {
  const rows: { teamId: TeamId; organizationId: string; actor: GovernanceActor }[] = []
  for (const team of Object.values(world.teams)) {
    const actor = aiManager(world, team.id)
    if (actor !== null) rows.push({ teamId: team.id, organizationId: String(team.organizationId), actor })
  }
  return rows.sort((a, b) => a.organizationId.localeCompare(b.organizationId))
}

/** The daily AI step (called from the Facilities management Calendar phase). Returns the identical world when nothing applies. */
export function processAiFacilityManagement(world: GameWorld): GameWorld {
  const clubs = aiClubs(world)
  if (clubs.length === 0) return world
  const byOrganization = new Map(clubs.map((club) => [club.organizationId, club]))
  let current = world
  for (const operationId of facilityOperationIds(world)) {
    const lifecycle = deriveFacilityOperationLifecycle(facilityOperationEvents(current, operationId))
    if (lifecycle === null || lifecycle.cancelled || lifecycle.organizationId === null || lifecycle.stage === 'WORK_COMPLETED') continue
    const club = byOrganization.get(lifecycle.organizationId)
    if (club === undefined) continue
    if (kindOf(lifecycle) === 'SERVICE' && lifecycle.stage === 'CONTRACTED') continue
    current = advanceOperation(current, club.teamId, club.actor, lifecycle)
  }
  const today = dayOfMonth(current.currentDate)
  for (const club of clubs) {
    if (aiPlanningDay(club.organizationId) !== today) continue
    current = planClub(current, club.teamId, club.actor)
  }
  return current
}
