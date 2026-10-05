/**
 * BT2A / BT2N — possession-economy audit over FULL MatchEngine Next games.
 *
 * Works from the canonical event stream of a completed game (cheap: no per-tick frames) plus periodic state samples for the
 * half-court settlement metrics. Reports DISTRIBUTIONS (mean / median / p10 / p90 / min / max), never only means, across seeds.
 */

import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import type { MatchNextEvent, MatchSetup, MatchState } from '@/engine/match-next'
import { distanceBetween } from '@/domain/court'
import { attackingBasketForTeam } from '@/engine/match-next/structure/FiveOutStructure'
import { isInsideZone } from '@/engine/match-next/structure/OffensiveStructure'

export interface Dist {
  readonly n: number
  readonly mean: number
  readonly median: number
  readonly p10: number
  readonly p90: number
  readonly min: number
  readonly max: number
}

export function dist(values: readonly number[]): Dist {
  if (values.length === 0) return { n: 0, mean: 0, median: 0, p10: 0, p90: 0, min: 0, max: 0 }
  const s = [...values].sort((a, b) => a - b)
  const q = (p: number): number => s[Math.min(s.length - 1, Math.floor(p * s.length))]!
  const r = (v: number): number => Number(v.toFixed(2))
  return { n: s.length, mean: r(s.reduce((a, b) => a + b, 0) / s.length), median: r(q(0.5)), p10: r(q(0.1)), p90: r(q(0.9)), min: r(s[0]!), max: r(s[s.length - 1]!) }
}

export interface PossessionEconomy {
  readonly id: string
  readonly seconds: number
  readonly startReason: string
  readonly endReason: string
  readonly decisions: number
  readonly passes: number
  readonly drives: number
  readonly screens: number
  readonly shots: number
  readonly offensiveRebounds: number
  readonly putbacks: number
  readonly setupSeconds: number
  readonly firstShotSecondsAfterSetup: number | undefined
  readonly points: number
}

export interface ReboundRecord {
  readonly landingStartedT: number
  readonly shotDistance: number
  readonly landingDistanceToRim: number
  /** Nearest distance of the shooting team / defending team to the landing point when the ball comes down. */
  readonly offenseNearest: number
  readonly defenseNearest: number
  readonly offenseWithin2m: number
  readonly defenseWithin2m: number
  readonly winnerTeam: 'offense' | 'defense' | 'unknown'
}

export interface ShotRecord {
  readonly releaseT: number
  readonly distance: number
  readonly points: number
  readonly probability: number
  readonly contest: number
  readonly made: boolean
}

export interface GameEconomy {
  readonly seed: number
  readonly complete: boolean
  readonly ticks: number
  readonly points: number
  readonly homePoints: number
  readonly awayPoints: number
  readonly shots: number
  readonly threes: number
  readonly made: number
  readonly shotsOver9m: number
  readonly shotDistances: readonly number[]
  readonly possessions: readonly PossessionEconomy[]
  readonly rebounds: number
  readonly offensiveRebounds: number
  readonly putbacks: number
  readonly turnovers: number
  readonly shotClockViolations: number
  readonly decisionGapsSeconds: readonly number[]
  readonly shotRecords: readonly ShotRecord[]
  readonly reboundRecords: readonly ReboundRecord[]
  readonly setupDecisionsPerSecond: number
  readonly eventCounts: Readonly<Record<string, number>>
}

export function preparedSetup(seed: number, clock?: { periodSeconds?: number; periodCount?: number }): MatchSetup {
  const world = createNewGame()
  const game = Object.values(world.games).find((g) => g.status === 'scheduled')!
  const prepared = createMatchEnginePort('match-next').prepare(world, game, seed)
  return clock === undefined ? prepared : { ...prepared, clockRules: { ...prepared.clockRules, ...(clock.periodSeconds === undefined ? {} : { periodSeconds: clock.periodSeconds }), ...(clock.periodCount === undefined ? {} : { periodCount: clock.periodCount }) } }
}

export function analyzeGame(seed: number, state: MatchState, complete: boolean): GameEconomy {
  const events: readonly MatchNextEvent[] = state.events
  const shotEvents = events.filter((e) => e.type === 'shotReleased')
  const shotDistances: number[] = []
  let threes = 0
  for (const e of shotEvents) {
    if (e.points === 3) threes += 1
  }
  // Shot distance: from the position of the shooter at release. We recover it from the released events' tick via a
  // dedicated side channel: audits that need distances pass `shotDistances` collected while stepping (see runGame).
  const byPossession = new Map<string, MatchNextEvent[]>()
  for (const e of events) {
    if (e.possessionId === undefined) continue
    const list = byPossession.get(e.possessionId) ?? []
    list.push(e)
    byPossession.set(e.possessionId, list)
  }
  // Decision/action events carry no possessionId: attach them to the possession of that team whose window contains them.
  const windows = [...byPossession.entries()].map(([id, list]) => ({
    id,
    list,
    teamId: list.find((e) => e.type === 'possessionStart')?.teamId,
    from: list.find((e) => e.type === 'possessionStart')?.t ?? 0,
    to: list.find((e) => e.type === 'possessionEnd')?.t ?? Infinity,
  }))
  for (const e of events) {
    if (e.possessionId !== undefined || (e.type !== 'decisionSelected' && e.type !== 'actionStarted')) continue
    windows.find((w) => w.teamId === e.teamId && e.t >= w.from && e.t <= w.to)?.list.push(e)
  }
  const possessions: PossessionEconomy[] = []
  for (const [id, list] of byPossession) {
    const start = list.find((e) => e.type === 'possessionStart')
    const end = list.find((e) => e.type === 'possessionEnd')
    if (start === undefined || end === undefined) continue
    const shots = list.filter((e) => e.type === 'shotReleased')
    const oreb = list.filter((e) => e.type === 'reboundSecured' && e.reboundType === 'offensive')
    const putbacks = shots.filter((s) => oreb.some((r) => s.t >= r.t && s.t - r.t <= 25)).length
    const setup = list.find((e) => e.type === 'possessionPhaseChanged' && e.phase === 'SETUP')
    const firstShot = shots[0]
    possessions.push({
      id,
      seconds: (end.t - start.t) / 10,
      startReason: start.startReason ?? '?',
      endReason: end.endReason ?? '?',
      decisions: list.filter((e) => e.type === 'decisionSelected').length,
      passes: list.filter((e) => e.type === 'passReceived').length,
      drives: list.filter((e) => e.type === 'actionStarted' && e.actionKind === 'DRIVE').length,
      screens: list.filter((e) => e.type === 'actionStarted' && e.actionKind === 'SCREEN').length,
      shots: shots.length,
      offensiveRebounds: oreb.length,
      putbacks,
      setupSeconds: setup === undefined ? 0 : (end.t - setup.t) / 10,
      firstShotSecondsAfterSetup: setup === undefined || firstShot === undefined ? undefined : (firstShot.t - setup.t) / 10,
      points: list.filter((e) => e.type === 'shotMade').reduce((a, e) => a + (e.points ?? 0), 0),
    })
  }
  const decisionTicks = events.filter((e) => e.type === 'decisionSelected').map((e) => e.t).sort((a, b) => a - b)
  const gaps: number[] = []
  for (let i = 1; i < decisionTicks.length; i += 1) gaps.push((decisionTicks[i]! - decisionTicks[i - 1]!) / 10)
  const eventCounts: Record<string, number> = {}
  for (const e of events) eventCounts[e.type] = (eventCounts[e.type] ?? 0) + 1
  const setupSeconds = possessions.reduce((a, p) => a + p.setupSeconds, 0)
  const decisions = possessions.reduce((a, p) => a + p.decisions, 0)
  return {
    seed,
    complete,
    ticks: state.t,
    points: state.score.home + state.score.away,
    homePoints: state.score.home,
    awayPoints: state.score.away,
    shots: shotEvents.length,
    threes,
    made: events.filter((e) => e.type === 'shotMade').length,
    shotsOver9m: 0,
    shotDistances,
    possessions,
    rebounds: events.filter((e) => e.type === 'reboundSecured').length,
    offensiveRebounds: events.filter((e) => e.type === 'reboundSecured' && e.reboundType === 'offensive').length,
    putbacks: possessions.reduce((a, p) => a + p.putbacks, 0),
    turnovers: possessions.filter((p) => p.endReason === 'turnover').length,
    shotClockViolations: events.filter((e) => e.type === 'shotClockViolation').length,
    decisionGapsSeconds: gaps,
    shotRecords: [],
    reboundRecords: [],
    setupDecisionsPerSecond: setupSeconds > 0 ? Number((decisions / setupSeconds).toFixed(3)) : 0,
    eventCounts,
  }
}

/** Plays a full game in 3-tick strides (a shot flight lasts 6 ticks, so every release is observed once). */
export function runGame(seed: number, opts: { maxTicks?: number } = {}): { economy: GameEconomy; samples: readonly SpacingSample[] } {
  const port = createMatchEnginePort('match-next')
  const live = port.createLiveSession(preparedSetup(seed))
  const shotDistances: number[] = []
  const shotRecords: ShotRecord[] = []
  const reboundRecords: ReboundRecord[] = []
  const seenLanding = new Set<number>()
  const seenRelease = new Set<number>()
  const samples: SpacingSample[] = []
  const maxTicks = opts.maxTicks ?? 80000
  while (!live.matchState.isComplete && live.matchState.t < maxTicks) {
    live.advanceTicks(3)
    const st = live.matchState
    if (st.ball.kind === 'SHOT_IN_FLIGHT' && !seenRelease.has(st.ball.releaseT)) {
      seenRelease.add(st.ball.releaseT)
      shotDistances.push(distanceBetween(st.ball.from, st.ball.targetBasket))
      shotRecords.push({ releaseT: st.ball.releaseT, distance: distanceBetween(st.ball.from, st.ball.targetBasket), points: st.ball.shotValue ?? 2, probability: st.ball.shotProbability ?? 0, contest: st.ball.contestScore ?? 0, made: st.ball.plannedOutcome.kind === 'MAKE' })
    }
    if (st.ball.kind === 'REBOUNDABLE' && !seenLanding.has(st.ball.landingStartedT)) {
      seenLanding.add(st.ball.landingStartedT)
      const ball = st.ball
      const near = (own: boolean): number[] => st.players.filter((p) => p.active && (p.teamId === ball.shootingTeamId) === own).map((p) => distanceBetween(p.position, ball.landingTarget))
      const off = near(true)
      const def = near(false)
      const last = shotRecords.at(-1)
      reboundRecords.push({
        landingStartedT: ball.landingStartedT, shotDistance: last?.distance ?? 0, landingDistanceToRim: distanceBetween(ball.landingTarget, st.ball.landingFrom),
        offenseNearest: Math.min(...off), defenseNearest: Math.min(...def), offenseWithin2m: off.filter((d) => d <= 2).length, defenseWithin2m: def.filter((d) => d <= 2).length, winnerTeam: 'unknown',
      })
    }
    const s = sampleSpacing(st)
    if (s !== undefined) samples.push(s)
  }
  const economy = analyzeGame(seed, live.matchState, live.matchState.isComplete)
  return { economy: { ...economy, shotDistances, shotRecords, reboundRecords: attachWinners(reboundRecords, live.matchState.events), shotsOver9m: shotDistances.filter((d) => d > 9).length }, samples }
}

function attachWinners(records: readonly ReboundRecord[], events: readonly MatchNextEvent[]): ReboundRecord[] {
  const secured = events.filter((e) => e.type === 'reboundSecured')
  return records.map((r, i) => {
    const e = secured[i]
    return { ...r, winnerTeam: e === undefined ? 'unknown' : e.reboundType === 'offensive' ? 'offense' : 'defense' }
  })
}

export interface SpacingSample {
  readonly t: number
  readonly phase: string
  readonly cornersOccupied: number
  readonly withinOneMeterOfSlot: number
  readonly offensivePlayers: number
  readonly meanDistanceToSlot: number
  readonly minPairDistance: number
  readonly paintOccupants: number
  readonly ballHeldSeconds: number
  /** Mean distance from each off-ball attacker to his assigned defender, and how many of them are more than 2.5 m from him. */
  readonly meanGuardDistance: number
  /** True once the half court counted as set (BT2B) and how many off-ball players stand inside their 5-out zone. */
  readonly settled: boolean
  readonly inZone: number
  readonly openAttackers: number
}

let heldSince = new Map<string, number>()

export function sampleSpacing(state: MatchState): SpacingSample | undefined {
  const structure = state.offensiveStructure
  const possession = state.activePossessionId === null ? undefined : state.possessions.find((p) => p.id === state.activePossessionId)
  if (structure === null || possession === undefined || (possession.phase !== 'SETUP' && possession.phase !== 'ACTION') || (state.ball.kind !== 'HELD' && state.ball.kind !== 'PASS_IN_FLIGHT')) {
    heldSince = new Map()
    return undefined
  }
  const key = state.ball.kind === 'HELD' ? `${state.ball.ownerPlayerId}` : 'flight'
  if (!heldSince.has(key)) heldSince = new Map([[key, state.t]])
  const basket = attackingBasketForTeam(possession.teamId, state.homeTeamId, state.period, state.court)
  const offense = state.players.filter((p) => p.active && p.teamId === possession.teamId)
  const slots = new Map(structure.slots.map((s) => [s.slot, s.position]))
  let within = 0
  let total = 0
  let sum = 0
  for (const p of offense) {
    const slot = structure.assignments.find((a) => a.playerId === p.playerId)?.slot
    if (slot === undefined || slot === 'BALL') continue
    const target = slots.get(slot)
    if (target === undefined) continue
    const d = distanceBetween(p.position, target)
    total += 1
    sum += d
    if (d < 1) within += 1
  }
  let inZone = 0
  for (const p of offense) {
    const slot = structure.assignments.find((a) => a.playerId === p.playerId)?.slot
    const target = slot === undefined || slot === 'BALL' ? undefined : slots.get(slot)
    if (target !== undefined && isInsideZone(p.position, target, basket)) inZone += 1
  }
  const guardDistances: number[] = []
  const holderId = state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : undefined
  for (const p of offense) {
    if (p.playerId === holderId) continue
    const guardId = state.defensiveStructure?.assignments.find((a) => a.attackerPlayerId === p.playerId)?.defenderPlayerId
    const guard = state.players.find((q) => q.playerId === guardId)
    if (guard !== undefined) guardDistances.push(distanceBetween(p.position, guard.position))
  }
  let min = Infinity
  for (let i = 0; i < offense.length; i += 1) for (let j = i + 1; j < offense.length; j += 1) min = Math.min(min, distanceBetween(offense[i]!.position, offense[j]!.position))
  const corner = (p: { position: { x: number; y: number } }): boolean => {
    const depth = basket.x > state.court.lengthMeters / 2 ? state.court.lengthMeters - p.position.x : p.position.x
    return depth <= 4.2 && Math.min(p.position.y, state.court.widthMeters - p.position.y) <= 1.6
  }
  const paint = (p: { position: { x: number; y: number } }): boolean => {
    const depth = basket.x > state.court.lengthMeters / 2 ? state.court.lengthMeters - p.position.x : p.position.x
    return depth <= 5.8 && Math.abs(p.position.y - state.court.widthMeters / 2) <= 2.45
  }
  return {
    t: state.t,
    phase: possession.phase,
    cornersOccupied: offense.filter(corner).length,
    withinOneMeterOfSlot: within,
    offensivePlayers: total,
    meanDistanceToSlot: total === 0 ? 0 : sum / total,
    minPairDistance: min,
    paintOccupants: offense.filter(paint).length,
    ballHeldSeconds: (state.t - (heldSince.get(key) ?? state.t)) / 10,
    settled: state.offenseFlow?.settledAtT != null,
    inZone,
    meanGuardDistance: guardDistances.length === 0 ? 0 : guardDistances.reduce((a, b) => a + b, 0) / guardDistances.length,
    openAttackers: guardDistances.filter((d) => d > 2.5).length,
  }
}

export interface GameSummary {
  readonly seed: number
  readonly points: number
  readonly shots: number
  readonly possessions: number
  readonly shotsPerPossession: number
  readonly meanPossessionSeconds: number
  readonly threeShare: number
  readonly shotsOver9mShare: number
  readonly offensiveReboundShare: number
  readonly putbackShots: number
  readonly turnovers: number
  readonly fieldGoalPct: number
  readonly shotClockViolations: number
}

export function summarizeGame(g: GameEconomy): GameSummary {
  return {
    seed: g.seed,
    points: g.points,
    shots: g.shots,
    possessions: g.possessions.length,
    shotsPerPossession: Number((g.shots / Math.max(1, g.possessions.length)).toFixed(2)),
    meanPossessionSeconds: Number((g.possessions.reduce((a, p) => a + p.seconds, 0) / Math.max(1, g.possessions.length)).toFixed(2)),
    threeShare: Number((g.threes / Math.max(1, g.shots)).toFixed(3)),
    shotsOver9mShare: Number((g.shotsOver9m / Math.max(1, g.shots)).toFixed(3)),
    offensiveReboundShare: Number((g.offensiveRebounds / Math.max(1, g.rebounds)).toFixed(3)),
    putbackShots: g.putbacks,
    turnovers: g.turnovers,
    fieldGoalPct: Number((g.made / Math.max(1, g.shots)).toFixed(3)),
    shotClockViolations: g.shotClockViolations,
  }
}
