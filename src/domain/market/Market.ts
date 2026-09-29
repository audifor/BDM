import type { GameDate } from '@/domain/date'
import type { AgencyId, AgentId, OrganizationId, PlayerId, StaffPersonId, TeamId } from '@/domain/ids'

export interface AgentAbilities { readonly negotiation:number; readonly marketKnowledge:number; readonly network:number; readonly clientManagement:number; readonly mediaInfluence:number }
export interface AgentProfessionalPersonality { readonly aggressiveness:number; readonly loyalty:number; readonly opportunism:number; readonly patience:number; readonly discretion:number }
export interface Agent { readonly id:AgentId; readonly name:string; readonly agencyId?:AgencyId; readonly reputation:number; readonly abilities:AgentAbilities; readonly personality:AgentProfessionalPersonality }
export interface Agency { readonly id:AgencyId; readonly name:string; readonly reputation:number }
/** The sole persistent player-to-agent authority; portfolios are derived. */
export interface PlayerRepresentation { readonly playerId:PlayerId; readonly agentId:AgentId; readonly trust:number; readonly startedOn:GameDate }
export interface MarketReality { readonly playerId:PlayerId; readonly availability:'NOT_FOR_SALE'|'LISTENING'|'OPEN'; readonly expectedSalary:number; readonly expectedYears:number; readonly playerWillingness:number; readonly sellerWillingness:number; readonly competition:number }
export interface MarketKnowledge { readonly organizationId:OrganizationId; readonly playerId:PlayerId; readonly availability?:'NOT_FOR_SALE'|'LISTENING'|'OPEN'; readonly expectedSalary?:number; readonly expectedYears?:number; readonly playerInterest?:number; readonly sellerWillingness?:number; readonly competition?:number; readonly confidence:number; readonly assessedAt:GameDate; readonly source:'AGENT'|'CLUB_CONTACT'|'MEDIA' }
export interface MarketSignal { readonly id:string; readonly organizationId:OrganizationId; readonly playerId:PlayerId; readonly source:'AGENT'|'CLUB_CONTACT'|'MEDIA'; readonly occurredOn:GameDate; readonly reliability:number; readonly availability?:MarketReality['availability']; readonly expectedSalary?:number; readonly expectedYears?:number; readonly playerInterest?:number; readonly sellerWillingness?:number; readonly competition?:number }
export type NegotiationRole = 'STAR'|'STARTER'|'ROTATION'|'DEPTH'
export type NegotiationResponsibleActor =
  | { readonly kind: 'USER' }
  | { readonly kind: 'ORGANIZATION' }
  | { readonly kind: 'STAFF'; readonly staffPersonId: StaffPersonId }

interface NegotiationIdentity {
  readonly id: string
  readonly organizationId: OrganizationId
  readonly playerId: PlayerId
  /** Added for new records; absent on historical records. */
  readonly teamId?: TeamId
  readonly startedOn?: GameDate
  /** Stable action identity. A distinct key represents a legitimate later attempt. */
  readonly openingKey?: string
  /** Original A3 attempt identity; retained verbatim alongside its composite opening key. */
  readonly actionKey?: string
  readonly sourcePlanId?: string
  readonly sourceProposalId?: string
  readonly responsibleActor?: NegotiationResponsibleActor
  readonly agentId?: AgentId
  /** Observable result of a term-free contact; formal offer outcomes remain separate. */
  readonly contactResponse?: NegotiationContactResponse
}

export interface NegotiationContactResponse {
  readonly outcome: 'OPEN_TO_TALKS' | 'NOT_INTERESTED'
  readonly respondedOn: GameDate
  readonly marketSignalId: string
}

interface ContactOnlyNegotiation extends NegotiationIdentity {
  readonly status: 'CONTACTED' | 'CLOSED'
  /** No offer has been submitted at this stage, so terms do not exist. */
  readonly salary?: never
  readonly years?: never
  readonly role?: never
  readonly agentFee?: never
  readonly round?: never
}

interface FormalOfferNegotiation extends NegotiationIdentity {
  readonly status: 'OPEN' | 'COUNTERED' | 'ACCEPTED' | 'REJECTED'
  readonly salary: number
  readonly years: number
  readonly role: NegotiationRole
  readonly agentFee: number
  readonly round: number
}

/** CONTACTED is pre-offer; OPEN is the first formal offer. Historical offers remain valid. */
export type ContractNegotiation = ContactOnlyNegotiation | FormalOfferNegotiation

export interface NegotiationOpeningKey {
  readonly organizationId: OrganizationId
  readonly teamId: TeamId
  readonly playerId: PlayerId
  /** Stable source action, normally the current plan/proposal pair. */
  readonly actionKey: string
}

export function negotiationOpeningKeyString(key: NegotiationOpeningKey): string {
  if (key.actionKey.trim() === '') throw new TypeError('Negotiation action key is required')
  return [key.organizationId, key.teamId, key.playerId, key.actionKey].map(encodeURIComponent).join(':')
}

export function negotiationIdForOpening(key: NegotiationOpeningKey): string {
  return `negotiation:${negotiationOpeningKeyString(key)}`
}

export function isActiveNegotiation(negotiation: ContractNegotiation): boolean {
  return negotiation.status === 'CONTACTED' || negotiation.status === 'OPEN' || negotiation.status === 'COUNTERED'
}

export function createNegotiationContact(input: Omit<ContactOnlyNegotiation, 'status' | 'id' | 'openingKey'> & { readonly actionKey: string }): ContractNegotiation {
  if (input.actionKey.trim() === '' || input.startedOn === undefined || input.teamId === undefined || input.responsibleActor === undefined) {
    throw new TypeError('A negotiation contact requires identity, team, date, opening key, and responsible actor')
  }
  const { actionKey, ...identity } = input
  const key: NegotiationOpeningKey = { organizationId: input.organizationId, teamId: input.teamId, playerId: input.playerId, actionKey }
  const openingKey = negotiationOpeningKeyString(key)
  return Object.freeze({ ...identity, actionKey, id: negotiationIdForOpening(key), openingKey, status: 'CONTACTED' })
}
export interface RolePromise { readonly id:string; readonly playerId:PlayerId; readonly teamOrganizationId:OrganizationId; readonly role:NegotiationRole; readonly acceptedOn:GameDate; readonly status:'ACTIVE'|'FULFILLED'|'BROKEN' }

export function getAgentClients(representations:readonly PlayerRepresentation[],agentId:AgentId):readonly PlayerId[]{return representations.filter(item=>item.agentId===agentId).map(item=>item.playerId)}
export function getMarketKnowledge(knowledge:readonly MarketKnowledge[],organizationId:OrganizationId,playerId:PlayerId):MarketKnowledge|undefined{return knowledge.find(item=>item.organizationId===organizationId&&item.playerId===playerId)}
/** Market queries are pure; absent knowledge remains absent rather than reading MarketReality. */
export function marketAvailability(knowledge:readonly MarketKnowledge[],organizationId:OrganizationId,playerId:PlayerId):MarketKnowledge['availability']|undefined{return getMarketKnowledge(knowledge,organizationId,playerId)?.availability}
export function consolidateMarketSignal(current:readonly MarketKnowledge[],signal:MarketSignal):readonly MarketKnowledge[]{const prior=getMarketKnowledge(current,signal.organizationId,signal.playerId);const next:MarketKnowledge={organizationId:signal.organizationId,playerId:signal.playerId,availability:signal.availability??prior?.availability,expectedSalary:signal.expectedSalary??prior?.expectedSalary,expectedYears:signal.expectedYears??prior?.expectedYears,playerInterest:signal.playerInterest??prior?.playerInterest,sellerWillingness:signal.sellerWillingness??prior?.sellerWillingness,competition:signal.competition??prior?.competition,confidence:Math.max(prior?.confidence??0,Math.round(signal.reliability*100)),assessedAt:signal.occurredOn,source:signal.source};return[...current.filter(item=>item!==prior),next]}
export function agentCounter(negotiation:ContractNegotiation,agent:Agent|undefined):ContractNegotiation{if(!agent||negotiation.status!=='OPEN')return negotiation;const pressure=Math.round((agent.abilities.negotiation+agent.personality.aggressiveness+agent.personality.opportunism)/30);return{...negotiation,salary:negotiation.salary+pressure*10_000,agentFee:negotiation.agentFee+Math.round(negotiation.salary*agent.abilities.negotiation/10_000),status:'COUNTERED',round:negotiation.round+1}}
