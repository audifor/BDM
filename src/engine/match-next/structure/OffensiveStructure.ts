import type { CourtPosition } from '@/domain/court'
import { activePossession, type MatchPlayerState, type MatchState } from '../state'
import type { PlayerResponsibility, StructuralDecision, StructuralDecisionKind } from '../responsibility/Responsibility'
import type { MovementFacing, MovementIntent } from '../movement/MovementIntent'
import { attackingBasketForTeam, resolveBallSide, resolveFiveOutTargets, slotTargetsAreValid, type OffensiveSlotName, type OffensiveStructureState } from './FiveOutStructure'
import { assignFiveOutSlots } from './SlotAssignment'

export function reconcileOffensiveStructure(state: MatchState): MatchState {
  const possession = activePossession(state)
  const eligible = possession !== undefined
    && possession.phase !== 'INBOUND'
    && state.ball.kind !== 'DEAD'
    && state.ball.kind !== 'INBOUND'
  if (!possession || !eligible) {
    if (state.offensiveStructure === null && state.responsibilities.length === 0 && state.decisions.length === 0 && state.movementIntents.length === 0) return state
    return {
      ...state,
      offensiveStructure: null,
      responsibilities: state.responsibilities.filter((item) => item.owner === 'defensiveStructure'),
      decisions: state.decisions.filter((item) => item.owner === 'defensiveStructure'),
      movementIntents: state.movementIntents.filter((item) => item.provenance.owner === 'defensiveStructure'),
    }
  }

  const offense = state.players.filter((player) => player.active && player.teamId === possession.teamId)
  if (offense.length !== 5) return state
  const prior = state.offensiveStructure?.teamId === possession.teamId ? state.offensiveStructure : null
  const ballPlayerId = findBallPlayer(state, possession.teamId, prior)
  if (!ballPlayerId) return state
  const basket = attackingBasketForTeam(possession.teamId, state.homeTeamId, state.period, state.court)
  const ballPosition = state.ball.position
  const ballSide = resolveBallSide(ballPosition, state.court, prior?.ballSide)
  const targets = resolveFiveOutTargets(state.court, ballPosition, basket, ballSide)
  const spacePlayers = offense.filter((player) => player.playerId !== ballPlayerId)
  const ownerChanged = prior !== null && prior.ballPlayerId !== ballPlayerId
  const sideChanged = prior !== null && prior.ballSide !== ballSide
  const priorSpaceAssignments = prior?.assignments.filter((item) => item.slot !== 'BALL') ?? []
  const currentAssignments = sideChanged
    ? priorSpaceAssignments.map((item) => ({ ...item, slot: oppositeStrongWeakSlot(item.slot) }))
    : priorSpaceAssignments
  const assignmentsValid = currentAssignments.length === 4
    && new Set(currentAssignments.map((item) => item.playerId)).size === 4
    && new Set(currentAssignments.map((item) => item.slot)).size === 4
    && spacePlayers.every((player) => currentAssignments.some((item) => item.playerId === player.playerId))
  const reassign = prior === null || ownerChanged || sideChanged || !assignmentsValid
  const assignedSpaces = reassign
    ? assignFiveOutSlots(spacePlayers.map(({ playerId, position }) => ({ playerId, position })), targets, currentAssignments)
    : currentAssignments
  const assignments = [
    { playerId: ballPlayerId, slot: 'BALL' as const },
    ...assignedSpaces,
  ]
  const carriedAnchors = (prior?.continuityAnchors ?? []).flatMap((anchor) => {
    const assignment = assignedSpaces.find((item) => item.playerId === anchor.playerId)
    return assignment && assignment.slot !== 'BALL'
      ? [{ ...anchor, slot: assignment.slot }]
      : []
  })
  const newAnchorPlayer = ownerChanged ? spacePlayers.find((item) => item.playerId === prior?.ballPlayerId) : undefined
  const newAnchorAssignment = assignedSpaces.find((item) => item.playerId === newAnchorPlayer?.playerId)
  const newAnchor = newAnchorPlayer && newAnchorAssignment && newAnchorAssignment.slot !== 'BALL'
    ? { playerId: newAnchorPlayer.playerId, slot: newAnchorAssignment.slot, position: projectToThreePointArc(newAnchorPlayer.position, basket, state.court) }
    : undefined
  const anchorCandidates = newAnchor ? [...carriedAnchors, newAnchor] : carriedAnchors
  const continuityAnchors: NonNullable<OffensiveStructureState['continuityAnchors']>[number][] = []
  for (const candidate of anchorCandidates) {
    const proposed = [...continuityAnchors, candidate]
    const proposedTargets = targets.map((item) => {
      const anchor = proposed.find((entry) => entry.slot === item.slot)
      return anchor ? { ...item, position: anchor.position } : item
    })
    if (slotTargetsAreValid(proposedTargets, state.court)) continuityAnchors.push(candidate)
  }
  const anchoredTargets = targets.map((item) => {
    const anchor = continuityAnchors.find((entry) => entry.slot === item.slot)
    return anchor ? { ...item, position: anchor.position } : item
  })
  const structure: OffensiveStructureState = {
    teamId: possession.teamId,
    formation: '5OUT',
    attackingBasket: basket,
    ballSide,
    ballPlayerId,
    slots: continuityAnchors.length > 0 ? anchoredTargets : targets,
    assignments,
    ...(continuityAnchors.length > 0 ? { continuityAnchors } : {}),
    lastReassignmentT: reassign ? state.t : prior!.lastReassignmentT,
    setupStartedT: possession.phase === 'ADVANCE' ? prior?.setupStartedT ?? null : prior?.setupStartedT ?? state.t,
    reassignmentCount: (prior?.reassignmentCount ?? 0) + (reassign && prior ? 1 : 0),
  }

  const defensiveResponsibilities = state.responsibilities.filter((item) => item.owner === 'defensiveStructure')
  const defensiveDecisions = state.decisions.filter((item) => item.owner === 'defensiveStructure')
  const defensiveIntents = state.movementIntents.filter((item) => item.provenance.owner === 'defensiveStructure')
  const previousResponsibilities = new Map(state.responsibilities.filter((item) => item.owner !== 'defensiveStructure').map((item) => [item.playerId, item]))
  const previousDecisions = new Map(state.decisions.filter((item) => item.owner !== 'defensiveStructure').map((item) => [item.playerId, item]))
  let nextResponsibilitySequence = state.nextResponsibilitySequence
  let nextDecisionSequence = state.nextDecisionSequence
  const responsibilities: PlayerResponsibility[] = []
  const decisions: StructuralDecision[] = []
  const movementIntents: MovementIntent[] = []

  for (const player of offense) {
    const slot = assignments.find((item) => item.playerId === player.playerId)?.slot
    if (!slot) continue
    const kind = slot === 'BALL' ? possession.phase === 'ADVANCE' ? 'ADVANCE' : 'BALL' : 'SPACE'
    const owner = kind === 'BALL' || kind === 'ADVANCE' ? 'possession' : 'offensiveStructure'
    const oldResponsibility = previousResponsibilities.get(player.playerId)
    const sameResponsibility = oldResponsibility?.kind === kind && oldResponsibility.slot === (slot === 'BALL' ? undefined : slot) && oldResponsibility.owner === owner
    const responsibility: PlayerResponsibility = sameResponsibility
      ? oldResponsibility
      : {
          id: `responsibility-${nextResponsibilitySequence++}`,
          playerId: player.playerId,
          teamId: player.teamId,
          kind,
          owner,
          startedT: state.t,
          reason: kind === 'ADVANCE' ? 'Carry the live ball into the offensive frontcourt' : kind === 'BALL' ? 'Maintain the current ball-handler position' : `Occupy the ${slot.toLowerCase().replace('_', ' ')} 5-out space`,
          endCondition: { kind: kind === 'ADVANCE' ? 'phaseChanges' : slot === 'BALL' ? 'ballOwnerChanges' : 'slotChanges' },
          ...(slot === 'BALL' ? {} : { slot }),
        }
    responsibilities.push(responsibility)

    const decisionKind: StructuralDecisionKind = kind === 'ADVANCE' ? 'ADVANCE_BALL' : kind === 'SPACE' ? 'OCCUPY_SLOT' : 'HOLD_STRUCTURE'
    const oldDecision = previousDecisions.get(player.playerId)
    const decision = oldDecision?.responsibilityId === responsibility.id && oldDecision.kind === decisionKind
      ? oldDecision
      : {
          id: `decision-${nextDecisionSequence++}`,
          playerId: player.playerId,
          responsibilityId: responsibility.id,
          kind: decisionKind,
          owner: responsibility.owner,
          startedT: state.t,
          reason: decisionKind === 'ADVANCE_BALL' ? 'Default possession progression; no autonomous choice' : decisionKind === 'OCCUPY_SLOT' ? 'Default structural spacing; no autonomous choice' : 'Keep the current ball-handler position; no autonomous choice',
        }
    decisions.push(decision)

    const target = targetForResponsibility(state, player, responsibility, structure)
    const facing: MovementFacing = kind === 'SPACE' ? { kind: 'BALL' } : kind === 'ADVANCE' ? { kind: 'BASKET' } : { kind: 'BASKET' }
    movementIntents.push({
      playerId: player.playerId,
      target,
      urgency: 'run',
      facing,
      provenance: { responsibilityId: responsibility.id, decisionId: decision.id, owner: responsibility.owner },
    })
  }

  return {
    ...state,
    offensiveStructure: structure,
    responsibilities: [...responsibilities, ...defensiveResponsibilities],
    decisions: [...decisions, ...defensiveDecisions],
    movementIntents: [...movementIntents, ...defensiveIntents],
    nextResponsibilitySequence,
    nextDecisionSequence,
  }
}

function oppositeStrongWeakSlot(slot: OffensiveSlotName): OffensiveSlotName {
  switch (slot) {
    case 'STRONG_CORNER': return 'WEAK_CORNER'
    case 'STRONG_SLOT': return 'WEAK_SLOT'
    case 'WEAK_SLOT': return 'STRONG_SLOT'
    case 'WEAK_CORNER': return 'STRONG_CORNER'
    case 'BALL': return 'BALL'
  }
}

function projectToThreePointArc(position: CourtPosition, basket: CourtPosition, court: MatchState['court']): CourtPosition {
  const dx = position.x - basket.x
  const dy = position.y - basket.y
  const distance = Math.hypot(dx, dy)
  const fallbackDirection = basket.x >= court.lengthMeters / 2 ? -1 : 1
  const direction = distance > 1e-9 ? { x: dx / distance, y: dy / distance } : { x: fallbackDirection, y: 0 }
  const radius = court.threePointLine.arcRadiusMeters
  return {
    x: Math.max(0.5, Math.min(court.lengthMeters - 0.5, basket.x + direction.x * radius)),
    y: Math.max(0.5, Math.min(court.widthMeters - 0.5, basket.y + direction.y * radius)),
  }
}

export function advanceTarget(state: MatchState, basket: CourtPosition): CourtPosition {
  const direction = basket.x >= state.court.lengthMeters / 2 ? 1 : -1
  const center = state.court.lengthMeters / 2 + direction * 2
  return { x: Math.max(0.5, Math.min(state.court.lengthMeters - 0.5, center)), y: state.court.widthMeters / 2 }
}

export function isInOffensiveFrontcourt(position: CourtPosition, basket: CourtPosition, courtLength: number): boolean {
  const direction = basket.x >= courtLength / 2 ? 1 : -1
  return (position.x - courtLength / 2) * direction >= 0.5
}

function findBallPlayer(state: MatchState, teamId: MatchState['homeTeamId'], prior: OffensiveStructureState | null): MatchPlayerState['playerId'] | undefined {
  if (state.ball.kind === 'HELD' && state.ball.ownerTeamId === teamId) return state.ball.ownerPlayerId
  if (state.ball.kind === 'PASS_IN_FLIGHT' && state.ball.passerTeamId === teamId) return state.ball.passerPlayerId
  if (state.ball.kind === 'SHOT_IN_FLIGHT' && state.ball.shooterTeamId === teamId) return state.ball.shooterPlayerId
  if (prior && state.players.some((player) => player.playerId === prior.ballPlayerId && player.teamId === teamId)) return prior.ballPlayerId
  return state.players.find((player) => player.active && player.teamId === teamId)?.playerId
}

function targetForResponsibility(state: MatchState, player: MatchPlayerState, responsibility: PlayerResponsibility, structure: OffensiveStructureState): CourtPosition {
  if (responsibility.kind === 'ADVANCE') return advanceTarget(state, structure.attackingBasket)
  if (responsibility.kind === 'BALL') return { ...player.position }
  const assignment = structure.assignments.find((item) => item.playerId === player.playerId)
  const slot = structure.slots.find((item) => item.slot === assignment?.slot)
  return slot?.position ?? player.position
}
