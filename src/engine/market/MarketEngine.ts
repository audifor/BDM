import { consolidateMarketSignal, createNegotiationContact as createNegotiationContactRecord, isActiveNegotiation, negotiationIdForOpening, negotiationOpeningKeyString, type ContractNegotiation, type MarketSignal, type NegotiationOpeningKey, type NegotiationResponsibleActor, type NegotiationRole } from '@/domain/market'
import { agencyIdFromString, agentIdFromString, type OrganizationId, type PlayerId } from '@/domain/ids'
import { canTeamAffordAdditionalSalary, isPlayerFreeAgent, updateGameWorld, type GameWorld } from '@/domain/world'
import type { GameDate } from '@/domain/date'
import type { TeamId } from '@/domain/ids'
import { resolveNegotiationContactAuthority } from '@/engine/marketIntelligence/NegotiationContactAuthority'

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
export interface OpenNegotiationInput {
  readonly organizationId: OrganizationId
  readonly teamId: import('@/domain/ids').TeamId
  readonly playerId: PlayerId
  readonly agentId?: import('@/domain/ids').AgentId
  readonly salary: number
  readonly years: number
  readonly role: NegotiationRole
  readonly agentFee: number
  readonly actionKey: string
  readonly sourcePlanId?: string
  readonly sourceProposalId?: string
  readonly responsibleActor: NegotiationResponsibleActor
}

/** Creates only a formal first offer. Contact is an earlier term-free state. */
export function openNegotiation(world: GameWorld, input: OpenNegotiationInput): GameWorld {
  const team = world.teams[input.teamId]
  if (team === undefined || team.organizationId !== input.organizationId) throw new RangeError('Negotiation team does not belong to the organization')

  const openingKey: NegotiationOpeningKey = { organizationId: input.organizationId, teamId: input.teamId, playerId: input.playerId, actionKey: input.actionKey }
  const persistedOpeningKey = negotiationOpeningKeyString(openingKey)
  const id = negotiationIdForOpening(openingKey)
  const existingForKey = world.negotiationsById[id]
  if (existingForKey !== undefined) {
    const actorMatches = existingForKey.responsibleActor?.kind === input.responsibleActor.kind
      && (input.responsibleActor.kind !== 'STAFF' || (existingForKey.responsibleActor?.kind === 'STAFF' && existingForKey.responsibleActor.staffPersonId === input.responsibleActor.staffPersonId))
    const sourceMatches = existingForKey.sourcePlanId === input.sourcePlanId && existingForKey.sourceProposalId === input.sourceProposalId
    if (existingForKey.status === 'CONTACTED') {
      if (existingForKey.openingKey !== persistedOpeningKey || (existingForKey.actionKey !== undefined && existingForKey.actionKey !== input.actionKey) || existingForKey.teamId !== input.teamId || !actorMatches || !sourceMatches) {
        throw new RangeError(`Negotiation contact ${id} does not match this formal offer attempt`)
      }
      if (!isPlayerFreeAgent(world, input.playerId)) throw new RangeError('Player is no longer a free agent')
      const offer: ContractNegotiation = {
        ...existingForKey,
        ...(input.agentId === undefined ? {} : { agentId: input.agentId }),
        salary: input.salary,
        years: input.years,
        role: input.role,
        agentFee: input.agentFee,
        actionKey: input.actionKey,
        status: 'OPEN',
        round: 0,
      }
      return updateGameWorld(world, { negotiations: [...Object.values(world.negotiationsById).filter((item) => item.id !== id), offer] })
    }
    const sameOffer = existingForKey.openingKey === persistedOpeningKey
      && (existingForKey.actionKey === undefined || existingForKey.actionKey === input.actionKey)
      && existingForKey.teamId === input.teamId
      && existingForKey.status !== 'CLOSED'
      && existingForKey.salary === input.salary
      && existingForKey.years === input.years
      && existingForKey.role === input.role
      && existingForKey.agentFee === input.agentFee
      && existingForKey.agentId === input.agentId
      && sourceMatches
      && actorMatches
    if (sameOffer) return world
    throw new RangeError(`Negotiation opening key ${persistedOpeningKey} is already in use`)
  }

  if (!isPlayerFreeAgent(world, input.playerId)) throw new RangeError('Player is no longer a free agent')
  if (!canTeamAffordAdditionalSalary(world, input.teamId, input.salary)) throw new RangeError('Team cannot afford the formal offer salary')

  const active = Object.values(world.negotiationsById).find((item) => isActiveNegotiation(item)
    && item.playerId === input.playerId
    && (item.teamId === input.teamId || (item.teamId === undefined && item.organizationId === input.organizationId)))
  if (active !== undefined) throw new RangeError(`An active negotiation already exists for ${input.teamId} and ${input.playerId}`)

  const negotiation: ContractNegotiation = {
    id,
    organizationId: input.organizationId,
    teamId: input.teamId,
    playerId: input.playerId,
    ...(input.agentId === undefined ? {} : { agentId: input.agentId }),
    salary: input.salary,
    years: input.years,
    role: input.role,
    agentFee: input.agentFee,
    status: 'OPEN',
    round: 0,
    startedOn: world.currentDate,
    openingKey: persistedOpeningKey,
    actionKey: input.actionKey,
    ...(input.sourcePlanId === undefined ? {} : { sourcePlanId: input.sourcePlanId }),
    ...(input.sourceProposalId === undefined ? {} : { sourceProposalId: input.sourceProposalId }),
    responsibleActor: input.responsibleActor,
  }
  return updateGameWorld(world, { negotiations: [...Object.values(world.negotiationsById), negotiation] })
}
export function agentForPlayer(world:GameWorld,playerId:PlayerId){const representation=world.playerRepresentations.find(item=>item.playerId===playerId);return representation===undefined?undefined:world.agentsById[representation.agentId]}
export function organizationMarketContact(world:GameWorld,teamId:import('@/domain/ids').TeamId,playerId:PlayerId):OrganizationId{return world.teams[teamId]!.organizationId}
