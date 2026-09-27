import { distanceBetween, type CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import { emitEvent } from '../events'
import { activePossession, type DefensiveAssignment, type DefensiveHelpDecision, type DefensiveStructureState, type MatchPlayerState, type MatchState } from '../state'
import type { DefensiveDecisionKind, DefensiveResponsibilityKind, PlayerResponsibility, StructuralDecision } from '../responsibility/Responsibility'
import type { MovementFacing, MovementIntent, MovementUrgency } from '../movement/MovementIntent'
import { attackingBasketForTeam } from '../structure/FiveOutStructure'

const ON_BALL_CUSHION_METERS = 1.05
const GAP_DEPTH_METERS = 0.9
const GAP_SHADE_METERS = 0.65
const HELP_DEPTH_METERS = 1.5
const HELP_SHADE_METERS = 2.2
const RECOVER_START_METERS = 1.0
const RECOVER_END_METERS = 0.6
const DRIVE_PAINT_THREAT_METERS = 4.8

/** Reconciles one possession's assignments and defensive structure without changing player positions. */
export function reconcileManDefense(input: MatchState): MatchState {
  if (input.responsibilities.some((item) => item.kind === 'PERIOD_RESTART')) return input
  const possession = activePossession(input)
  if (input.ball.kind === 'REBOUNDABLE'
    || input.transition !== null && possession?.teamId === input.transition.teamId && possession.phase !== 'SETUP') return input
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
  const defensiveTactics = defendingTeamId === state.homeTeamId ? state.tacticalPlans.home.defense : state.tacticalPlans.away.defense
  const nonReactiveBallPhase = state.ball.kind === 'SHOT_IN_FLIGHT' || state.ball.kind === 'REBOUNDABLE' || state.ball.kind === 'LOOSE'
  if (nonReactiveBallPhase && prior !== null) return state

  const liveDefense = possession.phase !== 'INBOUND'
    && state.ball.kind !== 'INBOUND'
    && state.ball.kind !== 'DEAD'
  const ballHandlerId = currentOrPriorHandler(state, possession.teamId)
  const onBallAssignment = ballHandlerId === null ? undefined : assignments.find((item) => item.attackerPlayerId === ballHandlerId)
  const playerById = new Map(state.players.map((player) => [player.playerId, player]))
  const activeDrive = state.actions.find((action) => action.kind === 'DRIVE' && action.status === 'ACTIVE')
  const helpDecision = resolveDriveHelpDecision(state, assignments, playerById, ballHandlerId, activeDrive, prior?.helpDecision, defendedBasket)
  const driveHelperDefenderId = helpDecision.helperPlayerId
  const rotationByDefender = new Map(helpDecision.rotations.map((rotation) => [rotation.playerId, rotation]))
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
      const rotation = rotationByDefender.get(defender.playerId)
      const baseKind: DefensiveResponsibilityKind = assignment.attackerPlayerId === ballHandlerId
        ? 'ON_BALL'
        : defender.playerId === driveHelperDefenderId
          ? helpDecision.helperKind ?? 'HELP'
          : rotation?.kind ?? 'GAP'
      const rotationTarget = rotation ? rotationTargetPosition(rotation, playerById, state.ball.position, defendedBasket, state.court, defensiveTactics) : undefined
      const guardKind: 'ON_BALL' | 'GAP' | 'HELP' = baseKind === 'LOW_MAN' ? 'HELP'
        : baseKind === 'ROTATE' || baseKind === 'X_OUT' ? 'GAP' : baseKind
      const baseTarget = rotationTarget ?? guardPosition(attacker.position, state.ball.position, defendedBasket, guardKind, state.court, defensiveTactics)
      let kind: DefensiveResponsibilityKind = baseKind
      let recoveryTarget: 'GAP' | 'HELP' | undefined
      if (baseKind === 'GAP' && (previous?.kind === 'HELP' || previous?.kind === 'LOW_MAN') && distanceBetween(defender.position, baseTarget) > RECOVER_START_METERS) {
        kind = 'RECOVER'
        recoveryTarget = 'GAP'
      } else if (baseKind === 'GAP' && previous?.kind === 'RECOVER' && previous.recoveryTarget === 'GAP' && distanceBetween(defender.position, baseTarget) > RECOVER_END_METERS) {
        kind = 'RECOVER'
        recoveryTarget = 'GAP'
      } else if (baseKind === 'HELP' && previous?.kind === 'RECOVER' && previous.recoveryTarget === 'HELP' && distanceBetween(defender.position, baseTarget) > RECOVER_END_METERS) {
        kind = 'RECOVER'
        recoveryTarget = 'HELP'
      }
      const responsibilityTargetKind: 'ON_BALL' | 'GAP' | 'HELP' = kind === 'RECOVER' ? recoveryTarget!
        : kind === 'LOW_MAN' ? 'HELP' : kind === 'ROTATE' || kind === 'X_OUT' ? 'GAP' : kind
      const responsibility = previous?.kind === kind && previous.recoveryTarget === recoveryTarget
        ? previous
        : {
            id: `responsibility-${nextResponsibilitySequence++}`,
            playerId: defender.playerId,
            teamId: defender.teamId,
            kind,
            owner: 'defensiveStructure' as const,
            startedT: state.t,
            reason: kind === 'ON_BALL' ? 'Contain the ball handler from the basket side'
              : kind === 'GAP' ? 'Stay connected to the assigned man while shading the ball'
                : kind === 'HELP' || kind === 'LOW_MAN' ? helpDecision.reason
                  : kind === 'ROTATE' ? 'Rotate to cover the low-man helper’s vacated assignment'
                    : kind === 'X_OUT' ? 'Split the next two open assignments after the help rotation'
                      : 'Recover physically to the assigned man’s current guard position',
            endCondition: { kind: 'possessionEnds' as const },
            ...(kind === 'RECOVER' ? { recoveryTarget } : {}),
          }
      responsibilities.push(responsibility)

      const decisionKind: DefensiveDecisionKind = possession.phase === 'ADVANCE'
        ? 'RETREAT_TO_DEFENSE'
        : kind === 'ON_BALL' ? 'GUARD_BALL'
          : kind === 'GAP' ? 'GUARD_GAP'
            : kind === 'HELP' || kind === 'LOW_MAN' ? 'HELP_POSITION'
              : kind === 'ROTATE' ? 'ROTATE_TO_HELP_MAN'
                : kind === 'X_OUT' ? 'X_OUT_TWO_MAN' : 'RECOVER_TO_MAN'
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
            reason: decisionKind === 'RETREAT_TO_DEFENSE' ? 'Set the assigned man-side before half-court structure'
              : decisionKind === 'GUARD_BALL' ? 'Stay between the handler and the defended basket'
                : decisionKind === 'GUARD_GAP' ? 'Shade toward the ball without losing the assigned man'
                  : decisionKind === 'HELP_POSITION' ? helpDecision.reason
                    : decisionKind === 'ROTATE_TO_HELP_MAN' ? 'Cover the helper’s abandoned assignment'
                      : decisionKind === 'X_OUT_TWO_MAN' ? 'Split the open perimeter assignments'
                        : 'Return physically to the normal guard position',
          }
      decisions.push(decision)

      const target = kind === 'HELP' || kind === 'LOW_MAN'
        ? guardPosition(handlerPosition(state, ballHandlerId, attacker.position), state.ball.position, defendedBasket, 'HELP', state.court, defensiveTactics)
        : rotationTarget ?? guardPosition(attacker.position, state.ball.position, defendedBasket, responsibilityTargetKind, state.court, defensiveTactics)
      const distanceToTarget = distanceBetween(defender.position, target)
      const handler = ballHandlerId === null ? undefined : playerById.get(ballHandlerId)
      const isContainingDrive = kind === 'ON_BALL' && activeDrive?.playerId === ballHandlerId
      const containmentMatchup = handler === undefined ? 0
        : defender.defense.pointOfAttack + defender.defense.mobility - handler.offense.rimAttack - handler.offense.creation
      const urgentRotation = (kind === 'HELP' || kind === 'LOW_MAN' || kind === 'ROTATE' || kind === 'X_OUT' || kind === 'RECOVER')
        && distanceToTarget > 2
      const urgency: MovementUrgency = isContainingDrive
        ? containmentMatchup >= 0 ? 'sprint' : 'run'
        : (possession.phase === 'ADVANCE' && distanceToTarget > 2) || urgentRotation ? 'run' : 'jog'
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
  const calculatedHelpDefenders = responsibilities.filter((item) => item.kind === 'HELP' || item.kind === 'LOW_MAN').map((item) => item.playerId)
  const helpDefenderPlayerIds = prior && sameIds(prior.helpDefenderPlayerIds, calculatedHelpDefenders) ? prior.helpDefenderPlayerIds : calculatedHelpDefenders
  const structure: DefensiveStructureState = prior
    && assignments === prior.assignments
    && prior.defendedBasket.x === defendedBasket.x
    && prior.defendedBasket.y === defendedBasket.y
    && prior.onBallDefenderPlayerId === onBallDefenderPlayerId
    && helpDefenderPlayerIds === prior.helpDefenderPlayerIds
    && JSON.stringify(prior.helpDecision) === JSON.stringify(helpDecision)
    ? prior
    : { teamId: defendingTeamId, scheme: 'MAN', defendedBasket, assignments, onBallDefenderPlayerId, helpDefenderPlayerIds, helpDecision }
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

function resolveDriveHelpDecision(
  state: MatchState,
  assignments: readonly DefensiveAssignment[],
  playerById: ReadonlyMap<PlayerId, MatchPlayerState>,
  ballHandlerId: PlayerId | null,
  drive: MatchState['actions'][number] | undefined,
  prior: DefensiveHelpDecision | undefined,
  basket: CourtPosition,
): DefensiveHelpDecision {
  const source = drive?.kind === 'DRIVE' && drive.playerId === ballHandlerId
    && (drive.status === 'ACTIVE' || drive.outcome === 'ADVANTAGE') ? drive : undefined
  if (!source || !source.startPosition || !source.target || !ballHandlerId) {
    return { status: 'NOT_NEEDED', ballHandlerPlayerId: ballHandlerId, reason: 'No active paint drive; stay connected to assigned players.', rotations: [] }
  }
  if (prior?.status === 'TRIGGERED' && prior.sourceActionId === source.id) return prior

  const handler = playerById.get(ballHandlerId)
  const onBallAssignment = assignments.find((item) => item.attackerPlayerId === ballHandlerId)
  const onBallDefender = onBallAssignment ? playerById.get(onBallAssignment.defenderPlayerId) : undefined
  if (!handler || !onBallDefender) return { status: 'NOT_NEEDED', ballHandlerPlayerId: ballHandlerId, sourceActionId: source.id, reason: 'No valid on-ball matchup; preserve the current shell.', rotations: [] }

  const progress = distanceBetween(handler.position, source.startPosition)
  const basketDistance = distanceBetween(handler.position, basket)
  const direction = unitVector({ x: basket.x - onBallDefender.position.x, y: basket.y - onBallDefender.position.y }, { x: basket.x >= state.court.lengthMeters / 2 ? -1 : 1, y: 0 })
  const handlerPastDefender = (handler.position.x - onBallDefender.position.x) * direction.x
    + (handler.position.y - onBallDefender.position.y) * direction.y > 0.5
  const enteredPaintThreat = basketDistance <= DRIVE_PAINT_THREAT_METERS
  const containment = clamp((onBallDefender.defense.pointOfAttack + onBallDefender.defense.mobility
    - handler.offense.rimAttack - handler.offense.creation) / 200, -0.12, 0.12)
  const beaten = handlerPastDefender && basketDistance <= DRIVE_PAINT_THREAT_METERS + 2 + containment
  if (progress < 1 || !enteredPaintThreat && !beaten) {
    return {
      status: 'NOT_NEEDED', ballHandlerPlayerId: ballHandlerId, sourceActionId: source.id,
      reason: `No help: ball handler has not entered the paint threat area or beaten the on-ball defender (${basketDistance.toFixed(1)}m from rim).`,
      rotations: [],
    }
  }

  const centerY = state.court.widthMeters / 2
  const ballSide = Math.sign(state.ball.position.y - centerY)
  const candidates = assignments.filter((item) => item.attackerPlayerId !== ballHandlerId)
    .map((assignment) => ({ assignment, defender: playerById.get(assignment.defenderPlayerId), attacker: playerById.get(assignment.attackerPlayerId) }))
    .filter((item): item is { assignment: DefensiveAssignment; defender: MatchPlayerState; attacker: MatchPlayerState } => item.defender !== undefined && item.attacker !== undefined)
  const weaksideLowMan = candidates.filter(({ attacker }) => ballSide !== 0 && Math.sign(attacker.position.y - centerY) !== 0 && Math.sign(attacker.position.y - centerY) !== ballSide)
    .sort((left, right) => distanceBetween(left.attacker.position, basket) - distanceBetween(right.attacker.position, basket)
      || distanceBetween(left.defender.position, basket) - distanceBetween(right.defender.position, basket)
      || String(left.assignment.defenderPlayerId).localeCompare(String(right.assignment.defenderPlayerId)))[0]
  const helper = weaksideLowMan ?? candidates
    .sort((left, right) => distanceBetween(left.defender.position, basket) - distanceBetween(right.defender.position, basket)
      || distanceBetween(left.attacker.position, basket) - distanceBetween(right.attacker.position, basket)
      || String(left.assignment.defenderPlayerId).localeCompare(String(right.assignment.defenderPlayerId)))[0]
  if (!helper) return { status: 'NOT_NEEDED', ballHandlerPlayerId: ballHandlerId, sourceActionId: source.id, reason: 'No valid help defender; keep the on-ball matchup and rim coverage.', rotations: [] }

  const available = candidates.filter((candidate) => candidate.assignment.defenderPlayerId !== helper.assignment.defenderPlayerId)
  const helperMan = helper.attacker
  const rotator = available.slice().sort((left, right) => distanceBetween(left.defender.position, helperMan.position) - distanceBetween(right.defender.position, helperMan.position)
    || String(left.assignment.defenderPlayerId).localeCompare(String(right.assignment.defenderPlayerId)))[0]
  const xOut = rotator ? available.filter((candidate) => candidate.assignment.defenderPlayerId !== rotator.assignment.defenderPlayerId)
    .sort((left, right) => distanceBetween(left.attacker.position, state.ball.position) - distanceBetween(right.attacker.position, state.ball.position)
      || String(left.assignment.defenderPlayerId).localeCompare(String(right.assignment.defenderPlayerId)))[0] : undefined
  const rotations: DefensiveHelpDecision['rotations'] = [
    ...(rotator ? [{ playerId: rotator.assignment.defenderPlayerId, kind: 'ROTATE' as const, targetAttackerPlayerId: helperMan.playerId }] : []),
    ...(xOut && rotator ? [{ playerId: xOut.assignment.defenderPlayerId, kind: 'X_OUT' as const, targetAttackerPlayerId: rotator.attacker.playerId, secondaryAttackerPlayerId: xOut.attacker.playerId }] : []),
  ]
  const cause = enteredPaintThreat ? 'handler entered the paint threat area' : 'on-ball defender was beaten before the paint'
  return {
    status: 'TRIGGERED', ballHandlerPlayerId: ballHandlerId, sourceActionId: source.id,
    reason: `Help triggered because ${cause}; ${weaksideLowMan ? 'weak side low man' : 'nearest rim-side assignment'} helps, then ROTATE and X_OUT cover the vacated matchups.`,
    helperPlayerId: helper.assignment.defenderPlayerId,
    helperKind: weaksideLowMan ? 'LOW_MAN' : 'HELP',
    rotations,
  }
}

function rotationTargetPosition(
  rotation: DefensiveHelpDecision['rotations'][number],
  playerById: ReadonlyMap<PlayerId, MatchPlayerState>,
  ball: CourtPosition,
  basket: CourtPosition,
  court: MatchState['court'],
  tactics: MatchState['tacticalPlans']['home']['defense'],
): CourtPosition | undefined {
  const first = playerById.get(rotation.targetAttackerPlayerId)
  if (!first) return undefined
  const firstTarget = guardPosition(first.position, ball, basket, 'GAP', court, tactics)
  if (!rotation.secondaryAttackerPlayerId) return firstTarget
  const second = playerById.get(rotation.secondaryAttackerPlayerId)
  if (!second) return firstTarget
  const secondTarget = guardPosition(second.position, ball, basket, 'GAP', court, tactics)
  return { x: (firstTarget.x + secondTarget.x) / 2, y: (firstTarget.y + secondTarget.y) / 2 }
}

function handlerPosition(state: MatchState, handlerId: PlayerId | null, fallback: CourtPosition): CourtPosition {
  return state.players.find((player) => player.playerId === handlerId)?.position ?? fallback
}

/** Positions a defender from live man/ball/basket geometry, never an offensive slot target. */
export function guardPosition(
  attackerPosition: CourtPosition,
  ballPosition: CourtPosition,
  defendedBasket: CourtPosition,
  responsibility: 'ON_BALL' | 'GAP' | 'HELP',
  court: MatchState['court'],
  tactics?: MatchState['tacticalPlans']['home']['defense'],
): CourtPosition {
  const basketSideFallback = { x: defendedBasket.x >= court.lengthMeters / 2 ? -1 : 1, y: 0 }
  const towardBasket = unitVector({ x: defendedBasket.x - attackerPosition.x, y: defendedBasket.y - attackerPosition.y }, basketSideFallback)
  const towardBall = unitVector({ x: ballPosition.x - attackerPosition.x, y: ballPosition.y - attackerPosition.y }, { x: 0, y: 0 })
  const basketDistance = distanceBetween(attackerPosition, defendedBasket)
  const onBallCushion = clamp(ON_BALL_CUSHION_METERS - (tactics?.perimeter ?? 0) * 0.12, 0.6, 1.5)
  const gapDepth = clamp(GAP_DEPTH_METERS + (tactics?.interior ?? 0) * 0.1, 0.5, 1.3)
  const helpDepth = clamp(HELP_DEPTH_METERS + (tactics?.interior ?? 0) * 0.2, 0.7, 2.3)
  const gapShade = clamp(GAP_SHADE_METERS + (tactics?.perimeter ?? 0) * 0.1, 0.35, 0.95)
  const depth = responsibility === 'ON_BALL' ? Math.min(onBallCushion, Math.max(0, basketDistance - 0.45))
    : responsibility === 'GAP' ? Math.min(gapDepth, Math.max(0, basketDistance - 0.6))
      : Math.min(helpDepth, Math.max(0, basketDistance - 0.6))
  const ballLateral = (ballPosition.x - attackerPosition.x) * -towardBasket.y + (ballPosition.y - attackerPosition.y) * towardBasket.x
  const shade = responsibility === 'ON_BALL' ? clamp(ballLateral * 0.05, -0.12, 0.12)
    : responsibility === 'GAP' ? gapShade : responsibility === 'HELP' ? HELP_SHADE_METERS : 0
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
