/**
 * Basketball Truth (BT1) — canonical truth frame.
 *
 * A read-only, debug-only projection of one MatchSessionState (plus, optionally, the
 * previous state / new events / the rendered positions the renderer actually painted). It
 * exists ONLY to answer "is the simulation itself producing basketball?" with numbers:
 *
 *   CANONICAL TRUTH (engine state, metres)  vs  RENDERED TRUTH (what Phaser painted, metres)
 *
 * Nothing here feeds back into MatchEngine or the renderer. Every derived label
 * (possession phase, movement target, role) is NON-AUTHORITATIVE and exists for debugging.
 */

import type { PlayerId, TeamId } from '@/domain/ids'
import {
  assignBaseSpatialTargets,
  assignTransitionSpatialTargets,
  calculateDefensiveAssignments,
  getSpatialPossessionView,
  type MatchEvent,
  type MatchSessionState,
} from '@/engine/match'
import type { BaseSpatialTarget } from '@/engine/match'

export interface MetrePoint {
  readonly x: number
  readonly y: number
}

export type TruthMovementTargetSource = 'cut' | 'drive' | 'screen' | 'postScreen' | 'help' | 'rotation' | 'transition' | 'baseSpacing'

export type BtPossessionPhase =
  | 'inbound'
  | 'transitionOffense'
  | 'transitionDefense'
  | 'earlyOffense'
  | 'halfCourt'
  | 'actionSetup'
  | 'actionExecution'
  | 'advantage'
  | 'shot'
  | 'rebound'
  | 'reset'

export interface TruthPlayerRow {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly side: 'home' | 'away'
  readonly isOffense: boolean
  readonly canonical: MetrePoint
  /** Filled only when a renderer supplied what it actually painted for this frame. */
  readonly rendered: MetrePoint | undefined
  readonly canonicalRenderedDiffMeters: number | undefined
  readonly velocity: MetrePoint
  readonly speedMps: number
  readonly movementTarget: MetrePoint | undefined
  readonly movementTargetSource: TruthMovementTargetSource | undefined
  /** Facing derived from velocity, falling back to the ball for stationary players. */
  readonly facingRadians: number
  readonly currentAction: string
  readonly offBallCut: 'rimCut' | 'spaceCut' | undefined
  readonly driveIntent: boolean
  readonly screenIntent: 'approach' | 'set' | 'postScreen' | undefined
  readonly defensiveReaction: 'HELP' | 'RECOVER' | undefined
  /** Defensive assignment: whom this defender guards / who guards this attacker. */
  readonly guarding: PlayerId | undefined
  readonly guardedBy: PlayerId | undefined
  readonly possessionRole: string
}

export interface TruthBall {
  readonly canonical: MetrePoint
  readonly rendered: MetrePoint | undefined
  readonly renderedVisualHeight: number | undefined
  readonly owner: PlayerId | undefined
  readonly state: 'unassigned' | 'loose' | 'playerControlled'
  readonly target: MetrePoint | undefined
  readonly associatedEvent: string | undefined
}

export interface TruthFrame {
  readonly simulationTick: number
  readonly presentationFrame: number | undefined
  readonly period: number
  readonly clockSecondsRemaining: number
  readonly score: { readonly home: number; readonly away: number }
  readonly offenseTeamId: TeamId
  readonly defenseTeamId: TeamId
  readonly attackingBasket: MetrePoint
  readonly matchEngineEvents: readonly string[]
  readonly presentationEvent: string | undefined
  readonly phase: BtPossessionPhase
  readonly phaseTags: readonly BtPossessionPhase[]
  readonly players: readonly TruthPlayerRow[]
  readonly ball: TruthBall
}

export interface TruthFrameContext {
  readonly previous?: MatchSessionState
  readonly newEvents?: readonly MatchEvent[]
  readonly rendered?: {
    readonly players: ReadonlyMap<PlayerId, MetrePoint>
    readonly ball: MetrePoint
    readonly ballVisualHeight: number
  }
  readonly presentationFrame?: number
  readonly presentationEvent?: string
  /** Sim-clock seconds elapsed since the current possession began (tracked by the caller). */
  readonly possessionElapsedSeconds?: number
}

const ROLE_FALLBACK = 'none'

function sideOf(teamId: TeamId, state: MatchSessionState): 'home' | 'away' {
  return teamId === state.homeTeamId ? 'home' : 'away'
}

function dist(a: MetrePoint, b: MetrePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Non-authoritative possession phase(s) for debug. Never used to drive gameplay or rendering decisions. */
export function derivePossessionPhases(state: MatchSessionState, ctx: TruthFrameContext): readonly BtPossessionPhase[] {
  const tags: BtPossessionPhase[] = []
  const events = ctx.newEvents ?? []
  const types = new Set(events.map((event) => event.type))
  if (types.has('shotMade') || types.has('shotMissed')) tags.push('shot')
  if (types.has('rebound')) tags.push('rebound')
  if (types.has('periodStart') || types.has('periodEnd')) tags.push('reset')
  if (types.has('shotMade') || (types.has('turnover') && state.spatial.ball.kind !== 'playerControlled') || types.has('freeThrowMade') || types.has('freeThrowMissed')) {
    tags.push('inbound')
  }
  if (state.transitionIntent !== undefined) tags.push('transitionOffense')
  else if (state.offensiveAction?.kind === 'TRANSITION') tags.push('transitionOffense')
  const screen = state.screenIntent
  if (screen !== undefined) tags.push(screen.phase === 'postScreen' ? 'actionExecution' : 'actionSetup')
  if (state.driveIntent !== undefined) tags.push('actionExecution')
  if (state.defensiveReaction?.phase === 'HELP' && state.driveIntent !== undefined) tags.push('advantage')
  if (state.offBallCut !== undefined) tags.push('actionSetup')
  if (tags.length === 0) {
    const elapsed = ctx.possessionElapsedSeconds ?? Number.POSITIVE_INFINITY
    tags.push(elapsed < 8 ? 'earlyOffense' : 'halfCourt')
  }
  return tags
}

function primaryPhase(tags: readonly BtPossessionPhase[]): BtPossessionPhase {
  const order: BtPossessionPhase[] = ['shot', 'rebound', 'inbound', 'reset', 'advantage', 'actionExecution', 'actionSetup', 'transitionOffense', 'transitionDefense', 'earlyOffense', 'halfCourt']
  for (const candidate of order) if (tags.includes(candidate)) return candidate
  return 'halfCourt'
}

function eventLabel(event: MatchEvent): string {
  switch (event.type) {
    case 'shotMade':
      return `SHOT_MADE(${event.points}, ${event.shotZone})`
    case 'shotMissed':
      return `SHOT_MISSED(${event.shotZone})`
    case 'rebound':
      return `REBOUND(${event.reboundType})`
    case 'passCompleted':
      return 'PASS'
    case 'turnover':
      return event.stealPlayerId === undefined ? 'TURNOVER' : 'TURNOVER(steal)'
    case 'foul':
      return 'FOUL'
    default:
      return event.type.toUpperCase()
  }
}

/** Builds the truth frame for one engine state. Pure; no engine mutation, no RNG. */
export function buildTruthFrame(state: MatchSessionState, ctx: TruthFrameContext = {}): TruthFrame {
  const spatial = state.spatial
  const view = getSpatialPossessionView({
    homeTeamId: state.homeTeamId,
    awayTeamId: state.awayTeamId,
    attackingTeamId: state.attackingTeamId,
    period: state.period,
    spatial,
  })
  const offenseSideKey = view.offensiveTeamId === state.homeTeamId ? 'home' : 'away'
  const defenseSideKey = view.defensiveTeamId === state.homeTeamId ? 'home' : 'away'
  const profiles = [...state.playerProfiles.home, ...state.playerProfiles.away]
  let assignments: readonly { readonly offensivePlayerId: PlayerId; readonly defensivePlayerId: PlayerId }[] = []
  try {
    assignments = calculateDefensiveAssignments(
      state.activeLineups[offenseSideKey],
      state.activeLineups[defenseSideKey],
      profiles,
      state.defensiveMatchups?.[defenseSideKey] ?? [],
    )
  } catch {
    assignments = []
  }
  const defenderOf = new Map(assignments.map((m) => [m.offensivePlayerId, m.defensivePlayerId]))
  const guardOf = new Map(assignments.map((m) => [m.defensivePlayerId, m.offensivePlayerId]))

  const baseInput = {
    homeTeamId: state.homeTeamId,
    awayTeamId: state.awayTeamId,
    attackingTeamId: state.attackingTeamId,
    period: state.period,
    activeLineups: state.activeLineups,
    playerProfiles: state.playerProfiles,
    spatial,
    defensiveMatchupOverrides: state.defensiveMatchups?.[defenseSideKey] ?? [],
    ...(view.ballHandlerId === undefined ? {} : { ballHandlerId: view.ballHandlerId }),
  }
  const base = assignBaseSpatialTargets(baseInput)
  const baseByPlayer = new Map<PlayerId, BaseSpatialTarget>([...base.offensive, ...base.defensive].map((t) => [t.playerId, t]))
  const transitionByPlayer = new Map<PlayerId, MetrePoint>()
  if (state.transitionIntent !== undefined) {
    try {
      const transition = assignTransitionSpatialTargets({
        homeTeamId: state.homeTeamId,
        awayTeamId: state.awayTeamId,
        attackingTeamId: state.attackingTeamId,
        period: state.period,
        activeLineups: state.activeLineups,
        playerProfiles: state.playerProfiles,
        spatial,
      })
      for (const t of [...transition.offense, ...transition.defense]) transitionByPlayer.set(t.playerId, t.position)
    } catch {
      /* debug-only */
    }
  }

  const tags = derivePossessionPhases(state, ctx)
  const events = ctx.newEvents ?? []
  const ballPos = spatial.ball.position
  const owner = spatial.ball.kind === 'playerControlled' ? spatial.ball.playerId : undefined

  const rows: TruthPlayerRow[] = spatial.players.map((player) => {
    const isOffense = player.teamId === view.offensiveTeamId
    const speed = Math.hypot(player.velocity.x, player.velocity.y)
    let target: MetrePoint | undefined
    let source: TruthMovementTargetSource | undefined
    const cut = state.offBallCut
    const drive = state.driveIntent
    const screen = state.screenIntent
    const reaction = state.defensiveReaction
    if (isOffense && cut !== undefined && cut.playerId === player.playerId) {
      target = cut.target
      source = 'cut'
    } else if (isOffense && drive !== undefined && drive.handlerId === player.playerId) {
      target = drive.target
      source = 'drive'
    } else if (isOffense && screen !== undefined && screen.screenerId === player.playerId) {
      target = screen.phase === 'postScreen' ? (screen.postScreenTarget ?? screen.target) : screen.target
      source = screen.phase === 'postScreen' ? 'postScreen' : 'screen'
    } else if (!isOffense && reaction !== undefined && reaction.defenderId === player.playerId) {
      target = reaction.target
      source = 'help'
    } else if (!isOffense && reaction?.rotationDefenderId === player.playerId && reaction.rotationTarget !== undefined) {
      target = reaction.rotationTarget
      source = 'rotation'
    } else if (transitionByPlayer.has(player.playerId)) {
      target = transitionByPlayer.get(player.playerId)
      source = 'transition'
    } else {
      target = baseByPlayer.get(player.playerId)?.position
      source = target === undefined ? undefined : 'baseSpacing'
    }

    const facing = speed > 0.3 ? Math.atan2(player.velocity.y, player.velocity.x) : Math.atan2(ballPos.y - player.position.y, ballPos.x - player.position.x)
    const actionParts: string[] = []
    if (owner === player.playerId) actionParts.push('ballHandler')
    if (cut?.playerId === player.playerId) actionParts.push(cut.type)
    if (drive?.handlerId === player.playerId) actionParts.push('drive')
    if (screen?.screenerId === player.playerId) actionParts.push(`screener:${screen.phase}`)
    if (screen?.ballHandlerId === player.playerId) actionParts.push(`screenUser:${screen.phase}`)
    if (reaction?.defenderId === player.playerId) actionParts.push(`help:${reaction.phase}`)
    const rendered = ctx.rendered?.players.get(player.playerId)
    return {
      playerId: player.playerId,
      teamId: player.teamId,
      side: sideOf(player.teamId, state),
      isOffense,
      canonical: { x: player.position.x, y: player.position.y },
      rendered,
      canonicalRenderedDiffMeters: rendered === undefined ? undefined : dist(rendered, player.position),
      velocity: { x: player.velocity.x, y: player.velocity.y },
      speedMps: speed,
      movementTarget: target === undefined ? undefined : { x: target.x, y: target.y },
      movementTargetSource: source,
      facingRadians: facing,
      currentAction: actionParts.length > 0 ? actionParts.join('+') : isOffense ? 'offBall' : 'defend',
      offBallCut: cut?.playerId === player.playerId ? cut.type : undefined,
      driveIntent: drive?.handlerId === player.playerId,
      screenIntent: screen?.screenerId === player.playerId || screen?.ballHandlerId === player.playerId ? screen.phase : undefined,
      defensiveReaction: reaction?.defenderId === player.playerId || reaction?.rotationDefenderId === player.playerId ? reaction.phase : undefined,
      guarding: isOffense ? undefined : guardOf.get(player.playerId),
      guardedBy: isOffense ? defenderOf.get(player.playerId) : undefined,
      possessionRole: baseByPlayer.get(player.playerId)?.role ?? ROLE_FALLBACK,
    }
  })

  return {
    simulationTick: state.nextSequence,
    presentationFrame: ctx.presentationFrame,
    period: state.period,
    clockSecondsRemaining: state.clockSecondsRemaining,
    score: { home: state.homeScore, away: state.awayScore },
    offenseTeamId: view.offensiveTeamId,
    defenseTeamId: view.defensiveTeamId,
    attackingBasket: { x: view.attackingBasket.x, y: view.attackingBasket.y },
    matchEngineEvents: events.map(eventLabel),
    presentationEvent: ctx.presentationEvent,
    phase: primaryPhase(tags),
    phaseTags: tags,
    players: rows,
    ball: {
      canonical: { x: ballPos.x, y: ballPos.y },
      rendered: ctx.rendered?.ball,
      renderedVisualHeight: ctx.rendered?.ballVisualHeight,
      owner,
      state: spatial.ball.kind,
      target: owner === undefined ? undefined : { x: view.attackingBasket.x, y: view.attackingBasket.y },
      associatedEvent: events.length > 0 ? eventLabel(events[events.length - 1]!) : undefined,
    },
  }
}
