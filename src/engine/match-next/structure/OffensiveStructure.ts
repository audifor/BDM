import { distanceBetween, type CourtPosition } from '@/domain/court'
import { activePossession, type MatchPlayerState, type MatchState } from '../state'
import type { PlayerResponsibility, StructuralDecision, StructuralDecisionKind } from '../responsibility/Responsibility'
import type { MovementFacing, MovementIntent } from '../movement/MovementIntent'
import { tuning } from '../tuning'
import { attackingBasketForTeam, resolveBallSide, resolveFiveOutTargets, slotTargetsAreValid, type OffensiveSlotName, type OffensiveStructureState } from './FiveOutStructure'
import { assignFiveOutSlots } from './SlotAssignment'
import { initiatorSpot, spacingFor } from '../tactics/PlayCalling'
import { tacticalIntent } from '../tactics/TacticalIdentity'

export function reconcileOffensiveStructure(state: MatchState): MatchState {
  if (state.responsibilities.some((item) => item.kind === 'PERIOD_RESTART')) return state
  if (state.ball.kind === 'LOOSE') return state
  const possession = activePossession(state)
  if (state.ball.kind === 'REBOUNDABLE'
    || state.transition !== null && possession?.teamId === state.transition.teamId && possession.phase !== 'SETUP') return state
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
  const spacePlayers = offense.filter((player) => player.playerId !== ballPlayerId)
  // BT5.8: the formation comes from the identity and the lineup; the post player has the block unless he has the ball.
  const wanted = spacingFor(state, possession.teamId)
  const postPlayerId = wanted.spacing === '4OUT1IN' && wanted.postPlayerId !== null && spacePlayers.some((player) => player.playerId === wanted.postPlayerId) ? wanted.postPlayerId : null
  const formation = postPlayerId === null ? '5OUT' as const : '4OUT1IN' as const
  const call = state.offenseFlow?.possessionId === possession.id ? state.offenseFlow.call : null
  const emptyCorner = formation === '5OUT' && call?.family === 'BALL_SCREEN' && call.location === 'EMPTY_CORNER'
  const targets = resolveFiveOutTargets(state.court, ballPosition, basket, ballSide, { post: formation === '4OUT1IN', emptyCorner })
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
  const formationChanged = prior !== null && prior.formation !== formation
  const postMisplaced = postPlayerId !== null && !currentAssignments.some((item) => item.playerId === postPlayerId && item.slot === 'POST')
  const reassign = prior === null || ownerChanged || sideChanged || !assignmentsValid || formationChanged || postMisplaced
  const assignedSpaces = reassign
    ? assignFiveOutSlots(spacePlayers.map(({ playerId, position }) => ({ playerId, position })), targets, formationChanged ? [] : currentAssignments, postPlayerId === null ? undefined : { playerId: postPlayerId, slot: 'POST' })
    : currentAssignments
  const assignments = [
    { playerId: ballPlayerId, slot: 'BALL' as const },
    ...assignedSpaces,
  ]
  const carriedAnchors = (prior?.continuityAnchors ?? []).flatMap((anchor) => {
    const assignment = assignedSpaces.find((item) => item.playerId === anchor.playerId)
    return assignment && assignment.slot !== 'BALL' && assignment.slot !== 'POST'
      ? [{ ...anchor, slot: assignment.slot }]
      : []
  })
  const newAnchorPlayer = ownerChanged ? spacePlayers.find((item) => item.playerId === prior?.ballPlayerId) : undefined
  const newAnchorAssignment = assignedSpaces.find((item) => item.playerId === newAnchorPlayer?.playerId)
  const newAnchor = newAnchorPlayer && newAnchorAssignment && newAnchorAssignment.slot !== 'BALL' && newAnchorAssignment.slot !== 'POST'
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
    formation,
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

  const tempo = tacticalIntent(state, possession.teamId).offense.tempo
  for (const player of offense) {
    const slot = assignments.find((item) => item.playerId === player.playerId)?.slot
    if (!slot) continue
    // The carrier brings the ball up whenever it is still in the backcourt, whatever phase the possession was marked as: a stopped
    // transition must not leave him standing in his own half (FIBA gives the team eight seconds to cross).
    const ballStillInBackcourt = tuning().backcourtCarryEnabled !== 0 && slot === 'BALL' && state.ball.kind === 'HELD' && state.ball.ownerPlayerId === player.playerId
      && !isInOffensiveFrontcourt(state.ball.position, structure.attackingBasket, state.court.lengthMeters)
    const kind = slot === 'BALL' ? possession.phase === 'ADVANCE' || ballStillInBackcourt ? 'ADVANCE' : 'BALL' : 'SPACE'
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
      // BT5.12: how fast the ball comes up is the team's tempo (a fast team sprints it up, a controlled one walks it into the set).
      urgency: kind === 'BALL' ? 'jog' : kind === 'ADVANCE' && tempo >= 0.6
        ? 'sprint'
        : kind === 'ADVANCE' && tempo <= -0.6 ? 'jog' : 'run',
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
    case 'POST': return 'POST'
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

/**
 * A carrier does not run straight into the man who is stopping him: when a defender stands ahead on his line he goes around him, on
 * the side with more room, and takes the line again once he is past (the target is re-read every tick).
 */
const AVOID_LOOKAHEAD_METERS = 4.5
const AVOID_HALF_WIDTH_METERS = 1.6
const AVOID_SIDE_STEP_METERS = 2.3
function steerAroundDefender(state: MatchState, player: MatchPlayerState, target: CourtPosition): CourtPosition {
  const dx = target.x - player.position.x
  const dy = target.y - player.position.y
  const length = Math.hypot(dx, dy)
  if (length < 1e-6) return target
  const h = { x: dx / length, y: dy / length }
  const n = { x: -h.y, y: h.x }
  let blocker: { along: number; cross: number } | undefined
  for (const other of state.players) {
    if (!other.active || other.teamId === player.teamId) continue
    const rx = other.position.x - player.position.x
    const ry = other.position.y - player.position.y
    const along = rx * h.x + ry * h.y
    const cross = rx * n.x + ry * n.y
    if (along <= 0 || along > AVOID_LOOKAHEAD_METERS || Math.abs(cross) > AVOID_HALF_WIDTH_METERS) continue
    if (blocker === undefined || along < blocker.along) blocker = { along, cross }
  }
  if (blocker === undefined) return target
  const side = Math.abs(blocker.cross) > 0.25 ? (blocker.cross > 0 ? -1 : 1) : (player.position.y > state.court.widthMeters / 2 ? -1 : 1) * (n.y >= 0 ? 1 : -1)
  const ahead = Math.max(blocker.along, 1.5)
  return {
    x: Math.max(0.5, Math.min(state.court.lengthMeters - 0.5, player.position.x + h.x * ahead + n.x * side * AVOID_SIDE_STEP_METERS)),
    y: Math.max(0.5, Math.min(state.court.widthMeters - 0.5, player.position.y + h.y * ahead + n.y * side * AVOID_SIDE_STEP_METERS)),
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
  if (prior && state.players.some((player) => player.active && player.playerId === prior.ballPlayerId && player.teamId === teamId)) return prior.ballPlayerId
  return state.players.find((player) => player.active && player.teamId === teamId)?.playerId
}

/**
 * BT2C: a slot is a ZONE, not a rail. A player who is already inside it stays where he is (no micro-corrections on
 * every tick); one who is outside heads for the nearest edge of the zone rather than its exact centre.
 */
export const ZONE_TOLERANCE_METERS = 1.5
/** A zone never reaches in front of its slot (that would put a shooter inside the arc). */
const ZONE_DEPTH_TOLERANCE_METERS = 0.35

export function isInsideZone(position: CourtPosition, slot: CourtPosition, basket: CourtPosition): boolean {
  if (distanceBetween(position, slot) > ZONE_TOLERANCE_METERS) return false
  return distanceBetween(position, basket) >= distanceBetween(slot, basket) - ZONE_DEPTH_TOLERANCE_METERS
}

function zoneTarget(position: CourtPosition, slot: CourtPosition, basket: CourtPosition): CourtPosition {
  if (isInsideZone(position, slot, basket)) return { ...position }
  const distance = distanceBetween(position, slot)
  if (distance <= ZONE_TOLERANCE_METERS * 0.6) return { ...slot }
  const edge = ZONE_TOLERANCE_METERS * 0.6
  return { x: slot.x + (position.x - slot.x) / distance * edge, y: slot.y + (position.y - slot.y) / distance * edge }
}

function targetForResponsibility(state: MatchState, player: MatchPlayerState, responsibility: PlayerResponsibility, structure: OffensiveStructureState): CourtPosition {
  if (responsibility.kind === 'ADVANCE') return steerAroundDefender(state, player, advanceTarget(state, structure.attackingBasket))
  if (responsibility.kind === 'BALL') {
    // BT4.3: until the floor is set the handler walks the ball to where the play starts (top of the key, on his side), instead of standing where the carry ended.
    const set = state.offenseFlow === null || state.offenseFlow.settledAtT !== null
    const inFrontcourt = isInOffensiveFrontcourt(state.ball.position, structure.attackingBasket, state.court.lengthMeters)
    if (tuning().playsEnabled !== 0 && !set && inFrontcourt) {
      // BT5.7: where the play starts depends on the call (top for a high screen, the wing for a side screen, a pin-down or an entry).
      const call = state.offenseFlow?.teamId === player.teamId ? state.offenseFlow.call : null
      const spot = initiatorSpot(state, player.teamId, call, player)
      return distanceBetween(player.position, spot) < 0.8 ? { ...player.position } : steerAroundDefender(state, player, spot)
    }
    return { ...player.position }
  }
  const assignment = structure.assignments.find((item) => item.playerId === player.playerId)
  const slot = structure.slots.find((item) => item.slot === assignment?.slot)
  return slot === undefined ? player.position : zoneTarget(player.position, slot.position, structure.attackingBasket)
}
