import { addYears } from '@/domain/date'
import { createPlayerContract, getPlayerContractStatus } from '@/domain/contract'
import type { EcosystemTransition, EcosystemTransitionType } from '@/domain/career'
import { contractIdFromString, type EcosystemId, type PlayerId, type TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { makeDraftSelection } from '@/engine/draft'

export interface ProfessionalTransitionInput { readonly id: string; readonly playerId: PlayerId; readonly toTeamId: TeamId; readonly annualSalary: number; readonly contractYears: number }

/** NCAA players enter the NBA through the existing NBA Draft authority. */
export function transitionNcaaPlayerToNbaDraft(world: GameWorld, input: Omit<ProfessionalTransitionInput, 'annualSalary' | 'contractYears'> & { readonly draftId: string; readonly selectingTeamId: TeamId }): GameWorld {
  if (world.ecosystemTransitionsById[input.id] !== undefined) return world
  const route = requireRoute(world, input.playerId, input.selectingTeamId, 'ncaaLike', 'nbaLike')
  const drafted = makeDraftSelection(detachSource(world, route.sourceTeamId, input.playerId), input.draftId, input.selectingTeamId, input.playerId)
  return recordTransition(drafted, input.id, input.playerId, route, 'ncaaToNbaDraft', input.selectingTeamId, 'nbaDraft')
}
/** NCAA NIL remains historical data; FIBA receives a new professional contract. */
export function transitionNcaaPlayerToFiba(world: GameWorld, input: ProfessionalTransitionInput): GameWorld { return transitionProfessionalPlayer(world, input, 'ncaaLike', 'fibaLike', 'ncaaToFiba') }
/** FIBA players may use the professional-signing gateway rather than the Draft. */
export function transitionFibaPlayerToNba(world: GameWorld, input: ProfessionalTransitionInput): GameWorld { return transitionProfessionalPlayer(world, input, 'fibaLike', 'nbaLike', 'fibaToNba') }
/** NBA departure terminates the NBA contract; FIBA receives a distinct contract. */
export function transitionNbaPlayerToFiba(world: GameWorld, input: ProfessionalTransitionInput): GameWorld { return transitionProfessionalPlayer(world, input, 'nbaLike', 'fibaLike', 'nbaToFiba') }

/** Legacy low-level move. New professional routes use the explicit gateways above. */
export function movePlayerAcrossEcosystems(world: GameWorld, input: { readonly id: string; readonly playerId: PlayerId; readonly toTeamId: TeamId; readonly transitionType: EcosystemTransitionType; readonly sourceSystem: string }): { ok: true; value: GameWorld } | { ok: false; reason: string } {
  if (world.ecosystemTransitionsById[input.id] !== undefined) return { ok: true, value: world }
  try {
    const source = findRosterTeam(world, input.playerId), target = world.teams[input.toTeamId]
    if (source === undefined) return { ok: false, reason: 'PLAYER_NOT_ROSTERED' }
    if (target === undefined || target.rosterPlayerIds.includes(input.playerId)) return { ok: false, reason: 'INVALID_DESTINATION' }
    const route = routeForTeams(world, source.id, target.id)
    if (route.fromEcosystemId === route.toEcosystemId) return { ok: false, reason: 'INVALID_ECOSYSTEM_ROUTE' }
    const moved = updateGameWorld(world, { teams: Object.values(world.teams).map((team) => team.id === source.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== input.playerId) } : team.id === target.id ? { ...team, rosterPlayerIds: [...team.rosterPlayerIds, input.playerId] } : team) })
    return { ok: true, value: recordTransition(moved, input.id, input.playerId, { ...route, sourceTeamId: source.id }, input.transitionType, target.id, input.sourceSystem) }
  } catch { return { ok: false, reason: 'INVALID_ECOSYSTEM_ROUTE' } }
}

function transitionProfessionalPlayer(world: GameWorld, input: ProfessionalTransitionInput, originKind: 'ncaaLike' | 'fibaLike' | 'nbaLike', destinationKind: 'fibaLike' | 'nbaLike', transitionType: EcosystemTransitionType): GameWorld {
  if (world.ecosystemTransitionsById[input.id] !== undefined) return world
  if (!Number.isInteger(input.annualSalary) || input.annualSalary < 1 || !Number.isInteger(input.contractYears) || input.contractYears < 1) throw new Error('Professional transition terms are invalid')
  const route = requireRoute(world, input.playerId, input.toTeamId, originKind, destinationKind)
  const sourceContract = Object.values(world.contractsById).find((contract) => contract.playerId === input.playerId && contract.teamId === route.sourceTeamId && getPlayerContractStatus(contract, world.currentDate) === 'active')
  if (originKind !== 'ncaaLike' && sourceContract === undefined) throw new Error('Professional player cannot leave without an active contract')
  const destinationContract = createPlayerContract({ id: contractIdFromString(`contract:ecosystem-transition:${input.id}`), playerId: input.playerId, teamId: input.toTeamId, kind: 'standard', term: { startsOn: world.currentDate, expiresOn: addYears(world.currentDate, input.contractYears) }, compensation: { annualSalary: input.annualSalary } })
  const contracts = [...Object.values(world.contractsById).map((contract) => contract.id === sourceContract?.id ? { ...contract, termination: { terminatedOn: world.currentDate, reason: 'released' as const } } : contract), destinationContract]
  const moved = updateGameWorld(world, { teams: Object.values(world.teams).map((team) => team.id === route.sourceTeamId ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== input.playerId) } : team.id === input.toTeamId ? { ...team, rosterPlayerIds: [...team.rosterPlayerIds, input.playerId] } : team), contracts })
  return recordTransition(moved, input.id, input.playerId, route, transitionType, input.toTeamId, 'professionalSigning')
}

function detachSource(world: GameWorld, sourceTeamId: TeamId, playerId: PlayerId): GameWorld { return updateGameWorld(world, { teams: Object.values(world.teams).map((team) => team.id === sourceTeamId ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== playerId) } : team) }) }
function requireRoute(world: GameWorld, playerId: PlayerId, destinationTeamId: TeamId, originKind: 'ncaaLike' | 'fibaLike' | 'nbaLike', destinationKind: 'fibaLike' | 'nbaLike') { const source = findRosterTeam(world, playerId); if (source === undefined) throw new Error('Player is not on an active roster'); const route = routeForTeams(world, source.id, destinationTeamId); const origin = world.ecosystems[route.fromEcosystemId], destination = world.ecosystems[route.toEcosystemId]; if (origin?.kind !== originKind || destination?.kind !== destinationKind || origin.category !== destination.category) throw new Error('Invalid ecosystem transition route'); return { ...route, sourceTeamId: source.id } }
function findRosterTeam(world: GameWorld, playerId: PlayerId) { return Object.values(world.teams).find((team) => team.rosterPlayerIds.includes(playerId)) }
function routeForTeams(world: GameWorld, fromTeamId: TeamId, toTeamId: TeamId) { const fromEcosystemId = Object.values(world.competitions).find((competition) => competition.participantTeamIds.includes(fromTeamId))?.ecosystemId, toEcosystemId = Object.values(world.competitions).find((competition) => competition.participantTeamIds.includes(toTeamId))?.ecosystemId; if (fromEcosystemId === undefined || toEcosystemId === undefined) throw new Error('Teams must belong to ecosystems'); return { fromEcosystemId, toEcosystemId } }
function recordTransition(world: GameWorld, id: string, playerId: PlayerId, route: { readonly fromEcosystemId: EcosystemId; readonly toEcosystemId: EcosystemId; readonly sourceTeamId?: TeamId }, transitionType: EcosystemTransitionType, toTeamId: TeamId, sourceSystem: string): GameWorld { const transition: EcosystemTransition = { id, playerId, fromEcosystemId: route.fromEcosystemId, toEcosystemId: route.toEcosystemId, fromTeamId: route.sourceTeamId, toTeamId, effectiveDate: world.currentDate, transitionType, sourceSystem }; return updateGameWorld(world, { ecosystemTransitions: [...Object.values(world.ecosystemTransitionsById), transition] }) }
export function getCrossEcosystemCandidates(world: GameWorld, toEcosystemId: string) { return Object.values(world.players).filter((player) => { const team = findRosterTeam(world, player.id); return team !== undefined && routeForTeams(world, team.id, team.id).fromEcosystemId !== toEcosystemId }) }
