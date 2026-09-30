/**
 * BT4A/B/D: pace accounting. Every tick of a game is put in exactly one phase from facts of the MatchState (ball, possession, offense
 * flow, action, transition, clock), then summed per possession. It reads only fields that exist since BT2, so the same classifier runs on
 * the BT2 and BT3 engines and the two are comparable. Nothing here changes a game.
 */
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import type { MatchNextEvent, MatchState } from '@/engine/match-next'
import { preparedSetup } from '../bt2/economy'

export const PHASES = ['inbound', 'transition', 'early', 'settlement', 'reading', 'actionSetup', 'actionExecution', 'advantage', 'reset', 'shot', 'rebound', 'deadBall'] as const
export type Phase = (typeof PHASES)[number]

export function classifyPhase(s: MatchState): Phase {
  const ball = s.ball
  if (ball.kind === 'INBOUND' || (ball.kind === 'PASS_IN_FLIGHT' && ball.isInbound)) return 'inbound'
  if (ball.kind === 'DEAD') return 'deadBall'
  if (ball.kind === 'SHOT_IN_FLIGHT') return 'shot'
  if (ball.kind === 'REBOUNDABLE' || ball.kind === 'LOOSE') return 'rebound'
  const possession = s.possessions.find((item) => item.id === s.activePossessionId)
  if (possession === undefined) return 'deadBall'
  if (possession.phase === 'SHOT') return 'shot'
  if (s.transition !== null && s.transition.teamId === possession.teamId && (possession.phase === 'ADVANCE' || possession.phase === 'ACTION')) return 'transition'
  if (possession.phase === 'ADVANCE' || possession.phase === 'INBOUND') return 'transition'
  const flow = s.offenseFlow
  if (flow === null || flow.possessionId !== possession.id) return 'early'
  switch (flow.stage) {
    case 'EARLY': return 'early'
    case 'HALF_COURT': return flow.settledAtT === null ? 'settlement' : 'reading'
    case 'ACTION': {
      const active = s.actions.find((action) => action.status === 'ACTIVE' && action.teamId === possession.teamId && action.kind !== 'CLOSEOUT')
      if (s.screen !== null) return 'actionSetup'
      return active === undefined ? 'reading' : 'actionExecution'
    }
    case 'ADVANTAGE': return 'advantage'
    case 'RESET': return 'reset'
    default: return 'reading'
  }
}

export interface PossessionRecord {
  readonly id: string
  readonly startReason: string
  readonly endReason: string | undefined
  readonly startT: number
  readonly endT: number
  readonly ticks: Readonly<Record<string, number>>
  readonly secondChance: boolean
  readonly afterFreeThrows: boolean
  readonly shots: number
  readonly firstShotPhase: string | undefined
  readonly firstShotAtSeconds: number | undefined
}

export interface PaceGame {
  readonly seed: number
  readonly complete: boolean
  readonly totalTicks: number
  readonly clockRunningTicks: number
  readonly clockStoppedTicks: number
  /** Ticks with no possession alive (between the end of one and the start of the next), by ball reason. */
  readonly betweenTicks: Readonly<Record<string, number>>
  readonly phaseTicks: Readonly<Record<string, number>>
  readonly clockTicksByPhase: Readonly<Record<string, number>>
  readonly possessions: readonly PossessionRecord[]
  /** Action counts of the whole game (from the event stream). */
  readonly counts: Readonly<Record<string, number>>
}

interface OpenPossession {
  startReason: string
  startT: number
  ticks: Record<string, number>
  secondChance: boolean
  afterFreeThrows: boolean
  shots: number
  firstShotPhase?: string
  firstShotAt?: number
}

export function runPaceGame(seed: number, maxTicks = 60000): PaceGame {
  const live = createMatchEnginePort('match-next').createLiveSession(preparedSetup(seed))
  const phaseTicks: Record<string, number> = {}
  const clockTicksByPhase: Record<string, number> = {}
  const betweenTicks: Record<string, number> = {}
  const open = new Map<string, OpenPossession>()
  const records: PossessionRecord[] = []
  let clockRunning = 0
  let clockStopped = 0
  let previousPhase: Phase = 'deadBall'
  let lastTerminalFt = -100
  while (!live.matchState.isComplete && live.matchState.t < maxTicks) {
    live.advanceOneStep()
    const s = live.matchState
    const events: MatchNextEvent[] = []
    for (let index = s.events.length - 1; index >= 0 && s.events[index]!.t === s.t; index -= 1) events.push(s.events[index]!)
    events.reverse()
    for (const event of events) {
      if ((event.type === 'freeThrowMade' || event.type === 'freeThrowMissed') && event.freeThrowIndex === event.freeThrowTotal) lastTerminalFt = s.t
      if (event.type === 'possessionStart') open.set(event.possessionId!, { startReason: event.startReason ?? '?', startT: s.t, ticks: {}, secondChance: false, afterFreeThrows: s.t - lastTerminalFt <= 40, shots: 0 })
      const record = event.possessionId === undefined ? undefined : open.get(event.possessionId)
      if (record === undefined) continue
      if (event.type === 'reboundSecured' && event.reboundType === 'offensive') record.secondChance = true
      if (event.type === 'shotReleased') {
        record.shots += 1
        if (record.firstShotPhase === undefined) { record.firstShotPhase = previousPhase; record.firstShotAt = (s.t - record.startT) / 10 }
      }
    }
    const phase = classifyPhase(s)
    previousPhase = phase
    phaseTicks[phase] = (phaseTicks[phase] ?? 0) + 1
    if (s.clock.gameRunning) { clockRunning += 1; clockTicksByPhase[phase] = (clockTicksByPhase[phase] ?? 0) + 1 } else clockStopped += 1
    const id = s.activePossessionId
    const current = id === null ? undefined : open.get(id)
    const alive = current !== undefined && s.possessions.find((item) => item.id === id)?.endReason === undefined
    if (alive) current.ticks[phase] = (current.ticks[phase] ?? 0) + 1
    else {
      const key = s.ball.kind === 'DEAD' ? `dead:${(s.ball as { reason?: string }).reason ?? '?'}` : s.ball.kind
      betweenTicks[key] = (betweenTicks[key] ?? 0) + 1
    }
    for (const event of events) {
      if (event.type !== 'possessionEnd' || event.possessionId === undefined) continue
      const record = open.get(event.possessionId)
      if (record === undefined) continue
      records.push({ id: event.possessionId, startReason: record.startReason, endReason: event.endReason, startT: record.startT, endT: s.t, ticks: record.ticks, secondChance: record.secondChance, afterFreeThrows: record.afterFreeThrows, shots: record.shots, firstShotPhase: record.firstShotPhase, firstShotAtSeconds: record.firstShotAt })
      open.delete(event.possessionId)
    }
  }
  const final = live.matchState.events
  const counts: Record<string, number> = {
    drives: final.filter((e) => e.type === 'actionStarted' && e.actionKind === 'DRIVE').length, screens: final.filter((e) => e.type === 'screenSet').length,
    passes: final.filter((e) => e.type === 'passReleased').length, shots: final.filter((e) => e.type === 'shotReleased').length,
    threes: final.filter((e) => e.type === 'shotReleased' && e.points === 3).length, made: final.filter((e) => e.type === 'shotMade').length,
    fta: final.filter((e) => e.type === 'freeThrowMade' || e.type === 'freeThrowMissed').length, turnovers: final.filter((e) => e.type === 'turnover').length,
    points: live.matchState.score.home + live.matchState.score.away,
  }
  return { seed, complete: live.matchState.isComplete, totalTicks: live.matchState.t, clockRunningTicks: clockRunning, clockStoppedTicks: clockStopped, betweenTicks, phaseTicks, clockTicksByPhase, possessions: records, counts }
}

export function quantiles(values: readonly number[]): { n: number; mean: number; median: number; p10: number; p90: number; min: number; max: number } {
  if (values.length === 0) return { n: 0, mean: 0, median: 0, p10: 0, p90: 0, min: 0, max: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const at = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!
  const round = (v: number): number => Number(v.toFixed(2))
  return { n: values.length, mean: round(values.reduce((a, b) => a + b, 0) / values.length), median: round(at(0.5)), p10: round(at(0.1)), p90: round(at(0.9)), min: round(sorted[0]!), max: round(sorted.at(-1)!) }
}

export const DURATION_BINS = [['<4 s', 0, 4], ['4-8 s', 4, 8], ['8-12 s', 8, 12], ['12-16 s', 12, 16], ['16-20 s', 16, 20], ['>20 s', 20, 1e9]] as const

export function categoryOf(record: PossessionRecord): string {
  if (record.secondChance) return 'secondChance'
  if (record.startReason === 'madeBasketInbound') return record.afterFreeThrows ? 'afterFreeThrows' : 'afterMadeBasket'
  if (record.startReason === 'defensiveRebound') return 'afterDefensiveRebound'
  if (record.startReason === 'steal' || record.startReason === 'turnoverInbound' || record.startReason === 'other' || record.startReason === 'shotClockViolation') return 'afterTurnover'
  return record.startReason
}

export function summarizePace(games: readonly PaceGame[]): Record<string, unknown> {
  const all = games.flatMap((g) => g.possessions)
  const seconds = (r: PossessionRecord): number => (r.endT - r.startT) / 10
  const totalPossTicks = all.reduce((a, r) => a + (r.endT - r.startT), 0)
  const perGame = (f: (g: PaceGame) => number): number => Number((games.reduce((a, g) => a + f(g), 0) / games.length).toFixed(2))
  const inBin = (rows: readonly PossessionRecord[], lo: number, hi: number): number => Number((rows.filter((r) => seconds(r) >= lo && seconds(r) < hi).length / Math.max(1, rows.length)).toFixed(3))
  const phaseRows = PHASES.map((phase) => {
    const perPossession = all.map((r) => (r.ticks[phase] ?? 0) / 10)
    const present = perPossession.filter((v) => v > 0)
    const ticksIn = all.reduce((a, r) => a + (r.ticks[phase] ?? 0), 0)
    return { phase, share: Number((ticksIn / Math.max(1, totalPossTicks)).toFixed(3)), frequency: Number((present.length / Math.max(1, all.length)).toFixed(3)), secondsWhenPresent: quantiles(present), secondsPerPossession: quantiles(perPossession) }
  })
  const bins = Object.fromEntries(DURATION_BINS.map(([label, lo, hi]) => [label, inBin(all, lo, hi)]))
  const categories = [...new Set(all.map(categoryOf))].sort()
  const byCategory = Object.fromEntries(categories.map((c) => {
    const rows = all.filter((r) => categoryOf(r) === c)
    return [c, { perGame: Number((rows.length / games.length).toFixed(1)), seconds: quantiles(rows.map(seconds)), bins: Object.fromEntries(DURATION_BINS.map(([label, lo, hi]) => [label, inBin(rows, lo, hi)])), shotsPerPossession: Number((rows.reduce((a, r) => a + r.shots, 0) / Math.max(1, rows.length)).toFixed(2)) }]
  }))
  const byEnd = Object.fromEntries([...new Set(all.map((r) => r.endReason ?? 'open'))].map((e) => {
    const rows = all.filter((r) => (r.endReason ?? 'open') === e)
    return [e, { perGame: Number((rows.length / games.length).toFixed(1)), seconds: quantiles(rows.map(seconds)) }]
  }))
  const firstShot = Object.fromEntries([...new Set(all.map((r) => r.firstShotPhase ?? 'noShot'))].map((p) => {
    const rows = all.filter((r) => (r.firstShotPhase ?? 'noShot') === p)
    return [p, { share: Number((rows.length / all.length).toFixed(3)), atSeconds: quantiles(rows.flatMap((r) => (r.firstShotAtSeconds === undefined ? [] : [r.firstShotAtSeconds]))) }]
  }))
  const between: Record<string, number> = {}
  for (const g of games) for (const [k, v] of Object.entries(g.betweenTicks)) between[k] = (between[k] ?? 0) + v
  return {
    games: games.length, complete: games.filter((g) => g.complete).length,
    perGame: {
      possessions: perGame((g) => g.possessions.length), ticks: perGame((g) => g.totalTicks), clockRunningSeconds: perGame((g) => g.clockRunningTicks / 10), clockStoppedSeconds: perGame((g) => g.clockStoppedTicks / 10),
      possessionSecondsTotal: perGame((g) => g.possessions.reduce((a, r) => a + (r.endT - r.startT), 0) / 10),
      betweenPossessionsSeconds: perGame((g) => Object.values(g.betweenTicks).reduce((a, b) => a + b, 0) / 10),
    },
    counts: Object.fromEntries(Object.keys(games[0]!.counts).map((k) => [k, perGame((g) => g.counts[k] ?? 0)])),
    possessionSeconds: quantiles(all.map(seconds)), phases: phaseRows, durationBins: bins, byCategory, byEnd, firstShot,
    betweenPossessionsSecondsPerGame: Object.fromEntries(Object.entries(between).map(([k, v]) => [k, Number((v / games.length / 10).toFixed(1))])),
    clockSecondsByPhasePerGame: Object.fromEntries(PHASES.map((p) => [p, perGame((g) => (g.clockTicksByPhase[p] ?? 0) / 10)])),
  }
}
