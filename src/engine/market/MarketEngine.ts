import { consolidateMarketSignal, createNegotiationContact as createNegotiationContactRecord, isActiveNegotiation, negotiationContactActor, negotiationIdForOpening, negotiationOfferActor, negotiationOpeningKeyString, type ContractNegotiation, type MarketSignal, type NegotiationContactResponse, type NegotiationOpeningKey, type NegotiationResponsibleActor, type NegotiationRole } from '@/domain/market'
import { agencyIdFromString, agentIdFromString, type OrganizationId, type PlayerId } from '@/domain/ids'
import { canTeamAffordAdditionalSalary, isPlayerFreeAgent, updateGameWorld, type GameWorld } from '@/domain/world'
import type { GameDate } from '@/domain/date'
import type { TeamId } from '@/domain/ids'
import { resolveNegotiationContactAuthority } from '@/engine/marketIntelligence/NegotiationContactAuthority'
import { isAuthorizedOfferActor } from './NegotiationOfferAuthority'

export interface CreateNegotiationContactInput {
  readonly organizationId: OrganizationId
  readonly teamId: TeamId
  readonly playerId: PlayerId
  readonly startedOn: GameDate
  readonly actionKey: string
  readonly responsibleActor: NegotiationResponsibleActor
  readonly sourcePlanId: string
  readonly sourceProposalId: string
}

export type CreateNegotiationContactResult =
  | { readonly status: 'CREATED' | 'ALREADY_EXISTS'; readonly world: GameWorld; readonly contact: ContractNegotiation }
  | { readonly status: 'ACTIVE_NEGOTIATION_EXISTS' | 'PLAYER_NOT_FREE_AGENT' | 'BLOCKED'; readonly world: GameWorld; readonly reason: string }

/** The only Engine mutation for creating a pre-offer, term-free free-agent contact. */
export function createNegotiationContact(world: GameWorld, input: CreateNegotiationContactInput): CreateNegotiationContactResult {
  const team = world.teams[input.teamId]
  if (team === undefined || team.organizationId !== input.organizationId || world.organizationsById[input.organizationId] === undefined) {
    return { status: 'BLOCKED', world, reason: 'TEAM_OR_ORGANIZATION_MISMATCH' }
  }
  if (world.players[input.playerId] === undefined) return { status: 'BLOCKED', world, reason: 'PLAYER_NOT_FOUND' }
  if (typeof input.actionKey !== 'string' || input.actionKey.trim() === ''
    || typeof input.sourcePlanId !== 'string' || input.sourcePlanId.trim() === ''
    || typeof input.sourceProposalId !== 'string' || input.sourceProposalId.trim() === '') {
    return { status: 'BLOCKED', world, reason: 'CONTACT_SOURCE_OR_ACTION_KEY_REQUIRED' }
  }

  const key: NegotiationOpeningKey = { organizationId: input.organizationId, teamId: input.teamId, playerId: input.playerId, actionKey: input.actionKey }
  let openingKey: string
  let id: string
  try {
    openingKey = negotiationOpeningKeyString(key)
    id = negotiationIdForOpening(key)
  } catch {
    return { status: 'BLOCKED', world, reason: 'INVALID_CONTACT_ACTION_KEY' }
  }

  const existing = world.negotiationsById[id]
  if (existing !== undefined) {
    if (existing.status === 'CONTACTED'
      && existing.openingKey === openingKey
      && (existing.actionKey === undefined || existing.actionKey === input.actionKey)
      && existing.organizationId === input.organizationId
      && existing.teamId === input.teamId
      && existing.playerId === input.playerId
      && sameActor(negotiationContactActor(existing), input.responsibleActor)
      && existing.sourcePlanId === input.sourcePlanId
      && existing.sourceProposalId === input.sourceProposalId) {
      return { status: 'ALREADY_EXISTS', world, contact: existing }
    }
    return { status: 'BLOCKED', world, reason: 'CONTACT_ACTION_KEY_ALREADY_RECORDED' }
  }

  if (input.startedOn !== world.currentDate) return { status: 'BLOCKED', world, reason: 'CONTACT_DATE_IS_NOT_CURRENT' }
  if (!isPlayerFreeAgent(world, input.playerId)) return { status: 'PLAYER_NOT_FREE_AGENT', world, reason: 'PLAYER_NOT_FREE_AGENT' }
  if (!validContactActor(world, input.teamId, input.responsibleActor)) return { status: 'BLOCKED', world, reason: 'CONTACT_ACTOR_NOT_AUTHORIZED' }

  const active = Object.values(world.negotiationsById).find((item) => isActiveNegotiation(item)
    && item.playerId === input.playerId
    && (item.teamId === input.teamId || (item.teamId === undefined && item.organizationId === input.organizationId)))
  if (active !== undefined) return { status: 'ACTIVE_NEGOTIATION_EXISTS', world, reason: 'ACTIVE_NEGOTIATION_ALREADY_EXISTS' }

  const contact = createNegotiationContactRecord({
    organizationId: input.organizationId,
    teamId: input.teamId,
    playerId: input.playerId,
    startedOn: world.currentDate,
    actionKey: input.actionKey,
    responsibleActor: input.responsibleActor,
    sourcePlanId: input.sourcePlanId,
    sourceProposalId: input.sourceProposalId,
  })
  const next = updateGameWorld(world, { negotiations: [...Object.values(world.negotiationsById), contact] })
  return { status: 'CREATED', world: next, contact }
}

function sameActor(existing: NegotiationResponsibleActor | undefined, requested: NegotiationResponsibleActor): boolean {
  return existing?.kind === requested.kind
    && (requested.kind !== 'STAFF' || (existing?.kind === 'STAFF' && existing.staffPersonId === requested.staffPersonId))
}

function validContactActor(world: GameWorld, teamId: TeamId, actor: NegotiationResponsibleActor): boolean {
  const authority = resolveNegotiationContactAuthority(world, teamId)
  if (actor.kind === 'USER') return authority.authorityStatus === 'USER_CONTROLLED'
  return actor.kind === 'STAFF'
    && typeof actor.staffPersonId === 'string'
    && actor.staffPersonId.trim() !== ''
    && authority.authorityStatus === 'AUTHORIZED'
    && authority.responsibleStaffId === actor.staffPersonId
}

/** Deterministic Wave 4 bootstrap: a portfolio model, not one agent per player. */
export function initializeMarketAgents(world:GameWorld):GameWorld{if(Object.keys(world.agentsById).length>0)return world;const agencies=Array.from({length:4},(_,index)=>({id:agencyIdFromString(`agency:market:${index+1}`),name:['Northline','Vertex','Pioneer','Crown'][index]+' Sports',reputation:45+index*12}));const agents=Array.from({length:8},(_,index)=>{const agencyId=agencies[index%agencies.length]!.id;return{id:agentIdFromString(`agent:market:${index+1}`),name:`Agent ${index+1}`,agencyId,reputation:40+(index*7)%50,abilities:{negotiation:45+(index*11)%45,marketKnowledge:40+(index*13)%50,network:42+(index*17)%45,clientManagement:44+(index*19)%43,mediaInfluence:35+(index*23)%48},personality:{aggressiveness:35+(index*7)%55,loyalty:35+(index*9)%55,opportunism:35+(index*11)%55,patience:35+(index*13)%55,discretion:35+(index*17)%55}}});const players=Object.values(world.players).sort((a,b)=>a.id.localeCompare(b.id));return updateGameWorld(world,{agencies,agents,playerRepresentations:players.map((player,index)=>({playerId:player.id,agentId:agents[index%agents.length]!.id,trust:55+(index%30),startedOn:world.currentDate})),marketReality:players.map((player,index)=>({playerId:player.id,availability:index%7===0?'OPEN':index%3===0?'LISTENING':'NOT_FOR_SALE',expectedSalary:300_000+(index%12)*75_000,expectedYears:1+index%4,playerWillingness:35+(index*7)%55,sellerWillingness:25+(index*11)%65,competition:index%6}))})}

/** Signals are the only route through which an organization gains market perception. */
export function receiveMarketSignal(world:GameWorld,signal:MarketSignal):GameWorld{return updateGameWorld(world,{marketSignals:[...Object.values(world.marketSignalsById),signal],marketKnowledge:consolidateMarketSignal(world.marketKnowledge,signal)})}

/** Processes delayed contact replies and reveals only direct-contact observations to the contacted organization. */
export function progressNegotiationContactResponses(world: GameWorld): GameWorld {
  let current = world
  const dueContacts = Object.values(world.negotiationsById)
    .filter((item) => item.status === 'CONTACTED' && item.contactResponse === undefined
      && (item.startedOn === undefined || item.startedOn < world.currentDate))
    .sort((a, b) => a.id.localeCompare(b.id))

  for (const contact of dueContacts) {
    const latest = current.negotiationsById[contact.id]
    if (latest?.status !== 'CONTACTED' || latest.contactResponse !== undefined) continue
    if (!isPlayerFreeAgent(current, latest.playerId)) {
      const closed: ContractNegotiation = { ...latest, status: 'CLOSED' }
      current = updateGameWorld(current, { negotiations: [...Object.values(current.negotiationsById).filter((item) => item.id !== latest.id), closed] })
      continue
    }
    const reality = current.marketRealityByPlayerId[latest.playerId]
    if (reality === undefined) continue

    const signalId = `market-signal:contact-response:${latest.id}`
    const outcome: NegotiationContactResponse['outcome'] = reality.playerWillingness >= 50 ? 'OPEN_TO_TALKS' : 'NOT_INTERESTED'
    const response: NegotiationContactResponse = { outcome, respondedOn: current.currentDate, marketSignalId: signalId }
    const updatedNegotiation: ContractNegotiation = {
      ...latest,
      ...(outcome === 'NOT_INTERESTED' ? { status: 'CLOSED' as const } : {}),
      contactResponse: response,
    }
    current = updateGameWorld(current, { negotiations: [...Object.values(current.negotiationsById).filter((item) => item.id !== latest.id), updatedNegotiation] })
    current = receiveMarketSignal(current, {
      id: signalId,
      organizationId: latest.organizationId,
      playerId: latest.playerId,
      source: 'CLUB_CONTACT',
      occurredOn: current.currentDate,
      reliability: 0.9,
      playerInterest: reality.playerWillingness,
      ...(outcome === 'OPEN_TO_TALKS' ? { expectedSalary: reality.expectedSalary } : {}),
    })
  }
  return current
}

export interface OpenNegotiationInput {
  readonly organizationId: OrganizationId
  readonly teamId: import('@/domain/ids').TeamId
  readonly playerId: PlayerId
  readonly agentId?: import('@/domain/ids').AgentId
  readonly salary: number
  readonly years: number
  readonly role?: NegotiationRole
  readonly agentFee?: number
  readonly actionKey: string
  readonly sourcePlanId: string
  readonly sourceProposalId: string
  readonly offerResponsibleActor: NegotiationResponsibleActor
}

/** Advances the exact positive CONTACTED record to a nonbinding formal offer. */
export function openNegotiation(world: GameWorld, input: OpenNegotiationInput): GameWorld {
  const team = world.teams[input.teamId]
  if (team === undefined || team.organizationId !== input.organizationId) throw new RangeError('Negotiation team does not belong to the organization')
  if (world.players[input.playerId] === undefined) throw new RangeError('Negotiation player does not exist')
  if (!isAuthorizedOfferActor(world, input.teamId, input.offerResponsibleActor)) throw new RangeError('Formal offer actor is not authorized for this team')
  if (!Number.isSafeInteger(input.salary) || input.salary < 1 || input.salary > 100_000_000) throw new RangeError('Formal offer salary is invalid')
  if (!Number.isSafeInteger(input.years) || input.years < 1) throw new RangeError('Formal offer years are invalid')
  if (input.agentFee !== undefined && (!Number.isSafeInteger(input.agentFee) || input.agentFee < 0)) throw new RangeError('Formal offer agent fee is invalid')
  if (input.sourcePlanId.trim() === '' || input.sourceProposalId.trim() === '' || input.actionKey.trim() === '') throw new RangeError('Formal offer source and action identity are required')

  const openingKey: NegotiationOpeningKey = { organizationId: input.organizationId, teamId: input.teamId, playerId: input.playerId, actionKey: input.actionKey }
  const persistedOpeningKey = negotiationOpeningKeyString(openingKey)
  const id = negotiationIdForOpening(openingKey)
  const existingForKey = world.negotiationsById[id]
  if (existingForKey !== undefined) {
    const contactActor = negotiationContactActor(existingForKey)
    const contactActorMatches = existingForKey.status !== 'CONTACTED' || contactActor !== undefined
    const offerActor = negotiationOfferActor(existingForKey)
    const offerActorMatches = offerActor?.kind === input.offerResponsibleActor.kind
      && (input.offerResponsibleActor.kind !== 'STAFF' || (offerActor?.kind === 'STAFF' && offerActor.staffPersonId === input.offerResponsibleActor.staffPersonId))
    const sourceMatches = existingForKey.sourcePlanId === input.sourcePlanId && existingForKey.sourceProposalId === input.sourceProposalId
    if (existingForKey.status === 'CONTACTED') {
      if (existingForKey.id !== id || existingForKey.openingKey !== persistedOpeningKey || existingForKey.actionKey !== input.actionKey || existingForKey.teamId !== input.teamId || existingForKey.organizationId !== input.organizationId || existingForKey.playerId !== input.playerId || !contactActorMatches || !sourceMatches) {
        throw new RangeError(`Negotiation contact ${id} does not match this formal offer attempt`)
      }
      if (existingForKey.contactResponse?.outcome !== 'OPEN_TO_TALKS' || existingForKey.contactResponse.respondedOn > world.currentDate) throw new RangeError('Formal offer requires a positive current contact response')
      if (!isPlayerFreeAgent(world, input.playerId)) throw new RangeError('Player is no longer a free agent')
      const conflictingActive = Object.values(world.negotiationsById).some((item) => item.id !== id && isActiveNegotiation(item)
        && item.playerId === input.playerId
        && (item.teamId === input.teamId || (item.teamId === undefined && item.organizationId === input.organizationId)))
      if (conflictingActive) throw new RangeError('Another active negotiation already exists for this team and player')
      if (!canTeamAffordAdditionalSalary(world, input.teamId, input.salary)) throw new RangeError('Team cannot afford the formal offer salary')
      const offer: ContractNegotiation = {
        ...existingForKey,
        ...(input.agentId === undefined ? {} : { agentId: input.agentId }),
        salary: input.salary,
        years: input.years,
        ...(input.role === undefined ? {} : { role: input.role }),
        ...(input.agentFee === undefined ? {} : { agentFee: input.agentFee }),
        offerSubmittedOn: world.currentDate,
        actionKey: input.actionKey,
        offerResponsibleActor: input.offerResponsibleActor,
        status: 'OPEN',
        round: 0,
      }
      return updateGameWorld(world, { negotiations: [...Object.values(world.negotiationsById).filter((item) => item.id !== id), offer] })
    }
    const sameOffer = existingForKey.openingKey === persistedOpeningKey
      && existingForKey.id === id
      && existingForKey.actionKey === input.actionKey
      && existingForKey.organizationId === input.organizationId
      && existingForKey.teamId === input.teamId
      && existingForKey.playerId === input.playerId
      && existingForKey.status === 'OPEN'
      && existingForKey.salary === input.salary
      && existingForKey.years === input.years
      && existingForKey.role === input.role
      && existingForKey.agentFee === input.agentFee
      && existingForKey.agentId === input.agentId
      && sourceMatches
      && offerActorMatches
    if (sameOffer) return world
    throw new RangeError(`Negotiation opening key ${persistedOpeningKey} is already in use`)
  }
  throw new RangeError('Formal offer requires an exact existing CONTACTED negotiation')
}
export function agentForPlayer(world:GameWorld,playerId:PlayerId){const representation=world.playerRepresentations.find(item=>item.playerId===playerId);return representation===undefined?undefined:world.agentsById[representation.agentId]}
export function organizationMarketContact(world:GameWorld,teamId:import('@/domain/ids').TeamId,playerId:PlayerId):OrganizationId{return world.teams[teamId]!.organizationId}
