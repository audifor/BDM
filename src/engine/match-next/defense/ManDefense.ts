import { distanceBetween, type CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import { emitEvent } from '../events'
import { activePossession, type DefensiveAssignment, type DefensiveStructureState, type MatchPlayerState, type MatchState } from '../state'
import type { DefensiveDecisionKind, DefensiveResponsibilityKind, PlayerResponsibility, StructuralDecision } from '../responsibility/Responsibility'
import type { MovementFacing, MovementIntent, MovementUrgency } from '../movement/MovementIntent'
import { attackingBasketForTeam } from '../structure/FiveOutStructure'

const ONE_PASS_AWAY_METERS = 7
const ON_BALL_CUSHION_METERS = 1.05
const GAP_DEPTH_METERS = 0.9
const GAP_SHADE_METERS = 0.65
const HELP_DEPTH_METERS = 1.5
const HELP_SHADE_METERS = 2.2
const RECOVER_START_METERS = 1.0
const RECOVER_END_METERS = 0.6

/** Reconciles one possession's assignments and defensive structure without changing player positions. */
export function reconcileManDefense(input: MatchState): MatchState {
  const possession = activePossession(input)
  if (!possession || input.ball.kind === 'DEAD') return clearDefensiveState(input)

  const defendingTeamId = possession.teamId === input.homeTeamId ? input.awayTeamId : input.homeTeamId
  const defenders = input.players.filter((player) => player.active && player.teamId === defendingTeamId)
  const attackers = input.players.filter((player) => player.active && player.teamId === possession.teamId)
  if (defenders.length !== 5 || attackers.length !== 5) return clearDefensiveState(input)

  const prior = input.defensiveStructure?.teamId === defendingTeamId ? input.defensiveStructure : null
  const assignmentsValid = prior !== null && areAssignmentsValid(prior.assignments, defenders, attackers)
  const assignments = assignmentsValid
    ? prior.assignments
    : createAssignments(input, defenders, attackers, prior !== null || input.defensiveStructure !== null)
  let state = input
  if (!assignmentsValid) {
    state = emitEvent(state, 'defensiveAssignmentsEstablished', { teamId: defendingTeamId })
  }

  const defendedBasket = attackingBasketForTeam(possession.teamId, state.homeTeamId, state.period, state.court)
  const nonReactiveBallPhase = state.ball.kind === 'SHOT_IN_FLIGHT' || state.ball.kind === 'REBOUNDABLE' || state.ball.kind === 'LOOSE'
  if (nonReactiveBallPhase && prior !== null) return state

  const liveDefense = possession.phase !== 'INBOUND'
    && state.ball.kind !== 'INBOUND'
    && state.ball.kind !== 'DEAD'
  const ballHandlerId = currentOrPriorHandler(state, possession.teamId)
  const onBallAssignment = ballHandlerId === null ? undefined : assignments.find((item) => item.attackerPlayerId === ballHandlerId)
  const playerById = new Map(state.players.map((player) => [player.playerId, player]))
  const activeDrive = state.actions.find((action) => action.kind === 'DRIVE' && action.status === 'ACTIVE')
  const driveHelperDefenderId = activeDrive && ballHandlerId === activeDrive.playerId
    ? assignments.filter((item) => item.attackerPlayerId !== ballHandlerId)
      .map((item) => ({ item, attacker: playerById.get(item.attackerPlayerId) }))
      .filter((entry): entry is { item: DefensiveAssignment; attacker: MatchPlayerState } => entry.attacker !== undefined)
      .sort((left, right) => distanceBetween(right.attacker.position, state.ball.position) - distanceBetween(left.attacker.position, state.ball.position)
        || String(left.item.defenderPlayerId).localeCompare(String(right.item.defenderPlayerId)))[0]?.item.defenderPlayerId
    : undefined
  const previousResponsibilities = new Map(state.responsibilities.filter((item) => item.owner === 'defensiveStructure').map((item) => [item.playerId, item]))
  const previousDecisions = new Map(state.decisions.filter((item) => item.owner === 'defensiveStructure').map((item) => [item.playerId, item]))
  const nextResponsibilitySequenceStart = state.nextResponsibilitySequence
  const nextDecisionSequenceStart = state.nextDecisionSequence
  let nextResponsibilitySequence = nextResponsibilitySequenceStart
  let nextDecisionSequence = nextDecisionSequenceStart
  const responsibilities: PlayerResponsibility[] = []
  const decisions: StructuralDecision[] = []
  const intents: MovementIntent[] = []
  const assignmentByDefender = new Map(assignments.map((item) => [item.defenderPlayerId, item]))

  if (liveDefense) {
    for (const defender of defenders) {
      const assignment = assignmentByDefender.get(defender.playerId)
      const attacker = assignment === undefined ? undefined : playerById.get(assignment.attackerPlayerId)
      if (!assignment || !attacker) continue
      const previous = previousResponsibilities.get(defender.playerId)
      const baseKind: DefensiveResponsibilityKind = assignment.attackerPlayerId === ballHandlerId
        ? 'ON_BALL'
        : defender.playerId === driveHelperDefenderId
          ? 'HELP'
          : distanceBetween(attacker.position, state.ball.position) <= ONE_PASS_AWAY_METERS ? 'GAP' : 'HELP'
      const baseTarget = guardPosition(attacker.position, state.ball.position, defendedBasket, baseKind, state.court)
      let kind: DefensiveResponsibilityKind = baseKind
      let recoveryTarget: 'GAP' | 'HELP' | undefined
      if (baseKind === 'GAP' && previous?.kind === 'HELP' && distanceBetween(defender.position, baseTarget) > RECOVER_START_METERS) {
        kind = 'RECOVER'
        recoveryTarget = 'GAP'
      } else if (baseKind === 'GAP' && previous?.kind === 'RECOVER' && previous.recoveryTarget === 'GAP' && distanceBetween(defender.position, baseTarget) > RECOVER_END_METERS) {
        kind = 'RECOVER'
        recoveryTarget = 'GAP'
      } else if (baseKind === 'HELP' && previous?.kind === 'RECOVER' && previous.recoveryTarget === 'HELP' && distanceBetween(defender.position, baseTarget) > RECOVER_END_METERS) {
        kind = 'RECOVER'
        recoveryTarget = 'HELP'
      }
      const responsibilityTargetKind = kind === 'RECOVER' ? recoveryTarget! : kind
      const responsibility = previous?.kind === kind && previous.recoveryTarget === recoveryTarget
        ? previous
        : {
            id: `responsibility-${nextResponsibilitySequence++}`,
            playerId: defender.playerId,
            teamId: defender.teamId,
            kind,
            owner: 'defensiveStructure' as const,
            startedT: state.t,
            reason: kind === 'ON_BALL' ? 'Guard the current ball handler' : kind === 'GAP' ? 'Stay connected to the assigned man while shading the ball' : kind === 'HELP' ? 'Show help from the weak side while retaining the assignment' : 'Recover physically to the assigned man’s current guard position',
            endCondition: { kind: 'possessionEnds' as const },
            ...(kind === 'RECOVER' ? { recoveryTarget } : {}),
          }
      responsibilities.push(responsibility)

      const decisionKind: DefensiveDecisionKind = possession.phase === 'ADVANCE'
        ? 'RETREAT_TO_DEFENSE'
        : kind === 'ON_BALL' ? 'GUARD_BALL' : kind === 'GAP' ? 'GUARD_GAP' : kind === 'HELP' ? 'HELP_POSITION' : 'RECOVER_TO_MAN'
      const oldDecision = previousDecisions.get(defender.playerId)
      const decision = oldDecision?.responsibilityId === responsibility.id && oldDecision.kind === decisionKind
        ? oldDecision
        : {
            id: `decision-${nextDecisionSequence++}`,
            playerId: defender.playerId,
            responsibilityId: responsibility.id,
            kind: decisionKind,
            owner: 'defensiveStructure' as const,
            startedT: state.t,
            reason: decisionKind === 'RETREAT_TO_DEFENSE' ? 'Set the assigned man-side before half-court structure' : decisionKind === 'GUARD_BALL' ? 'Stay between the handler and the defended basket' : decisionKind === 'GUARD_GAP' ? 'Shade toward the ball without losing the assigned man' : decisionKind === 'HELP_POSITION' ? 'Move into recoverable ball-side help' : 'Return physically to the normal guard position',
          }
      decisions.push(decision)

      const target = guardPosition(attacker.position, state.ball.position, defendedBasket, responsibilityTargetKind, state.court)
      const distanceToTarget = distanceBetween(defender.position, target)
      const urgency: MovementUrgency = kind === 'RECOVER' && distanceToTarget > 3.5 ? 'sprint' : 'run'
      const facing: MovementFacing = { kind: 'BALL' }
      intents.push({
        playerId: defender.playerId,
        target,
        urgency,
        facing,
        provenance: { responsibilityId: responsibility.id, decisionId: decision.id, owner: 'defensiveStructure' },
      })
      if (previous?.kind !== kind) state = emitEvent(state, 'defensiveResponsibilityChanged', { teamId: defender.teamId, playerId: defender.playerId, responsibilityKind: kind })
    }
  }

  const onBallDefenderPlayerId = onBallAssignment?.defenderPlayerId ?? null
  const calculatedHelpDefenders = responsibilities.filter((item) => item.kind === 'HELP').map((item) => item.playerId)
  const helpDefenderPlayerIds = prior && sameIds(prior.helpDefenderPlayerIds, calculatedHelpDefenders) ? prior.helpDefenderPlayerIds : calculatedHelpDefenders
  const structure: DefensiveStructureState = prior
    && assignments === prior.assignments
    && prior.defendedBasket.x === defendedBasket.x
    && prior.defendedBasket.y === defendedBasket.y
    && prior.onBallDefenderPlayerId === onBallDefenderPlayerId
    && helpDefenderPlayerIds === prior.helpDefenderPlayerIds
    ? prior
    : { teamId: defendingTeamId, scheme: 'MAN', defendedBasket, assignments, onBallDefenderPlayerId, helpDefenderPlayerIds }
  return {
    ...state,
    defensiveStructure: structure,
    responsibilities: [...state.responsibilities.filter((item) => item.owner !== 'defensiveStructure'), ...responsibilities],
    decisions: [...state.decisions.filter((item) => item.owner !== 'defensiveStructure'), ...decisions],
    movementIntents: [...state.movementIntents.filter((item) => item.provenance.owner !== 'defensiveStructure'), ...intents],
    nextResponsibilitySequence,
    nextDecisionSequence,
  }
}

/** Positions a defender from live man/ball/basket geometry, never an offensive slot target. */
export function guardPosition(
  attackerPosition: CourtPosition,
  ballPosition: CourtPosition,
  defendedBasket: CourtPosition,
  responsibility: 'ON_BALL' | 'GAP' | 'HELP',
  court: MatchState['court'],
): CourtPosition {
  const basketSideFallback = { x: defendedBasket.x >= court.lengthMeters / 2 ? -1 : 1, y: 0 }
  const towardBasket = unitVector({ x: defendedBasket.x - attackerPosition.x, y: defendedBasket.y - attackerPosition.y }, basketSideFallback)
  const towardBall = unitVector({ x: ballPosition.x - attackerPosition.x, y: ballPosition.y - attackerPosition.y }, { x: 0, y: 0 })
  const basketDistance = distanceBetween(attackerPosition, defendedBasket)
  const depth = responsibility === 'ON_BALL' ? Math.min(ON_BALL_CUSHION_METERS, Math.max(0, basketDistance - 0.45))
    : responsibility === 'GAP' ? Math.min(GAP_DEPTH_METERS, Math.max(0, basketDistance - 0.6))
      : Math.min(HELP_DEPTH_METERS, Math.max(0, basketDistance - 0.6))
  const ballLateral = (ballPosition.x - attackerPosition.x) * -towardBasket.y + (ballPosition.y - attackerPosition.y) * towardBasket.x
  const shade = responsibility === 'ON_BALL' ? clamp(ballLateral * 0.05, -0.12, 0.12)
    : responsibility === 'GAP' ? GAP_SHADE_METERS : responsibility === 'HELP' ? HELP_SHADE_METERS : 0
  const target = {
    x: attackerPosition.x + towardBasket.x * depth + (responsibility === 'ON_BALL' ? -towardBasket.y : towardBall.x) * shade,
    y: attackerPosition.y + towardBasket.y * depth + (responsibility === 'ON_BALL' ? towardBasket.x : towardBall.y) * shade,
  }
  return { x: clamp(target.x, 0.15, court.lengthMeters - 0.15), y: clamp(target.y, 0.15, court.widthMeters - 0.15) }
}

function createAssignments(state: MatchState, defenders: readonly MatchPlayerState[], attackers: readonly MatchPlayerState[], structural: boolean): readonly DefensiveAssignment[] {
  const defenseTeam = defenders[0]!.teamId
  const overrides = defenseTeam === state.homeTeamId ? state.defensiveMatchupOverrides.home : state.defensiveMatchupOverrides.away
  const defenderIds = new Set(defenders.map((player) => player.playerId))
  const attackerIds = new Set(attackers.map((player) => player.playerId))
  const selectedDefenders = new Set<PlayerId>()
  const selectedAttackers = new Set<PlayerId>()
  const assignmentByDefender = new Map<PlayerId, DefensiveAssignment>()
  for (const override of overrides) {
    if (!defenderIds.has(override.playerId) || !attackerIds.has(override.opponentPlayerId)) continue
    selectedDefenders.add(override.playerId)
    selectedAttackers.add(override.opponentPlayerId)
    assignmentByDefender.set(override.playerId, {
      defenderPlayerId: override.playerId,
      attackerPlayerId: override.opponentPlayerId,
      teamId: defenseTeam,
      startedT: state.t,
      source: 'OVERRIDE',
    })
  }

  const remainingDefenders = defenders.filter((player) => !selectedDefenders.has(player.playerId)).sort(comparePlayerId)
  const remainingAttackers = attackers.filter((player) => !selectedAttackers.has(player.playerId)).sort(comparePlayerId)
  const best = minimumCostMatching(remainingDefenders, remainingAttackers)
  for (const [defender, attacker] of best) assignmentByDefender.set(defender.playerId, {
    defenderPlayerId: defender.playerId,
    attackerPlayerId: attacker.playerId,
    teamId: defenseTeam,
    startedT: state.t,
    source: structural ? 'STRUCTURAL_REASSIGNMENT' : 'INITIAL',
  })
  return defenders.slice().sort(comparePlayerId).map((defender) => assignmentByDefender.get(defender.playerId)!)
}

function minimumCostMatching(defenders: readonly MatchPlayerState[], attackers: readonly MatchPlayerState[]): readonly (readonly [MatchPlayerState, MatchPlayerState])[] {
  let bestCost = Number.POSITIVE_INFINITY
  let bestPairs: readonly (readonly [MatchPlayerState, MatchPlayerState])[] = []
  const visit = (index: number, remaining: readonly MatchPlayerState[], pairs: readonly (readonly [MatchPlayerState, MatchPlayerState])[], cost: number) => {
    if (index === defenders.length) {
      if (cost < bestCost - 1e-9 || Math.abs(cost - bestCost) <= 1e-9 && lexicographicallyBefore(pairs, bestPairs)) {
        bestCost = cost
        bestPairs = pairs
      }
      return
    }
    const defender = defenders[index]!
    for (let candidateIndex = 0; candidateIndex < remaining.length; candidateIndex += 1) {
      const attacker = remaining[candidateIndex]!
      visit(index + 1, remaining.filter((_, itemIndex) => itemIndex !== candidateIndex), [...pairs, [defender, attacker]], cost + matchupCost(defender, attacker))
    }
  }
  visit(0, attackers, [], 0)
  return bestPairs
}

function matchupCost(defender: MatchPlayerState, attacker: MatchPlayerState): number {
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'] as const
  const positionCost = Math.abs(positions.indexOf(defender.primaryPosition) - positions.indexOf(attacker.primaryPosition)) * 0.8
  const heightCost = Math.abs(defender.heightCm - attacker.heightCm) / 100 * 0.12
  const mobilityCost = Math.abs(defender.defensiveMobility - attacker.defensiveMobility) / 100 * 0.35
  return positionCost + heightCost + mobilityCost
}

function areAssignmentsValid(assignments: readonly DefensiveAssignment[], defenders: readonly MatchPlayerState[], attackers: readonly MatchPlayerState[]): boolean {
  const defenderIds = new Set(assignments.map((item) => item.defenderPlayerId))
  const attackerIds = new Set(assignments.map((item) => item.attackerPlayerId))
  return assignments.length === 5
    && defenderIds.size === 5
    && attackerIds.size === 5
    && defenders.every((player) => defenderIds.has(player.playerId))
    && attackers.every((player) => attackerIds.has(player.playerId))
    && assignments.every((item) => item.teamId === defenders[0]!.teamId)
}

function clearDefensiveState(state: MatchState): MatchState {
  if (state.defensiveStructure === null
    && state.responsibilities.every((item) => item.owner !== 'defensiveStructure')
    && state.decisions.every((item) => item.owner !== 'defensiveStructure')
    && state.movementIntents.every((item) => item.provenance.owner !== 'defensiveStructure')) return state
  return {
    ...state,
    defensiveStructure: null,
    responsibilities: state.responsibilities.filter((item) => item.owner !== 'defensiveStructure'),
    decisions: state.decisions.filter((item) => item.owner !== 'defensiveStructure'),
    movementIntents: state.movementIntents.filter((item) => item.provenance.owner !== 'defensiveStructure'),
  }
}

function currentOrPriorHandler(state: MatchState, offenseTeamId: TeamId): PlayerId | null {
  if (state.ball.kind === 'HELD' && state.ball.ownerTeamId === offenseTeamId) return state.ball.ownerPlayerId
  if (state.ball.kind === 'PASS_IN_FLIGHT' && state.ball.passerTeamId === offenseTeamId) return state.ball.passerPlayerId
  if (state.ball.kind === 'SHOT_IN_FLIGHT' && state.ball.shooterTeamId === offenseTeamId) return state.ball.shooterPlayerId
  if (state.ball.kind === 'REBOUNDABLE' && state.ball.shootingTeamId === offenseTeamId) return state.ball.shotByPlayerId
  if (state.offensiveStructure?.teamId === offenseTeamId) return state.offensiveStructure.ballPlayerId
  return null
}

function unitVector(vector: CourtPosition, fallback: CourtPosition): CourtPosition {
  const magnitude = Math.hypot(vector.x, vector.y)
  if (magnitude > 1e-9) return { x: vector.x / magnitude, y: vector.y / magnitude }
  return fallback
}

function comparePlayerId(left: MatchPlayerState, right: MatchPlayerState): number {
  return String(left.playerId).localeCompare(String(right.playerId))
}

function lexicographicallyBefore(left: readonly (readonly [MatchPlayerState, MatchPlayerState])[], right: readonly (readonly [MatchPlayerState, MatchPlayerState])[]): boolean {
  if (right.length === 0) return true
  const leftKey = left.map((pair) => String(pair[1].playerId)).join('\u0000')
  const rightKey = right.map((pair) => String(pair[1].playerId)).join('\u0000')
  return leftKey.localeCompare(rightKey) < 0
}

function sameIds(left: readonly PlayerId[], right: readonly PlayerId[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
