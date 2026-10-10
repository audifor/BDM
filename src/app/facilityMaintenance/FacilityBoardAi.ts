/**
 * Board AI for Facilities decisions (BDM_GAME_BALANCE_V1).
 *
 * The Board is a Governance body whose appointees are simulated people. This processor makes the ordinary Board
 * decision on a pending `FACILITIES` operation decision, and it does so only through the same canonical command a
 * human uses (`recordFacilityMaintenanceDecisionEvent`): the acting person must be an active appointee of a body
 * holding APPROVE for that decision, and every event cites its supporting grants. The AI has no other authority.
 *
 * Rule (game parameters, see BdmGameBalanceV1): a decision is considered the first Calendar day AFTER it was
 * requested. It is approved when Finance would allow the commitment today AND either the need is at least
 * MODERATE or the quote is a small share of the remaining FACILITY authorization; otherwise it is rejected. A
 * cancellation request is approved while no cost has been authorized. Nothing else is decided here.
 */

import {
  deriveFacilityOperationLifecycle,
  facilityOperationEvents,
  facilityOperationIds,
  isFacilityOfferValidOn,
} from '@/domain/facilityEconomy'
import { evaluateOrganizationFinancialCommitment, getOrganizationFinancialAuthorization } from '@/domain/finance'
import type { GovernanceActor } from '@/domain/governance'
import type { GameWorld } from '@/domain/world'
import { GAME_BALANCE_BOARD_ROUTINE_SHARE_PERMILLE } from '@/app/gameBalance/BdmGameBalanceV1'
import { facilityMaintenanceDecisionState, recordFacilityMaintenanceDecisionEvent } from './FacilityMaintenanceCommands'

function activeAppointee(world: GameWorld, bodyId: string): GovernanceActor | undefined {
  const appointment = Object.values(world.governanceAppointmentsById)
    .filter((item) => item.bodyId === bodyId && item.startedOn <= world.currentDate && (item.endedOn === undefined || item.endedOn >= world.currentDate))
    .sort((a, b) => a.id.localeCompare(b.id))[0]
  return appointment === undefined ? undefined : appointment.actor
}

/** True when the offer is affordable now and passes the Board's routine-share rule. */
function boardApprovesWork(world: GameWorld, operationId: string): boolean {
  const lifecycle = deriveFacilityOperationLifecycle(facilityOperationEvents(world, operationId))
  if (lifecycle === null || lifecycle.selectedOfferId === null || lifecycle.organizationId === null) return false
  const offer = world.facilityEconomyRecordsById[lifecycle.selectedOfferId]
  if (offer === undefined || offer.recordKind !== 'OFFER' || !isFacilityOfferValidOn(offer, world.currentDate)) return false
  const preview = evaluateOrganizationFinancialCommitment(world, { organizationId: lifecycle.organizationId, currency: offer.amount.currencyCode, amount: offer.amount, category: 'FACILITY' })
  if (preview.status !== 'AFFORDABLE_NOW') return false
  const need = lifecycle.needId === null ? undefined : world.facilityMaintenanceNeedsById[lifecycle.needId as never]
  if (need !== undefined && (need.severity === 'MODERATE' || need.severity === 'MAJOR' || need.severity === 'CRITICAL')) return true
  const authorization = getOrganizationFinancialAuthorization(world, { organizationId: lifecycle.organizationId, currencyCode: offer.amount.currencyCode })
  const line = authorization.lines.find((item) => item.category === 'FACILITY')
  if (line === undefined) return true
  return offer.amount.minorUnits * 1_000 <= line.availableHeadroomMinorUnits * GAME_BALANCE_BOARD_ROUTINE_SHARE_PERMILLE
}

/** Decides every Facilities decision that was requested before today and still awaits its approvers. Deterministic and idempotent. */
export function processBoardFacilityDecisions(world: GameWorld): GameWorld {
  let current = world
  for (const operationId of facilityOperationIds(world)) {
    const lifecycle = deriveFacilityOperationLifecycle(facilityOperationEvents(current, operationId))
    if (lifecycle === null || lifecycle.cancelled) continue
    for (const [decisionId, purpose] of [[lifecycle.decisionId, 'WORK'], [lifecycle.cancellationRequestedDecisionId, 'CANCELLATION']] as const) {
      if (decisionId === null) continue
      const decision = current.governanceDecisionsById[decisionId]
      const state = facilityMaintenanceDecisionState(current, decision)
      if (decision === undefined || state === null || state.complete || (state.status !== 'PROPOSED' && state.status !== 'REVIEW_STARTED')) continue
      if (decision.proposedOn >= current.currentDate) continue
      const institution = current.governanceInstitutionsById[decision.institutionId]
      const teamId = institution?.teamIds[0]
      const bodyId = state.requiredBodyIds.find((id) => !state.approvedBodyIds.includes(id))
      if (teamId === undefined || bodyId === undefined) continue
      const actor = activeAppointee(current, bodyId)
      // The user's own appointments are never decided by the AI: only simulated people act as the Board.
      if (actor === undefined || (actor.kind === 'COACH' && actor.id === current.userCoachId)) continue
      const approve = purpose === 'CANCELLATION' ? lifecycle.costFactId === null : boardApprovesWork(current, operationId)
      const outcome = recordFacilityMaintenanceDecisionEvent(current, { teamId, decisionId, kind: approve ? 'APPROVED' : 'REJECTED', bodyId, actor })
      if (outcome.status === 'APPLIED') current = outcome.world
    }
  }
  return current
}
