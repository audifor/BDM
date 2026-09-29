/**
 * Pure, read-only projection: MatchSessionState / MatchEvent -> MatchPresentationState / MatchPresentationEvent.
 *
 * Every function in this file is a pure function of its inputs. None of them:
 *  - read or write any MatchSession/MatchSessionState by reference (they only read the passed-in state),
 *  - call into any RandomSource,
 *  - decide any sporting outcome (shot made/missed, pass completed, rebound owner, possession change,
 *    score, foul, substitution) — those are always copied verbatim from MatchSessionState / MatchEvent.
 *
 * This is the only file in the POC that imports from `@/engine/match`. The renderer (Phaser scene,
 * bridge glue, interpolation) never imports MatchEngine types directly — it only sees the contract
 * types in visualTypes.ts. That is the seam that lets the renderer be replaced without touching
 * MatchEngine, and lets MatchEngine evolve without the renderer needing to know its internals.
 */

import type { PlayerId, TeamId } from '@/domain/ids'
import type {
  DriveIntent,
  MatchEvent,
  MatchSessionState,
  OffBallCutIntent,
  OffensiveAction,
  ScreenIntent,
} from '@/engine/match'
import { calculateDefensiveAssignments, getSpatialPossessionView } from '@/engine/match'
import type {
  MatchPresentationEvent,
  MatchPresentationEventKind,
  MatchPresentationState,
  PresentationSegment,
  PresentationActionIntent,
  PresentationBall,
  PresentationBallState,
  PresentationCourt,
  PresentationDebugTargets,
  PresentationDefensiveIntent,
  PresentationPlayer,
  PresentationPoint,
  PresentationSide,
} from './visualTypes'

/** Supplied by the application layer (e.g. from GameWorld.players), never derived from gameplay ratings. */
export interface PresentationPlayerLabel {
  readonly label: string
  readonly jersey: number
}

export type PresentationPlayerLabels = ReadonlyMap<PlayerId, PresentationPlayerLabel>

function toPercent(position: { readonly x: number; readonly y: number }, lengthMeters: number, widthMeters: number): PresentationPoint {
  return {
    xPercent: (position.x / lengthMeters) * 100,
    yPercent: (position.y / widthMeters) * 100,
  }
}

function sideForTeam(teamId: TeamId, homeTeamId: TeamId): PresentationSide {
  return teamId === homeTeamId ? 'home' : 'away'
}

/** Orientation is derived purely from the player's own velocity vector; undefined when stationary. */
function orientationFromVelocity(velocity: { readonly x: number; readonly y: number }): number | undefined {
  const speed = Math.hypot(velocity.x, velocity.y)
  if (speed < 1e-6) return undefined
  return Math.atan2(velocity.y, velocity.x)
}

/**
 * Presentation-only refinement of the engine's 3-state ball.kind into the richer MP1C state set.
 * 'loose' engine state maps to 'reboundLoose' after a miss (state.offensiveAction absent + last
 * event was a miss) or 'inbound' otherwise; both are purely cosmetic labels over the same
 * engine-owned 'loose' fact and never change who ends up with the ball.
 */
function ballStateFor(ball: MatchSessionState['spatial']['ball'], looseBallContext: 'postMiss' | 'postTurnover' | 'other'): PresentationBallState {
  if (ball.kind === 'unassigned') return 'unassigned'
  if (ball.kind === 'loose') {
    if (looseBallContext === 'postMiss') return 'reboundLoose'
    if (looseBallContext === 'postTurnover') return 'deadBall'
    return 'inbound'
  }
  return 'held'
}

function fallbackLabel(playerId: PlayerId): PresentationPlayerLabel {
  return { label: String(playerId).slice(0, 8), jersey: 0 }
}

/**
 * Derives a per-player offensive action-intent label purely from already-existing, read-only
 * engine intent state (offBallCut, screenIntent, driveIntent, possession-level offensiveAction,
 * ball ownership) plus, as a last resort, the player's own velocity (a trajectory fallback, never
 * a guessed basketball decision). No new intent is invented beyond what the engine already decided.
 */
function actionIntentFor(input: {
  readonly playerId: PlayerId
  readonly hasBall: boolean
  readonly isOffense: boolean
  readonly speedMetersPerSecond: number
  readonly offBallCut: OffBallCutIntent | undefined
  readonly screenIntent: ScreenIntent | undefined
  readonly driveIntent: DriveIntent | undefined
  readonly transitionActive: boolean
}): PresentationActionIntent {
  const { playerId, hasBall, isOffense, speedMetersPerSecond, offBallCut, screenIntent, driveIntent, transitionActive } = input
  if (!isOffense) return speedMetersPerSecond > 0.2 ? 'moving' : 'idle'

  if (driveIntent !== undefined && driveIntent.handlerId === playerId) return 'drive'

  if (screenIntent !== undefined) {
    if (screenIntent.screenerId === playerId) {
      if (screenIntent.phase === 'approach') return 'screenApproach'
      if (screenIntent.phase === 'set') return 'screenSet'
      if (screenIntent.postScreenAction === 'pop') return 'screenPop'
      return 'screenRoll'
    }
    if (screenIntent.ballHandlerId === playerId) return 'dribble'
  }

  if (offBallCut !== undefined && offBallCut.playerId === playerId) {
    return offBallCut.type === 'rimCut' ? 'cutRim' : 'cutSpace'
  }

  if (hasBall) return speedMetersPerSecond > 0.2 ? 'dribble' : 'spotUp'
  if (transitionActive) return 'transitionLane'
  return speedMetersPerSecond > 0.2 ? 'moving' : 'spotUp'
}

/**
 * Derives a per-player defensive-intent label purely from the engine's own defensiveReaction
 * state (help/recover) plus a trajectory fallback (shuffle vs idle) when no explicit reaction is
 * active for that defender. Never invents a defensive scheme.
 */
function defensiveIntentFor(input: {
  readonly playerId: PlayerId
  readonly speedMetersPerSecond: number
  readonly reactionDefenderIds: ReadonlySet<PlayerId>
  readonly reactionPhaseByDefenderId: ReadonlyMap<PlayerId, 'HELP' | 'RECOVER'>
  readonly transitionActive: boolean
}): PresentationDefensiveIntent {
  const phase = input.reactionPhaseByDefenderId.get(input.playerId)
  if (phase === 'HELP') return 'help'
  if (phase === 'RECOVER') return 'recover'
  if (input.transitionActive) return 'transition'
  return input.speedMetersPerSecond > 0.2 ? 'shuffle' : 'onBall'
}

/**
 * Builds one MatchPresentationState from the engine's current MatchSessionState. Called once per
 * MatchEngine step by the demo driver; the renderer never calls MatchEngine itself.
 */
export function toMatchPresentationState(
  state: MatchSessionState,
  labels: PresentationPlayerLabels,
): MatchPresentationState {
  const { court } = state.spatial
  const presentationCourt: PresentationCourt = {
    lengthMeters: court.lengthMeters,
    widthMeters: court.widthMeters,
    threePointArcRadiusMeters: court.threePointLine.arcRadiusMeters,
    threePointCornerOffsetMeters: court.threePointLine.cornerOffsetMeters,
    baskets: {
      left: toPercent(court.baskets.left, court.lengthMeters, court.widthMeters),
      right: toPercent(court.baskets.right, court.lengthMeters, court.widthMeters),
    },
  }

  const ball = state.spatial.ball
  const ownerPlayerId = ball.kind === 'playerControlled' ? ball.playerId : undefined
  const ownerTeamId = ball.kind === 'playerControlled' ? ball.teamId : undefined

  const possessionView = getSpatialPossessionView({
    homeTeamId: state.homeTeamId,
    awayTeamId: state.awayTeamId,
    attackingTeamId: state.attackingTeamId,
    period: state.period,
    spatial: state.spatial,
  })

  // Read-only: the engine's own pure, deterministic (no RNG) assignment calculator, driven from
  // the same activeLineups + playerProfiles + defensiveMatchups already carried on MatchSessionState.
  // This performs NO decision — it reproduces exactly the assignment the engine itself would derive.
  // calculateDefensiveAssignments looks up BOTH lineups' profiles by id, so the profile pool passed
  // in must cover both teams' active players, not just the offensive side.
  const offensiveLineup = state.activeLineups[sideKeyForTeam(possessionView.offensiveTeamId, state.homeTeamId)]
  const defensiveLineup = state.activeLineups[sideKeyForTeam(possessionView.defensiveTeamId, state.homeTeamId)]
  const combinedProfiles = [...state.playerProfiles.home, ...state.playerProfiles.away]
  const overrideKey = sideKeyForTeam(possessionView.defensiveTeamId, state.homeTeamId)
  const overrides = state.defensiveMatchups?.[overrideKey] ?? []
  let matchups: readonly { readonly offensivePlayerId: PlayerId; readonly defensivePlayerId: PlayerId }[] = []
  try {
    matchups = calculateDefensiveAssignments(offensiveLineup, defensiveLineup, combinedProfiles, overrides)
  } catch {
    matchups = []
  }
  const defenderByOffensivePlayerId = new Map(matchups.map((m) => [m.offensivePlayerId, m.defensivePlayerId]))
  const offensiveByDefensivePlayerId = new Map(matchups.map((m) => [m.defensivePlayerId, m.offensivePlayerId]))

  const screenIntent = state.screenIntent
  const screenPartnerByPlayerId = new Map<PlayerId, PlayerId>()
  if (screenIntent !== undefined) {
    screenPartnerByPlayerId.set(screenIntent.screenerId, screenIntent.ballHandlerId)
    screenPartnerByPlayerId.set(screenIntent.ballHandlerId, screenIntent.screenerId)
  }

  const reactionPhaseByDefenderId = new Map<PlayerId, 'HELP' | 'RECOVER'>()
  if (state.defensiveReaction !== undefined) {
    reactionPhaseByDefenderId.set(state.defensiveReaction.defenderId, state.defensiveReaction.phase)
    if (state.defensiveReaction.rotationDefenderId !== undefined) {
      reactionPhaseByDefenderId.set(state.defensiveReaction.rotationDefenderId, state.defensiveReaction.phase)
    }
  }
  const transitionActive = state.transitionIntent !== undefined

  const lastEvent = state.events.length > 0 ? state.events[state.events.length - 1] : undefined
  const looseBallContext: 'postMiss' | 'postTurnover' | 'other' =
    lastEvent?.type === 'shotMissed' ? 'postMiss' : lastEvent?.type === 'turnover' ? 'postTurnover' : 'other'

  const players: readonly PresentationPlayer[] = state.spatial.players.map((player) => {
    const meta = labels.get(player.playerId) ?? fallbackLabel(player.playerId)
    const isOffense = player.teamId === possessionView.offensiveTeamId
    const speedMetersPerSecond = Math.hypot(player.velocity.x, player.velocity.y)
    const hasBall = ownerPlayerId === player.playerId
    return {
      playerId: player.playerId,
      teamId: player.teamId,
      side: sideForTeam(player.teamId, state.homeTeamId),
      label: meta.label,
      jersey: meta.jersey,
      position: toPercent(player.position, court.lengthMeters, court.widthMeters),
      speedMetersPerSecond,
      orientationRadians: orientationFromVelocity(player.velocity),
      hasBall,
      isOffense,
      actionIntent: actionIntentFor({
        playerId: player.playerId,
        hasBall,
        isOffense,
        speedMetersPerSecond,
        offBallCut: state.offBallCut,
        screenIntent: state.screenIntent,
        driveIntent: state.driveIntent,
        transitionActive,
      }),
      defensiveIntent: isOffense
        ? undefined
        : defensiveIntentFor({
            playerId: player.playerId,
            speedMetersPerSecond,
            reactionDefenderIds: new Set(reactionPhaseByDefenderId.keys()),
            reactionPhaseByDefenderId,
            transitionActive,
          }),
      defendingPlayerId: isOffense ? undefined : offensiveByDefensivePlayerId.get(player.playerId),
      defendedByPlayerId: isOffense ? defenderByOffensivePlayerId.get(player.playerId) : undefined,
      screenPartnerId: screenPartnerByPlayerId.get(player.playerId),
    }
  })

  const presentationBall: PresentationBall = {
    position: toPercent(ball.position, court.lengthMeters, court.widthMeters),
    state: ballStateFor(ball, looseBallContext),
    ownerPlayerId,
    ownerTeamId,
    visualHeight: 0,
    isPassFlight: false,
    isShotFlight: false,
  }

  const screenTarget = state.screenIntent !== undefined ? toPercent(state.screenIntent.target, court.lengthMeters, court.widthMeters) : undefined
  const driveTarget = state.driveIntent !== undefined ? toPercent(state.driveIntent.target, court.lengthMeters, court.widthMeters) : undefined
  const shotTargetBasket =
    ownerPlayerId !== undefined ? toPercent(possessionView.attackingBasket, court.lengthMeters, court.widthMeters) : undefined

  return {
    simulationTick: state.nextSequence,
    court: presentationCourt,
    players,
    ball: presentationBall,
    clock: {
      period: state.period,
      periodCount: state.clockRules.periodCount,
      clockSecondsRemaining: state.clockSecondsRemaining,
      periodSeconds: state.clockRules.periodSeconds,
    },
    score: { home: state.homeScore, away: state.awayScore },
    possession: {
      offensiveTeamId: possessionView.offensiveTeamId,
      defensiveTeamId: possessionView.defensiveTeamId,
      ballHandlerId: possessionView.ballHandlerId,
      attackingBasket: toPercent(possessionView.attackingBasket, court.lengthMeters, court.widthMeters),
    },
    isComplete: state.isComplete,
    currentActionKind: describeOffensiveAction(state.offensiveAction),
    debugTargets: {
      screenTarget,
      driveTarget,
      passTargetPlayerId: undefined,
      shotTargetBasket,
    },
  }
}

function sideKeyForTeam(teamId: TeamId, homeTeamId: TeamId): 'home' | 'away' {
  return teamId === homeTeamId ? 'home' : 'away'
}

function describeOffensiveAction(action: OffensiveAction | undefined): string | undefined {
  return action?.kind
}

const EVENT_KIND_MAP: Partial<Record<MatchEvent['type'], MatchPresentationEventKind>> = {
  periodStart: 'periodStart',
  periodEnd: 'periodEnd',
  shotMade: 'shotMade',
  shotMissed: 'shotMissed',
  turnover: 'turnover',
  passCompleted: 'passCompleted',
  foul: 'foul',
  freeThrowMade: 'freeThrowMade',
  freeThrowMissed: 'freeThrowMissed',
  rebound: 'rebound',
  substitution: 'substitution',
  gameEnd: 'gameEnd',
}

/**
 * Converts one canonical MatchEvent into a MatchPresentationEvent. This is a 1:1 field copy plus
 * a kind relabeling — it introduces no new information and resolves no new outcome. The renderer
 * uses `kind` to pick an animation (e.g. a made-basket flash), never to decide whether the shot
 * went in; that boolean already lives in the event's `kind` itself (shotMade vs shotMissed).
 */
export function toMatchPresentationEvent(event: MatchEvent): MatchPresentationEvent {
  const kind = EVENT_KIND_MAP[event.type]
  if (kind === undefined) throw new Error(`Unsupported MatchEvent type for presentation: ${event.type}`)

  const base = {
    kind,
    sequence: event.sequence,
    period: event.period,
    clockSecondsRemaining: event.clockSecondsRemaining,
    homeScore: event.homeScore,
    awayScore: event.awayScore,
  }

  switch (event.type) {
    case 'shotMade':
      return { ...base, teamId: event.teamId, playerId: event.playerId, secondaryPlayerId: event.assistPlayerId, points: event.points, shotZone: event.shotZone }
    case 'shotMissed':
      return { ...base, teamId: event.teamId, playerId: event.playerId, secondaryPlayerId: event.blockedByPlayerId, points: undefined, shotZone: event.shotZone, blocked: event.blockedByPlayerId !== undefined }
    case 'turnover':
      return {
        ...base,
        teamId: event.teamId,
        playerId: event.playerId,
        secondaryPlayerId: event.stealPlayerId,
        points: undefined,
        ...(event.passTargetPlayerId === undefined ? {} : { passTargetPlayerId: event.passTargetPlayerId }),
      }
    case 'passCompleted':
      return { ...base, teamId: event.teamId, playerId: event.passerPlayerId, secondaryPlayerId: event.receiverPlayerId, points: undefined }
    case 'foul':
      return { ...base, teamId: event.teamId, playerId: event.playerId, secondaryPlayerId: undefined, points: undefined }
    case 'freeThrowMade':
    case 'freeThrowMissed':
      return { ...base, teamId: event.teamId, playerId: event.playerId, secondaryPlayerId: undefined, points: undefined }
    case 'rebound':
      return { ...base, teamId: event.teamId, playerId: event.playerId, secondaryPlayerId: undefined, points: undefined, reboundType: event.reboundType }
    case 'substitution':
      return { ...base, teamId: event.teamId, playerId: event.playerInId, secondaryPlayerId: event.playerOutId, points: undefined }
    case 'periodStart':
    case 'periodEnd':
    case 'gameEnd':
      return { ...base, teamId: undefined, playerId: undefined, secondaryPlayerId: undefined, points: undefined }
    default:
      throw new Error(`Unsupported MatchEvent type for presentation: ${(event as MatchEvent).type}`)
  }
}

/**
 * Converts every new engine event from one step into presentation events, preserving order.
 * Event types with no visual meaning (e.g. tacticalChange) are skipped, never guessed.
 */
export function toMatchPresentationEvents(events: readonly MatchEvent[]): readonly MatchPresentationEvent[] {
  return events.filter((event) => EVENT_KIND_MAP[event.type] !== undefined).map(toMatchPresentationEvent)
}

/**
 * BT1 — one engine step as a presentation SEGMENT.
 *
 * MatchEngine advances in coarse action steps: every step moves all ten players for `simSeconds`
 * of game clock and THEN resolves the outcome (pass / shot / rebound / turnover) at the resulting
 * positions. A segment keeps exactly that shape (from-state, to-state, the ordered events that
 * happened at the end of the movement, the game seconds the movement took) so the renderer can
 * play "move, then resolve" in the same order the engine decided it, instead of blending two
 * snapshots over an arbitrary wall-clock window.
 */
export function toMatchPresentationSegment(input: {
  readonly index: number
  readonly before: MatchSessionState
  readonly after: MatchSessionState
  readonly labels: PresentationPlayerLabels
  /** Optional debug-only payload (Basketball Truth frame) carried alongside, never interpreted here. */
  readonly truth?: PresentationSegment['truth']
}): PresentationSegment {
  const { before, after, labels } = input
  const newEvents = after.events.slice(before.events.length)
  const events = toMatchPresentationEvents(newEvents)
  const from = toMatchPresentationState(before, labels)
  const to = toMatchPresentationState(after, labels)
  const beforeView = getSpatialPossessionView({
    homeTeamId: before.homeTeamId,
    awayTeamId: before.awayTeamId,
    attackingTeamId: before.attackingTeamId,
    period: before.period,
    spatial: before.spatial,
  })
  const court = before.spatial.court
  const attackedBasket = toPercent(beforeView.attackingBasket, court.lengthMeters, court.widthMeters)
  const lastBefore = before.events.length > 0 ? before.events[before.events.length - 1] : undefined
  const substitutions = events
    .filter((event) => event.kind === 'substitution' && event.playerId !== undefined && event.secondaryPlayerId !== undefined)
    .map((event) => ({ playerInId: event.playerId!, playerOutId: event.secondaryPlayerId! }))
  const samePeriod = before.period === after.period
  const simSeconds = samePeriod ? Math.max(0, before.clockSecondsRemaining - after.clockSecondsRemaining) : 0
  return {
    index: input.index,
    from,
    to,
    simSeconds,
    events,
    actorPlayerId: actorFromEvents(events),
    attackedBasket,
    previousEnding: previousEndingFor(lastBefore),
    substitutions,
    ...(input.truth === undefined ? {} : { truth: input.truth }),
  }
}

function actorFromEvents(events: readonly MatchPresentationEvent[]): PlayerId | undefined {
  for (const event of events) {
    switch (event.kind) {
      case 'passCompleted':
      case 'shotMade':
      case 'shotMissed':
      case 'turnover':
      case 'freeThrowMade':
      case 'freeThrowMissed':
        return event.playerId
      default:
    }
  }
  return undefined
}

function previousEndingFor(event: MatchEvent | undefined): PresentationSegment['previousEnding'] {
  switch (event?.type) {
    case 'shotMade':
      return 'madeShot'
    case 'freeThrowMade':
    case 'freeThrowMissed':
      return 'freeThrow'
    case 'turnover':
      return 'turnover'
    case 'periodStart':
      return 'periodStart'
    default:
      return 'none'
  }
}
