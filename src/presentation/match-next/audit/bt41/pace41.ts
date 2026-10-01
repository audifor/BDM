/**
 * BT4.1 pace audit. A finer version of the BT4A accounting: every tick goes into exactly one fine phase from facts of the MatchState,
 * and every possession keeps what happened in it (passes, actions, decisions, first shot, shot clock at the shots) so short possessions
 * can be classified from evidence. Nothing here changes a game.
 */
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import type { MatchNextEvent, MatchState } from '@/engine/match-next'
import { preparedSetup } from '../bt2/economy'
import { quantiles } from '../bt4/pace'

export const FINE_PHASES = ['inbound', 'backcourtAdvance', 'transition', 'earlyOffense', 'settlement', 'reading', 'offBallMove', 'screenSetup', 'screenUse', 'drive', 'passFlight', 'catchGather', 'shotSetup', 'shotFlight', 'rebound', 'offensiveReset', 'advantage', 'deadBall'] as const
export type FinePhase = (typeof FINE_PHASES)[number]

function actionPhase(kind: string): FinePhase {
  switch (kind) {
    case 'DRIVE': return 'drive'
    case 'SCREEN': return 'screenSetup'
    case 'PASS': case 'KICK_OUT': return 'catchGather'
    case 'SHOOT': case 'CATCH_AND_SHOOT': return 'shotSetup'
    default: return 'reading'
  }
}

export function classifyFine(s: MatchState): FinePhase {
  const ball = s.ball
  if (ball.kind === 'INBOUND' || (ball.kind === 'PASS_IN_FLIGHT' && ball.isInbound)) return 'inbound'
  if (ball.kind === 'DEAD') return 'deadBall'
  if (ball.kind === 'SHOT_IN_FLIGHT') return 'shotFlight'
  if (ball.kind === 'REBOUNDABLE' || ball.kind === 'LOOSE') return 'rebound'
  if (ball.kind === 'PASS_IN_FLIGHT') return 'passFlight'
  const possession = s.possessions.find((item) => item.id === s.activePossessionId)
  if (possession === undefined) return 'deadBall'
  if (possession.phase === 'SHOT') return 'shotSetup'
  if (possession.phase === 'INBOUND') return 'inbound'
  if (possession.phase === 'ADVANCE') return s.transition !== null && s.transition.teamId === possession.teamId ? 'transition' : 'backcourtAdvance'
  if (s.transition !== null && s.transition.teamId === possession.teamId && possession.phase === 'ACTION') return 'transition'
  const flow = s.offenseFlow
  if (flow === null || flow.possessionId !== possession.id) return 'earlyOffense'
  const active = s.actions.find((action) => action.status === 'ACTIVE' && action.teamId === possession.teamId && action.kind !== 'CLOSEOUT')
  switch (flow.stage) {
    case 'EARLY': return active === undefined ? 'earlyOffense' : actionPhase(active.kind)
    case 'HALF_COURT': return flow.settledAtT === null ? 'settlement' : flow.moves.length > 0 ? 'offBallMove' : 'reading'
    case 'ACTION':
      if (s.screen !== null) return 'screenSetup'
      return active === undefined ? (flow.moves.length > 0 ? 'offBallMove' : 'reading') : actionPhase(active.kind)
    case 'ADVANTAGE': return 'advantage'
    case 'RESET': return 'offensiveReset'
    default: return 'reading'
  }
}

export interface PossessionDetail {
  readonly id: string
  readonly startReason: string
  readonly endReason: string | undefined
  readonly seconds: number
  readonly ticks: Readonly<Record<string, number>>
  readonly secondChance: boolean
  readonly afterFreeThrows: boolean
  readonly passes: number
  readonly drives: number
  readonly screens: number
  readonly decisions: number
  readonly cancelled: number
  readonly shots: number
  readonly firstShotAtSeconds: number | undefined
  readonly firstShotCreation: string | undefined
  readonly firstShotZone: string | undefined
  readonly firstShotSettled: boolean | undefined
  readonly firstShotContest: number | undefined
  readonly shotClockAtShots: readonly number[]
  readonly turnoverType: string | undefined
  readonly reachedHalfCourt: boolean
}

export interface Game41 {
  readonly seed: number
  readonly complete: boolean
  readonly possessions: readonly PossessionDetail[]
  readonly clockRunningTicks: number
  readonly counts: Readonly<Record<string, number>>
  readonly reboundToNext: readonly { readonly kind: string; readonly ticks: number }[]
}

interface Open {
  startReason: string; startT: number; ticks: Record<string, number>; secondChance: boolean; afterFreeThrows: boolean
  passes: number; drives: number; screens: number; decisions: number; cancelled: number; shots: number
  firstShotAt?: number; firstShotCreation?: string; firstShotZone?: string; firstShotSettled?: boolean; firstShotContest?: number
  shotClock: number[]; turnoverType?: string; halfCourt: boolean
}

export function runGame41(seed: number, maxTicks = 60000): Game41 {
  const live = createMatchEnginePort('match-next').createLiveSession(preparedSetup(seed))
  const open = new Map<string, Open>()
  const out: PossessionDetail[] = []
  const reboundToNext: { kind: string; ticks: number }[] = []
  let clockRunning = 0
  let lastTerminalFt = -100
  let pendingOreb: { t: number; sequence: number } | null = null
  while (!live.matchState.isComplete && live.matchState.t < maxTicks) {
    const before = live.matchState
    const previousShotClock = before.shotClockTenths
    live.advanceOneStep()
    const s = live.matchState
    const events: MatchNextEvent[] = []
    for (let index = s.events.length - 1; index >= 0 && s.events[index]!.t === s.t; index -= 1) events.push(s.events[index]!)
    events.reverse()
    for (const event of events) {
      if ((event.type === 'freeThrowMade' || event.type === 'freeThrowMissed') && event.freeThrowIndex === event.freeThrowTotal) lastTerminalFt = s.t
      if (event.type === 'possessionStart') open.set(event.possessionId!, { startReason: event.startReason ?? '?', startT: s.t, ticks: {}, secondChance: false, afterFreeThrows: s.t - lastTerminalFt <= 40, passes: 0, drives: 0, screens: 0, decisions: 0, cancelled: 0, shots: 0, shotClock: [], halfCourt: false })
      if (event.type === 'reboundSecured' && event.reboundType === 'offensive') pendingOreb = { t: s.t, sequence: event.sequence }
      if (pendingOreb !== null && event.sequence > pendingOreb.sequence && (event.type === 'shotReleased' || event.type === 'passReleased')) {
        reboundToNext.push({ kind: event.type === 'shotReleased' ? (event.shotCreation === 'PUTBACK' ? 'putback' : 'otherShot') : 'pass', ticks: s.t - pendingOreb.t })
        pendingOreb = null
      }
      // decisionSelected carries no possession id: it belongs to the possession alive at that tick.
      const owner = event.possessionId ?? (event.type === 'decisionSelected' || event.type === 'actionResolved' ? s.activePossessionId ?? undefined : undefined)
      const record = owner === undefined ? undefined : open.get(owner)
      if (record === undefined) continue
      if (event.type === 'reboundSecured' && event.reboundType === 'offensive') record.secondChance = true
      if (event.type === 'passReleased') record.passes += 1
      if (event.type === 'actionStarted' && event.actionKind === 'DRIVE') record.drives += 1
      if (event.type === 'screenSet') record.screens += 1
      if (event.type === 'decisionSelected') record.decisions += 1
      if (event.type === 'actionResolved' && event.actionOutcome === 'CANCELLED') record.cancelled += 1
      if (event.type === 'turnover') record.turnoverType = event.turnoverType
      if (event.type === 'shotReleased') {
        record.shots += 1
        if (previousShotClock !== null) record.shotClock.push(previousShotClock / 10)
        if (record.firstShotAt === undefined) {
          record.firstShotAt = (s.t - record.startT) / 10
          record.firstShotCreation = event.shotCreation
          record.firstShotZone = event.shotZone
          record.firstShotContest = event.contestScore
          const flow = before.offenseFlow
          record.firstShotSettled = flow !== null && flow.possessionId === event.possessionId ? flow.settledAtT !== null : false
        }
      }
    }
    const phase = classifyFine(s)
    if (s.clock.gameRunning) clockRunning += 1
    const id = s.activePossessionId
    const current = id === null ? undefined : open.get(id)
    const alive = current !== undefined && s.possessions.find((item) => item.id === id)?.endReason === undefined
    if (alive) {
      current.ticks[phase] = (current.ticks[phase] ?? 0) + 1
      if (s.offenseFlow?.possessionId === id && (s.offenseFlow.stage !== 'EARLY' || s.offenseFlow.halfCourtSinceT !== null)) current.halfCourt = true
    }
    for (const event of events) {
      if (event.type !== 'possessionEnd' || event.possessionId === undefined) continue
      const r = open.get(event.possessionId)
      if (r === undefined) continue
      out.push({
        id: event.possessionId, startReason: r.startReason, endReason: event.endReason, seconds: (s.t - r.startT) / 10, ticks: r.ticks, secondChance: r.secondChance, afterFreeThrows: r.afterFreeThrows,
        passes: r.passes, drives: r.drives, screens: r.screens, decisions: r.decisions, cancelled: r.cancelled, shots: r.shots, firstShotAtSeconds: r.firstShotAt, firstShotCreation: r.firstShotCreation,
        firstShotZone: r.firstShotZone, firstShotSettled: r.firstShotSettled, firstShotContest: r.firstShotContest, shotClockAtShots: r.shotClock, turnoverType: r.turnoverType, reachedHalfCourt: r.halfCourt,
      })
      open.delete(event.possessionId)
    }
  }
  const final = live.matchState.events
  const count = (test: (e: MatchNextEvent) => boolean): number => final.filter(test).length
  const counts = {
    points: live.matchState.score.home + live.matchState.score.away, fga: count((e) => e.type === 'shotReleased'), threes: count((e) => e.type === 'shotReleased' && e.points === 3),
    fta: count((e) => e.type === 'freeThrowMade' || e.type === 'freeThrowMissed'), turnovers: count((e) => e.type === 'turnover'), oreb: count((e) => e.type === 'reboundSecured' && e.reboundType === 'offensive'),
    fouls: count((e) => e.type === 'foul'), assists: count((e) => e.type === 'assist'), drives: count((e) => e.type === 'actionStarted' && e.actionKind === 'DRIVE'), screens: count((e) => e.type === 'screenSet'),
    passes: count((e) => e.type === 'passReleased'), decisions: count((e) => e.type === 'decisionSelected'), shotClockViolations: count((e) => e.type === 'shotClockViolation'), made: count((e) => e.type === 'shotMade'),
  }
  return { seed, complete: live.matchState.isComplete, possessions: out, clockRunningTicks: clockRunning, counts, reboundToNext }
}

/** Why is this possession short (< 8 s)? One class each, from evidence only. */
export function classifyShort(p: PossessionDetail): string {
  if (p.startReason === 'steal' && p.firstShotAtSeconds !== undefined) return 'steal/break legitimate'
  if (p.secondChance && p.firstShotCreation === 'PUTBACK') return 'immediate putback legitimate'
  if (p.endReason === 'turnover' && p.firstShotAtSeconds === undefined) return p.startReason === 'steal' ? 'turnover after steal' : 'turnover before a shot'
  if (p.firstShotCreation === 'TRANSITION') return 'transition legitimate'
  if (p.secondChance) return 'rebound reset too fast'
  if (p.startReason === 'madeBasketInbound' && p.seconds < 5 && !p.reachedHalfCourt) return 'inbound too fast'
  if (p.firstShotAtSeconds !== undefined && p.firstShotSettled === false) return 'setup skipped (shot before the half court settled)'
  if (p.firstShotAtSeconds !== undefined && p.drives + p.screens === 0 && p.passes <= 1) return 'premature shot (no action, at most one pass)'
  if (p.firstShotAtSeconds !== undefined && p.drives + p.screens > 0) return 'premature action (quick drive/screen finish)'
  if (p.endReason === 'shotClock' || p.endReason === 'periodEnd') return 'clock/period end'
  return 'other'
}

export function summarize41(games: readonly Game41[]): Record<string, unknown> {
  const all = games.flatMap((g) => g.possessions)
  const n = games.length
  const perGame = (f: (g: Game41) => number): number => Number((games.reduce((a, g) => a + f(g), 0) / n).toFixed(2))
  const totalSeconds = all.reduce((a, r) => a + r.seconds, 0)
  const phaseRows = FINE_PHASES.map((phase) => {
    const values = all.map((r) => (r.ticks[phase] ?? 0) / 10)
    const present = values.filter((v) => v > 0)
    const q = quantiles(present)
    return { phase, meanPerPossession: quantiles(values).mean, medianWhenPresent: q.median, p10WhenPresent: q.p10, p90WhenPresent: q.p90, frequency: Number((present.length / Math.max(1, all.length)).toFixed(3)), sharePct: Number(((100 * values.reduce((a, b) => a + b, 0)) / Math.max(1, totalSeconds)).toFixed(1)) }
  })
  const bins = [['<4 s', 0, 4], ['4-8 s', 4, 8], ['8-12 s', 8, 12], ['12-16 s', 12, 16], ['16-20 s', 16, 20], ['>20 s', 20, 1e9]] as const
  const binShare = (rows: readonly PossessionDetail[]): Record<string, number> => Object.fromEntries(bins.map(([label, lo, hi]) => [label, Number((rows.filter((r) => r.seconds >= lo && r.seconds < hi).length / Math.max(1, rows.length)).toFixed(3))]))
  const typeOf = (r: PossessionDetail): string => {
    if (r.secondChance) return 'secondChance'
    if (r.startReason === 'madeBasketInbound') return r.afterFreeThrows ? 'afterFreeThrows' : 'afterMadeBasket'
    if (r.startReason === 'steal') return 'afterSteal'
    if (r.startReason === 'defensiveRebound') return 'afterDefensiveRebound'
    if (r.startReason === 'turnoverInbound' || r.startReason === 'other' || r.startReason === 'shotClockViolation') return 'afterDeadBall'
    return r.startReason
  }
  const types = [...new Set(all.map(typeOf))].sort()
  const byType = Object.fromEntries(types.map((t) => {
    const rows = all.filter((r) => typeOf(r) === t)
    const phaseMeans = Object.fromEntries(FINE_PHASES.map((phase) => [phase, Number((rows.reduce((a, r) => a + (r.ticks[phase] ?? 0), 0) / Math.max(1, rows.length) / 10).toFixed(2))]).filter(([, v]) => (v as number) > 0))
    return [t, { perGame: Number((rows.length / n).toFixed(1)), seconds: quantiles(rows.map((r) => r.seconds)), phaseMeans, bins: binShare(rows), passes: Number((rows.reduce((a, r) => a + r.passes, 0) / Math.max(1, rows.length)).toFixed(2)), decisions: Number((rows.reduce((a, r) => a + r.decisions, 0) / Math.max(1, rows.length)).toFixed(2)) }]
  }))
  const halfCourt = all.filter((r) => r.reachedHalfCourt && !r.secondChance && r.firstShotCreation !== 'TRANSITION')
  const short = all.filter((r) => r.seconds < 8)
  const shortClasses: Record<string, number> = {}
  for (const r of short) { const c = classifyShort(r); shortClasses[c] = (shortClasses[c] ?? 0) + 1 }
  const clocks = all.flatMap((r) => r.shotClockAtShots)
  const clockBins = [['24-20', 20, 25], ['19-15', 15, 20], ['14-10', 10, 15], ['9-5', 5, 10], ['4-0', 0, 5]] as const
  const firstClocks = all.flatMap((r) => (r.shotClockAtShots.length === 0 ? [] : [r.shotClockAtShots[0]!]))
  const clockShare = (values: readonly number[], lo: number, hi: number): number => Number((values.filter((c) => c >= lo && c < hi).length / Math.max(1, values.length)).toFixed(3))
  const creations = [...new Set(all.map((r) => r.firstShotCreation ?? 'noShot'))].sort()
  const byFirstShot = Object.fromEntries(creations.map((c) => {
    const rows = all.filter((r) => (r.firstShotCreation ?? 'noShot') === c)
    return [c, { perGame: Number((rows.length / n).toFixed(1)), possessionSeconds: quantiles(rows.map((r) => r.seconds)).mean, toFirstShotSeconds: quantiles(rows.flatMap((r) => (r.firstShotAtSeconds === undefined ? [] : [r.firstShotAtSeconds]))).mean, passes: Number((rows.reduce((a, r) => a + r.passes, 0) / Math.max(1, rows.length)).toFixed(2)), settledShare: Number((rows.filter((r) => r.firstShotSettled === true).length / Math.max(1, rows.length)).toFixed(2)) }]
  }))
  const reb = games.flatMap((g) => g.reboundToNext)
  const rebKinds = [...new Set(reb.map((r) => r.kind))]
  return {
    games: n, complete: games.filter((g) => g.complete).length,
    perGame: { possessions: perGame((g) => g.possessions.length), clockRunningSeconds: perGame((g) => g.clockRunningTicks / 10), possessionSecondsTotal: Number((totalSeconds / n).toFixed(1)), ...Object.fromEntries(Object.keys(games[0]!.counts).map((k) => [k, perGame((g) => g.counts[k] ?? 0)])) },
    possessionSeconds: quantiles(all.map((r) => r.seconds)), bins: binShare(all), phases: phaseRows, byType, byFirstShot,
    halfCourtOnly: { n: halfCourt.length, seconds: quantiles(halfCourt.map((r) => r.seconds)), bins: binShare(halfCourt) },
    short: { perGame: Number((short.length / n).toFixed(1)), shareOfAll: Number((short.length / Math.max(1, all.length)).toFixed(3)), classes: Object.fromEntries(Object.entries(shortClasses).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, { perGame: Number((v / n).toFixed(1)), share: Number((v / Math.max(1, short.length)).toFixed(3)) }])) },
    shotClock: { shotsWithClock: clocks.length, remainingSeconds: quantiles(clocks), bins: Object.fromEntries(clockBins.map(([label, lo, hi]) => [label, clockShare(clocks, lo, hi)])), firstShotOfPossessionBins: Object.fromEntries(clockBins.map(([label, lo, hi]) => [label, clockShare(firstClocks, lo, hi)])) },
    decisions: { perPossession: quantiles(all.map((r) => r.decisions)), perSecond: Number((all.reduce((a, r) => a + r.decisions, 0) / Math.max(1, totalSeconds)).toFixed(3)), cancelledPerPossession: Number((all.reduce((a, r) => a + r.cancelled, 0) / Math.max(1, all.length)).toFixed(3)) },
    reboundToNext: Object.fromEntries(rebKinds.map((k) => { const rows = reb.filter((r) => r.kind === k); return [k, { perGame: Number((rows.length / n).toFixed(1)), seconds: quantiles(rows.map((r) => r.ticks / 10)) }] })),
  }
}
