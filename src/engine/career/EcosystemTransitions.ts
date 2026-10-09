import { addYears } from '@/domain/date'
import { createPlayerContract, getPlayerContractStatus } from '@/domain/contract'
import type { EcosystemTransition, EcosystemTransitionType } from '@/domain/career'
import { contractIdFromString, type EcosystemId, type PlayerId, type TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { clearPlayerFromLineup } from '@/domain/tactics'
import { makeDraftSelection } from '@/engine/draft'
import { createRookieContract } from '@/engine/salary'
import { endPlayerEnrollment } from '@/engine/eligibility'
import { isPlayerCareerActive } from './PlayerCareerLifecycle'
import { signFreeAgent } from '@/app/market/MarketService'

export interface ProfessionalTransitionInput { readonly id: string; readonly playerId: PlayerId; readonly toTeamId: TeamId; readonly annualSalary: number; readonly contractYears: number }

/** NCAA players enter the NBA through the existing NBA Draft authority. */
export function transitionNcaaPlayerToNbaDraft(world: GameWorld, input: Omit<ProfessionalTransitionInput, 'annualSalary' | 'contractYears'> & { readonly draftId: string; readonly selectingTeamId: TeamId }): GameWorld {
  if (world.ecosystemTransitionsById[input.id] !== undefined) return world
  const route = requireRoute(world, input.playerId, input.selectingTeamId, 'ncaaLike', 'nbaLike')
  if (Object.values(world.contractsById).some((contract) => contract.playerId === input.playerId && getPlayerContractStatus(contract, world.currentDate) === 'active')) throw new Error('Player has an active professional contract')
  const currentPick = Object.values(world.draftPicksById).find((pick) => pick.draftId === input.draftId && pick.selection === undefined)
  if (!currentPick || currentPick.ownerTeamId !== input.selectingTeamId) throw new Error('Draft pick is not owned by selecting team')
  const drafted = makeDraftSelection(world, input.draftId, input.selectingTeamId, input.playerId)
  const sourceEnrollment = Object.values(drafted.playerEnrollmentsById).find((item) => item.playerId === input.playerId && item.status === 'active')
  const salaryRules = drafted.salaryRulesBySeasonId[drafted.draftsById[input.draftId]!.sourceSeasonId]
  const rookieContract = salaryRules === undefined ? undefined : createRookieContract(salaryRules, input.playerId, input.selectingTeamId, currentPick.order, drafted.currentDate)
  if (rookieContract === undefined) return drafted
  const rights = Object.values(drafted.playerRightsById).find((item) => item.playerId === input.playerId && item.ownerTeamId === input.selectingTeamId && item.rightsType === 'draft')!
  let signed = updateGameWorld(drafted, { playerRights: Object.values(drafted.playerRightsById).map((item) => item.id === rights.id ? { ...item, contractId: rookieContract.id } : item), teams: Object.values(drafted.teams).map((team) => team.id === route.sourceTeamId ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== input.playerId) } : team.id === input.selectingTeamId ? { ...team, rosterPlayerIds: [...team.rosterPlayerIds, input.playerId] } : team), contracts: drafted.contractsById[rookieContract.id] !== undefined ? Object.values(drafted.contractsById) : [...Object.values(drafted.contractsById), rookieContract], playerRegistrations: Object.values(drafted.playerRegistrationsById).map((registration) => registration.playerId === input.playerId && registration.endsOn === undefined ? { ...registration, endsOn: drafted.currentDate } : registration), lineupsByTeamId: lineupsAfterMove(drafted, input.playerId) })
  if (sourceEnrollment !== undefined) signed = endPlayerEnrollment(signed, sourceEnrollment.id)
  return recordTransition(signed, input.id, input.playerId, route, 'ncaaToNbaDraft', input.selectingTeamId, 'nbaDraftProfessionalEntry', rookieContract.id)
}

/** Signs a previously selected Player through a separate, idempotent Draft-rights contract step. */
export function signDraftRightsToNba(world: GameWorld, input: ProfessionalTransitionInput & { readonly rightsId: string }): GameWorld {
  if (world.ecosystemTransitionsById[input.id] !== undefined) return world
  const rights = world.playerRightsById[input.rightsId]
  if (!rights || rights.rightsType !== 'draft' || rights.status !== 'active' || rights.playerId !== input.playerId || rights.ownerTeamId !== input.toTeamId || rights.contractId !== undefined) throw new Error('Active uncontracted Draft rights are required')
  if (!isPlayerCareerActive(world, input.playerId)) throw new Error('Player career has ended')
  const sourceTeam = getCollegeOrRosterSourceTeam(world, input.playerId)
  const sourceKind = sourceTeam === undefined ? undefined : world.ecosystems[routeForTeams(world, sourceTeam.id, input.toTeamId).fromEcosystemId]?.kind
  if (sourceKind !== 'ncaaLike' && sourceKind !== 'fibaLike') throw new Error('Draft rights signing requires a college or international source Player')
  const route = requireRoute(world, input.playerId, input.toTeamId, sourceKind, 'nbaLike', sourceTeam)
  if (Object.values(world.contractsById).some((contract) => contract.playerId === input.playerId && ['active', 'scheduled'].includes(getPlayerContractStatus(contract, world.currentDate)))) throw new Error('Player has an active professional contract')
  const contract = createPlayerContract({ id: contractIdFromString(`contract:draft-rights:${rights.id}`), playerId: input.playerId, teamId: input.toTeamId, kind: 'standard', term: { startsOn: world.currentDate, expiresOn: addYears(world.currentDate, input.contractYears) }, compensation: { annualSalary: input.annualSalary } })
  const sourceEnrollment = Object.values(world.playerEnrollmentsById).find((item) => item.playerId === input.playerId && item.status === 'active')
  let signed = updateGameWorld(world, { playerRights: Object.values(world.playerRightsById).map((item) => item.id === rights.id ? { ...item, contractId: contract.id } : item), contracts: [...Object.values(world.contractsById), contract], teams: Object.values(world.teams).map((team) => team.id === route.sourceTeamId ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== input.playerId) } : team.id === input.toTeamId ? { ...team, rosterPlayerIds: [...team.rosterPlayerIds, input.playerId] } : team), playerRegistrations: Object.values(world.playerRegistrationsById).map((registration) => registration.playerId === input.playerId && registration.endsOn === undefined ? { ...registration, endsOn: world.currentDate } : registration), lineupsByTeamId: lineupsAfterMove(world, input.playerId) })
  if (sourceEnrollment !== undefined) signed = endPlayerEnrollment(signed, sourceEnrollment.id)
  return recordTransition(signed, input.id, input.playerId, route, sourceKind === 'ncaaLike' ? 'ncaaToNbaDraft' : 'fibaToNba', input.toTeamId, 'nbaDraftRightsSigning', contract.id)
}

/** A final-pool undrafted Player enters the NBA free-agent market without new identity. */
export function signUndraftedPlayerToNba(world: GameWorld, input: Omit<ProfessionalTransitionInput, 'annualSalary' | 'contractYears'> & { readonly draftId: string }): GameWorld {
  if (world.ecosystemTransitionsById[input.id] !== undefined) return world
  const entry = world.draftsById[input.draftId]?.entries?.find((item) => item.playerId === input.playerId)
  if (entry?.status !== 'undrafted') throw new Error('Player must be recorded as undrafted before professional free agency')
  if (!isPlayerCareerActive(world, input.playerId)) throw new Error('Player career has ended')
  const sourceTeam = getCollegeOrRosterSourceTeam(world, input.playerId)
  const sourceKind = sourceTeam === undefined ? undefined : world.ecosystems[routeForTeams(world, sourceTeam.id, input.toTeamId).fromEcosystemId]?.kind
  if (sourceKind !== 'ncaaLike' && sourceKind !== 'fibaLike') throw new Error('Undrafted signing requires a college or international source Player')
  const route = requireRoute(world, input.playerId, input.toTeamId, sourceKind, 'nbaLike', sourceTeam)
  if (Object.values(world.contractsById).some((contract) => contract.playerId === input.playerId && ['active', 'scheduled'].includes(getPlayerContractStatus(contract, world.currentDate)))) throw new Error('Player has an active professional contract')
  const enrollment = Object.values(world.playerEnrollmentsById).find((item) => item.playerId === input.playerId && item.status === 'active')
  let available = detachSource(world, route.sourceTeamId, input.playerId)
  if (enrollment !== undefined) available = endPlayerEnrollment(available, enrollment.id)
  const signed = signFreeAgent(available, input.toTeamId, input.playerId)
  const marketContract = Object.values(signed.contractsById).find((contract) => contract.playerId === input.playerId && contract.teamId === input.toTeamId && contract.term.startsOn === world.currentDate && world.contractsById[contract.id] === undefined)
  return recordTransition(signed, input.id, input.playerId, route, sourceKind === 'ncaaLike' ? 'ncaaToNbaUndrafted' : 'fibaToNbaUndrafted', input.toTeamId, 'undraftedFreeAgency', marketContract?.id)
}
/** NCAA NIL remains historical data; FIBA receives a new professional contract. */
export function transitionNcaaPlayerToFiba(world: GameWorld, input: ProfessionalTransitionInput): GameWorld { return transitionProfessionalPlayer(world, input, 'ncaaLike', 'fibaLike', 'ncaaToFiba') }
/** A contracted international Player may change FIBA clubs without entering the NBA Draft. */
export function transitionFibaPlayerToFiba(world: GameWorld, input: ProfessionalTransitionInput): GameWorld { return transitionProfessionalPlayer(world, input, 'fibaLike', 'fibaLike', 'fibaToFiba') }
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
    if (Object.values(world.contractsById).some((contract) => contract.playerId === input.playerId && getPlayerContractStatus(contract, world.currentDate) === 'active')) return { ok: false, reason: 'ACTIVE_CONTRACT_REQUIRES_CANONICAL_TRANSITION' }
    if (target === undefined || target.rosterPlayerIds.includes(input.playerId)) return { ok: false, reason: 'INVALID_DESTINATION' }
    const route = routeForTeams(world, source.id, target.id)
    if (route.fromEcosystemId === route.toEcosystemId) return { ok: false, reason: 'INVALID_ECOSYSTEM_ROUTE' }
    const moved = updateGameWorld(world, { teams: Object.values(world.teams).map((team) => team.id === source.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== input.playerId) } : team.id === target.id ? { ...team, rosterPlayerIds: [...team.rosterPlayerIds, input.playerId] } : team), lineupsByTeamId: lineupsAfterMove(world, input.playerId) })
    return { ok: true, value: recordTransition(moved, input.id, input.playerId, { ...route, sourceTeamId: source.id }, input.transitionType, target.id, input.sourceSystem) }
  } catch { return { ok: false, reason: 'INVALID_ECOSYSTEM_ROUTE' } }
}

function transitionProfessionalPlayer(world: GameWorld, input: ProfessionalTransitionInput, originKind: 'ncaaLike' | 'fibaLike' | 'nbaLike', destinationKind: 'fibaLike' | 'nbaLike', transitionType: EcosystemTransitionType): GameWorld {
  if (world.ecosystemTransitionsById[input.id] !== undefined) return world
  if (!Number.isInteger(input.annualSalary) || input.annualSalary < 1 || !Number.isInteger(input.contractYears) || input.contractYears < 1) throw new Error('Professional transition terms are invalid')
  const route = requireRoute(world, input.playerId, input.toTeamId, originKind, destinationKind)
  const activeContracts = Object.values(world.contractsById).filter((contract) => contract.playerId === input.playerId && getPlayerContractStatus(contract, world.currentDate) === 'active')
  const internationalDraftRoute = originKind === 'fibaLike' && destinationKind === 'nbaLike'
  if (internationalDraftRoute && activeContracts.length > 0) throw new Error('International professional contract must be released before NBA entry')
  if (originKind === 'ncaaLike' && activeContracts.length > 0 || originKind !== 'ncaaLike' && !internationalDraftRoute && (activeContracts.length !== 1 || activeContracts[0]!.teamId !== route.sourceTeamId)) throw new Error('Player roster and active Contract state is not uniquely consistent for this transition')
  const sourceContract = Object.values(world.contractsById).find((contract) => contract.playerId === input.playerId && contract.teamId === route.sourceTeamId && getPlayerContractStatus(contract, world.currentDate) === 'active')
  if (originKind !== 'ncaaLike' && !internationalDraftRoute && sourceContract === undefined) throw new Error('Professional player cannot leave without an active contract')
  const destinationContract = createPlayerContract({ id: contractIdFromString(`contract:ecosystem-transition:${input.id}`), playerId: input.playerId, teamId: input.toTeamId, kind: 'standard', term: { startsOn: world.currentDate, expiresOn: addYears(world.currentDate, input.contractYears) }, compensation: { annualSalary: input.annualSalary } })
  const contracts = [...Object.values(world.contractsById).map((contract) => contract.id === sourceContract?.id ? { ...contract, termination: { terminatedOn: world.currentDate, reason: 'released' as const } } : contract), destinationContract]
  const moved = updateGameWorld(world, { teams: Object.values(world.teams).map((team) => team.id === route.sourceTeamId ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== input.playerId) } : team.id === input.toTeamId ? { ...team, rosterPlayerIds: [...team.rosterPlayerIds, input.playerId] } : team), contracts, lineupsByTeamId: lineupsAfterMove(world, input.playerId) })
  return recordTransition(moved, input.id, input.playerId, route, transitionType, input.toTeamId, 'professionalSigning', destinationContract.id)
}

function detachSource(world: GameWorld, sourceTeamId: TeamId, playerId: PlayerId): GameWorld { return updateGameWorld(world, { teams: Object.values(world.teams).map((team) => team.id === sourceTeamId ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== playerId) } : team), lineupsByTeamId: lineupsAfterMove(world, playerId) }) }
function lineupsAfterMove(world: GameWorld, playerId: PlayerId): GameWorld['lineupsByTeamId'] { return Object.fromEntries(Object.entries(world.lineupsByTeamId).map(([teamId, lineup]) => [teamId, clearPlayerFromLineup(lineup, playerId)])) }
function requireRoute(world: GameWorld, playerId: PlayerId, destinationTeamId: TeamId, originKind: 'ncaaLike' | 'fibaLike' | 'nbaLike', destinationKind: 'fibaLike' | 'nbaLike', sourceOverride?: GameWorld['teams'][TeamId]) { const source = sourceOverride ?? findRosterTeam(world, playerId); if (source === undefined) throw new Error('Player is not on an active roster'); if (source.id === destinationTeamId) throw new Error('Destination Team must differ from the Player\'s current Team'); const route = routeForTeams(world, source.id, destinationTeamId); const origin = world.ecosystems[route.fromEcosystemId], destination = world.ecosystems[route.toEcosystemId]; if (origin?.kind !== originKind || destination?.kind !== destinationKind || origin.category !== destination.category) throw new Error('Invalid ecosystem transition route'); return { ...route, sourceTeamId: source.id } }
function findRosterTeam(world: GameWorld, playerId: PlayerId) { return Object.values(world.teams).find((team) => team.rosterPlayerIds.includes(playerId)) }
/** Current roster is authoritative; an ended NCAA enrollment preserves a released graduate's source. */
export function getCollegeOrRosterSourceTeam(world: GameWorld, playerId: PlayerId) {
  const roster = findRosterTeam(world, playerId)
  if (roster) return roster
  const enrollment = Object.values(world.playerEnrollmentsById)
    .filter(item => item.playerId === playerId && item.status === 'ended' && item.endsOn !== undefined && item.endsOn <= world.currentDate && world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike' && world.teams[item.teamId] !== undefined)
    .sort((a, b) => b.endsOn!.localeCompare(a.endsOn!) || b.startsOn.localeCompare(a.startsOn) || a.id.localeCompare(b.id))[0]
  return enrollment === undefined ? undefined : world.teams[enrollment.teamId]
}
function routeForTeams(world: GameWorld, fromTeamId: TeamId, toTeamId: TeamId) { const fromEcosystemId = Object.values(world.competitions).find((competition) => competition.participantTeamIds.includes(fromTeamId))?.ecosystemId, toEcosystemId = Object.values(world.competitions).find((competition) => competition.participantTeamIds.includes(toTeamId))?.ecosystemId; if (fromEcosystemId === undefined || toEcosystemId === undefined) throw new Error('Teams must belong to ecosystems'); return { fromEcosystemId, toEcosystemId } }
function recordTransition(world: GameWorld, id: string, playerId: PlayerId, route: { readonly fromEcosystemId: EcosystemId; readonly toEcosystemId: EcosystemId; readonly sourceTeamId?: TeamId }, transitionType: EcosystemTransitionType, toTeamId: TeamId, sourceSystem: string, contractId?: string): GameWorld { const transition: EcosystemTransition = { id, playerId, fromEcosystemId: route.fromEcosystemId, toEcosystemId: route.toEcosystemId, fromTeamId: route.sourceTeamId, toTeamId, effectiveDate: world.currentDate, transitionType, sourceSystem, ...(contractId === undefined ? {} : { contractId }) }; return updateGameWorld(world, { ecosystemTransitions: [...Object.values(world.ecosystemTransitionsById), transition] }) }
export function getCrossEcosystemCandidates(world: GameWorld, toEcosystemId: string) { return Object.values(world.players).filter((player) => { const team = findRosterTeam(world, player.id); return team !== undefined && routeForTeams(world, team.id, team.id).fromEcosystemId !== toEcosystemId }) }
