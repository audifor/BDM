/**
 * MatchNextPresentationBridge — pure, read-only projection MatchFrame -> NextTickFrame.
 *
 * Reads only the engine's own `MatchFrame` (toFrame output). No RNG, no decisions, no writes. The only derived
 * facts are unit conversions (tenths -> seconds) and joins already present in the frame (assignment <->
 * guardedBy, slot names). It never touches `@/engine/match` (legacy).
 */

import type { MatchFrame } from '@/engine/match-next'
import type { PlayerId } from '@/domain/ids'
import type { NextBall, NextPlayer, NextPlayerLabels, NextTickFrame } from './types'

const pt = (p: { readonly x: number; readonly y: number }) => ({ x: p.x, y: p.y })

export function toNextTickFrame(frame: MatchFrame, labels: NextPlayerLabels, previousEventSequence: number, isComplete = false): NextTickFrame {
  const possessionTeamId = frame.possession?.teamId
  const guardedBy = new Map<PlayerId, PlayerId>()
  for (const p of frame.players) if (p.assignment !== null) guardedBy.set(p.assignment.attackerPlayerId, p.assignment.defenderPlayerId)
  const slotByPlayer = new Map((frame.offensiveStructure?.assignments ?? []).map((a) => [a.playerId, a.slot]))
  const ownerId = frame.ball.kind === 'HELD' ? frame.ball.ownerPlayerId : undefined

  const players: NextPlayer[] = frame.players.map((p) => {
    const label = labels.get(p.playerId) ?? { label: String(p.playerId).slice(-6), jersey: 0 }
    const intent = p.intent
    return {
      playerId: p.playerId,
      teamId: p.teamId,
      side: p.teamId === frame.homeTeamId ? 'home' : 'away',
      label: label.label,
      jersey: label.jersey,
      position: pt(p.position),
      velocity: pt(p.velocity),
      speedMps: Math.hypot(p.velocity.x, p.velocity.y),
      facing: pt(p.facing),
      isOffense: possessionTeamId !== undefined && p.teamId === possessionTeamId,
      hasBall: ownerId === p.playerId,
      intentTarget: intent === null ? undefined : pt(intent.target),
      intentUrgency: intent?.urgency,
      intentFacing: intent?.facing.kind,
      intentOwner: intent?.provenance.owner,
      responsibility: p.responsibility?.kind,
      decision: p.decision?.kind,
      slot: slotByPlayer.get(p.playerId) ?? (p.slot === null || p.slot === undefined ? undefined : String(p.slot)),
      guarding: p.assignment?.attackerPlayerId,
      guardedBy: guardedBy.get(p.playerId),
      ballRelation: p.ballRelation ?? undefined,
      transitionRole: p.transitionRole?.kind,
      transitionTarget: p.transitionRole === null ? undefined : pt(p.transitionRole.target),
      reboundRole: p.reboundResponsibility?.kind,
      reboundTarget: p.reboundResponsibility === null ? undefined : pt(p.reboundResponsibility.target),
    }
  })

  const b = frame.ball
  const ball: NextBall = {
    kind: b.kind,
    position: pt(b.position),
    heightMeters: b.heightMeters,
    ownerPlayerId: b.ownerPlayerId,
    flight: b.flight === undefined ? undefined : { kind: b.flight.kind, from: pt(b.flight.from), target: pt(b.flight.target), releaseT: b.flight.releaseT, arrivalT: b.flight.arrivalT },
    deadReason: b.deadReason,
    shotValue: b.shotValue,
    shotProbability: b.shotProbability,
  }

  const activeAction = frame.actions.find((a) => a.status === 'ACTIVE')
  return {
    t: frame.t,
    period: frame.period,
    gameClockSeconds: frame.gameClock / 10,
    shotClockSeconds: frame.shotClock === null ? undefined : frame.shotClock / 10,
    gameRunning: frame.clock.gameRunning,
    score: { home: frame.score.home, away: frame.score.away },
    court: {
      lengthMeters: frame.court.lengthMeters,
      widthMeters: frame.court.widthMeters,
      threePointArcRadiusMeters: frame.court.threePointLine.arcRadiusMeters,
      threePointCornerOffsetMeters: frame.court.threePointLine.cornerOffsetMeters,
      baskets: { left: pt(frame.court.baskets.left), right: pt(frame.court.baskets.right) },
    },
    possessionTeamId,
    possessionPhase: frame.possession?.phase,
    possessionStartReason: frame.possession?.startReason,
    attackingBasket: frame.offensiveStructure === null ? undefined : pt(frame.offensiveStructure.attackingBasket),
    players,
    ball,
    offenseSlots: (frame.offensiveStructure?.slots ?? []).map((s) => ({ slot: s.slot, position: pt(s.position) })),
    flow: frame.offenseFlow === null ? undefined : {
      stage: frame.offenseFlow.stage, settled: frame.offenseFlow.settledAtT !== null,
      moves: frame.offenseFlow.moves.map((move) => ({ playerId: move.playerId, kind: move.kind, target: pt(move.target) })),
    },
    screen: frame.screen === null ? undefined : {
      phase: frame.screen.phase, coverage: frame.screen.coverage, exit: frame.screen.exit, handlerId: frame.screen.handlerId, screenerId: frame.screen.screenerId,
      location: pt(frame.screen.location), waypoint: pt(frame.screen.waypoint),
    },
    transition: frame.transition === null ? undefined : { trigger: frame.transition.trigger, advantage: frame.transition.advantage, teamId: frame.transition.teamId },
    playState: { phase: frame.playState.phase, cause: frame.playState.cause },
    freeThrow: frame.freeThrows === null ? undefined : { shooterId: frame.freeThrows.shooterId, index: frame.freeThrows.taken + 1, total: frame.freeThrows.total, phase: frame.freeThrows.phase },
    teamFouls: { home: frame.fouls.teamPeriod[frame.homeTeamId] ?? 0, away: frame.fouls.teamPeriod[frame.awayTeamId] ?? 0 },
    currentAction: activeAction === undefined ? undefined : `${activeAction.kind}${activeAction.phase === undefined ? '' : `:${activeAction.phase}`}`,
    isComplete,
    events: frame.events.filter((e) => e.sequence > previousEventSequence),
  }
}
