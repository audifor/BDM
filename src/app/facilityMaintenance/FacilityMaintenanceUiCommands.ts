import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { FacilityMaintenanceInterventionType } from '@/domain/facilityEconomy'
import {
  cancelFacilityMaintenanceOperation,
  completeFacilityMaintenanceWork,
  openFacilityMaintenanceProposal,
  recordFacilityMaintenanceDecisionEvent,
  requestFacilityMaintenanceDecision,
  reserveAndContractFacilityMaintenance,
  selectFacilityMaintenanceOffer,
  startFacilityMaintenanceWork,
  type FacilityMaintenanceCommandResult,
} from './FacilityMaintenanceCommands'
import { requestFacilityOffers } from './FacilityMaintenanceOffers'
import { acceptFacilityInvestmentWork, cancelFacilityInvestment, openFacilityInvestmentProposal, requestFacilityInvestmentOffers, reserveAndContractFacilityInvestment, selectFacilityInvestmentOffer, startFacilityInvestmentWork, type FacilityInvestmentKind } from './FacilityCapitalCommands'
import { openFacilityServiceProposal, requestFacilityServiceOffers, selectFacilityServiceOffer, signFacilityServiceContract, terminateFacilityServiceContract } from './FacilityServiceCommands'

/** The manager surface invokes exactly these real commands; nothing here changes state on its own. */
export type FacilityMaintenanceUiCommand =
  | { readonly kind: 'OPEN_PROPOSAL'; readonly needId: string; readonly interventionType: FacilityMaintenanceInterventionType }
  | { readonly kind: 'REQUEST_OFFERS'; readonly operationId: string }
  | { readonly kind: 'SELECT_OFFER'; readonly operationId: string; readonly offerId: string }
  | { readonly kind: 'REQUEST_APPROVAL'; readonly operationId: string }
  | { readonly kind: 'APPROVE' | 'REJECT' | 'VETO'; readonly decisionId: string; readonly bodyId: string }
  | { readonly kind: 'RESERVE_AND_CONTRACT'; readonly operationId: string }
  | { readonly kind: 'START_WORK'; readonly operationId: string }
  | { readonly kind: 'COMPLETE_WORK'; readonly operationId: string; readonly inspectionId?: string }
  | { readonly kind: 'REQUEST_CANCELLATION'; readonly operationId: string }
  | { readonly kind: 'CANCEL'; readonly operationId: string }
  | { readonly kind: 'INVEST_OPEN'; readonly facilityId: string; readonly investment: FacilityInvestmentKind; readonly componentId: string | null }
  | { readonly kind: 'INVEST_REQUEST_OFFERS' | 'INVEST_REQUEST_APPROVAL' | 'INVEST_RESERVE' | 'INVEST_START' | 'INVEST_ACCEPT' | 'INVEST_REQUEST_CANCELLATION' | 'INVEST_CANCEL'; readonly operationId: string }
  | { readonly kind: 'SERVICE_OPEN'; readonly facilityId: string }
  | { readonly kind: 'SERVICE_REQUEST_OFFERS' | 'SERVICE_REQUEST_APPROVAL' | 'SERVICE_SIGN' | 'SERVICE_TERMINATE'; readonly operationId: string }
  | { readonly kind: 'SERVICE_SELECT_OFFER'; readonly operationId: string; readonly offerId: string }
  | { readonly kind: 'INVEST_SELECT_OFFER'; readonly operationId: string; readonly offerId: string }

export function executeFacilityMaintenanceUiCommand(world: GameWorld, teamId: TeamId, command: FacilityMaintenanceUiCommand): FacilityMaintenanceCommandResult {
  switch (command.kind) {
    case 'OPEN_PROPOSAL': return openFacilityMaintenanceProposal(world, { teamId, needId: command.needId, interventionType: command.interventionType })
    case 'REQUEST_OFFERS': return requestFacilityOffers(world, { teamId, operationId: command.operationId })
    case 'SELECT_OFFER': return selectFacilityMaintenanceOffer(world, { teamId, operationId: command.operationId, offerId: command.offerId })
    case 'REQUEST_APPROVAL': return requestFacilityMaintenanceDecision(world, { teamId, operationId: command.operationId })
    case 'APPROVE': return recordFacilityMaintenanceDecisionEvent(world, { teamId, decisionId: command.decisionId, kind: 'APPROVED', bodyId: command.bodyId })
    case 'REJECT': return recordFacilityMaintenanceDecisionEvent(world, { teamId, decisionId: command.decisionId, kind: 'REJECTED', bodyId: command.bodyId })
    case 'VETO': return recordFacilityMaintenanceDecisionEvent(world, { teamId, decisionId: command.decisionId, kind: 'VETOED', bodyId: command.bodyId })
    case 'RESERVE_AND_CONTRACT': return reserveAndContractFacilityMaintenance(world, { teamId, operationId: command.operationId })
    case 'START_WORK': return startFacilityMaintenanceWork(world, { teamId, operationId: command.operationId })
    case 'COMPLETE_WORK': return completeFacilityMaintenanceWork(world, { teamId, operationId: command.operationId, ...(command.inspectionId === undefined ? {} : { inspectionId: command.inspectionId }) })
    case 'REQUEST_CANCELLATION': return requestFacilityMaintenanceDecision(world, { teamId, operationId: command.operationId, purpose: 'CANCELLATION' })
    case 'CANCEL': return cancelFacilityMaintenanceOperation(world, { teamId, operationId: command.operationId })
    case 'SERVICE_OPEN': return openFacilityServiceProposal(world, { teamId, facilityId: command.facilityId })
    case 'SERVICE_REQUEST_OFFERS': return requestFacilityServiceOffers(world, { teamId, operationId: command.operationId })
    case 'SERVICE_SELECT_OFFER': return selectFacilityServiceOffer(world, { teamId, operationId: command.operationId, offerId: command.offerId })
    case 'SERVICE_REQUEST_APPROVAL': return requestFacilityMaintenanceDecision(world, { teamId, operationId: command.operationId })
    case 'SERVICE_SIGN': return signFacilityServiceContract(world, { teamId, operationId: command.operationId })
    case 'SERVICE_TERMINATE': return terminateFacilityServiceContract(world, { teamId, operationId: command.operationId })
    case 'INVEST_OPEN': return openFacilityInvestmentProposal(world, { teamId, facilityId: command.facilityId, kind: command.investment, componentId: command.componentId })
    case 'INVEST_REQUEST_OFFERS': return requestFacilityInvestmentOffers(world, { teamId, operationId: command.operationId })
    case 'INVEST_SELECT_OFFER': return selectFacilityInvestmentOffer(world, { teamId, operationId: command.operationId, offerId: command.offerId })
    case 'INVEST_REQUEST_APPROVAL': return requestFacilityMaintenanceDecision(world, { teamId, operationId: command.operationId })
    case 'INVEST_RESERVE': return reserveAndContractFacilityInvestment(world, { teamId, operationId: command.operationId })
    case 'INVEST_START': return startFacilityInvestmentWork(world, { teamId, operationId: command.operationId })
    case 'INVEST_ACCEPT': return acceptFacilityInvestmentWork(world, { teamId, operationId: command.operationId })
    case 'INVEST_REQUEST_CANCELLATION': return requestFacilityMaintenanceDecision(world, { teamId, operationId: command.operationId, purpose: 'CANCELLATION' })
    case 'INVEST_CANCEL': return cancelFacilityInvestment(world, { teamId, operationId: command.operationId })
  }
}
