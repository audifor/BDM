/**
 * BT4.5 pass-ecology audit. One pass per game over the canonical events and the state; nothing here changes a game.
 *  A. pass ledger: every pass attempt with its geometry (lane, timing, receiver window), its context, the decision that chose it and its result
 *  C. lane geometry in real time: can the defender physically get to the line before the ball does?
 *  D. receiver window; H. pass type; J/K. turnover and steal taxonomies; N. ball speed; O. receiver movement
 */
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { distanceBetween, type CourtPosition } from '@/domain/court'
import { perceivedCompletion, playFor, type MatchNextEvent, type MatchPlayerState, type MatchSetup, type MatchState } from '@/engine/match-next'
import { attackingBasketForTeam } from '@/engine/match-next/structure/FiveOutStructure'
import { ballFlightSeconds, interceptAttemptChance, laneRead, perceivedLaneRead } from '@/engine/match-next/actions/PassRisk'
import { preparedSetup } from '../bt2/economy'
import { quantiles } from '../bt4/pace'

export type PassResult = 'COMPLETED' | 'DEFLECTED' | 'INTERCEPTED' | 'LOOSE_INACCURATE' | 'LOOSE_RECEIVER' | 'OUT_OF_BOUNDS' | 'UNRESOLVED'
export type PassType = 'INBOUND' | 'OUTLET' | 'KICK_OUT' | 'ROLL' | 'ENTRY' | 'SKIP' | 'REVERSAL' | 'SWING' | 'TRANSITION_ADVANCE' | 'RESET' | 'OTHER'

export interface PassRow {
  seed: number; t: number; passer: string; receiver: string; team: string; type: PassType; actionKind: string
  distance: number; flightSeconds: number; speedMps: number
  /** Lane geometry against the real line of the ball (passer -> target). */
  laneMinPerp: number; defendersWithin1m: number; defendersWithin2m: number
  /** Defender who has the most time to reach the line: slack = ball time at the point of the lane - his time to be there (> 0: he gets there first). */
  bestSlack: number; bestSlackDefender: string | null; bestSlackSteal: number; bestSlackMobility: number; threats: number
  /** Time-feasible threat only: a defender that can be on the line before the ball passes, and how close his point is to the receiver. */
  receiverSeparation: number; receiverGuardDistance: number; receiverDenied: boolean; receiverSpeed: number; helpNearReceiver: number
  passerPressure: number; passerAccuracy: number; passerVision: number; passerTiming: number; passerBallSecurity: number
  quality: number | null; perceivedRisk: number | null; perceivedInterceptAttempt: number
  phase: string; stage: string; transitionAdvantage: string; startReason: string; playKind: string | null; sinceStartSeconds: number
  utilityPass: number | null; utilityBestAlternative: number | null; utilityGap: number | null; decisionKind: string | null
  result: PassResult; interceptor: string | null; interceptorSteal: number | null; receiverDriftAtArrival: number | null; ledTargetToReceiverAtRelease: number
  lostPossession: boolean
}

export interface StealRow { seed: number; t: number; kind: string; stealerResponsibility: string; viaPass: boolean; team: string; victim: string | null; stealer: string; stealerSteal: number }
export interface TurnoverRow { seed: number; t: number; type: string; cause: string; team: string }

export interface PassGame { readonly seed: number; readonly complete: boolean; readonly passes: readonly PassRow[]; readonly steals: readonly StealRow[]; readonly turnovers: readonly TurnoverRow[]; readonly possessions: number; readonly points: number; readonly assists: number; readonly fga: number; readonly shotMix: Record<string, number> }

function lane(state: MatchState, passer: MatchPlayerState, target: CourtPosition, flightSeconds: number): { minPerp: number; within1: number; within2: number; bestSlack: number; best: MatchPlayerState | null; threats: number } {
  const read = laneRead(state, passer.position, target, passer.teamId, flightSeconds, 1)
  const dx = target.x - passer.position.x
  const dy = target.y - passer.position.y
  const len2 = dx * dx + dy * dy || 1
  let within1 = 0; let within2 = 0
  for (const d of state.players) {
    if (!d.active || d.teamId === passer.teamId) continue
    const u = Math.max(0, Math.min(1, ((d.position.x - passer.position.x) * dx + (d.position.y - passer.position.y) * dy) / len2))
    const perp = distanceBetween(d.position, { x: passer.position.x + u * dx, y: passer.position.y + u * dy })
    if (perp < 1) within1 += 1
    if (perp < 2) within2 += 1
  }
  return { minPerp: read.minPerpendicular, within1, within2, bestSlack: read.slack, best: read.defender, threats: read.threats }
}

function classify(state: MatchState, passer: MatchPlayerState, receiver: MatchPlayerState, actionKind: string, basket: CourtPosition, startReason: string, sinceStart: number, passIndexInPossession: number): PassType {
  if (actionKind === 'KICK_OUT') return 'KICK_OUT'
  const transitionOn = state.transition !== null && state.transition.teamId === passer.teamId
  if (startReason === 'defensiveRebound' && passIndexInPossession === 0 && sinceStart < 40) return 'OUTLET'
  if (transitionOn) return 'TRANSITION_ADVANCE'
  if (state.screen !== null && state.screen.teamId === passer.teamId && state.screen.screenerId === receiver.playerId) return 'ROLL'
  const centerY = state.court.widthMeters / 2
  const crosses = (passer.position.y - centerY) * (receiver.position.y - centerY) < 0 && Math.abs(receiver.position.y - passer.position.y) > 3
  const d = distanceBetween(passer.position, receiver.position)
  if (distanceBetween(receiver.position, basket) < 5) return 'ENTRY'
  if (crosses && d > 12) return 'SKIP'
  if (crosses) return 'REVERSAL'
  if (state.possessions.find((p) => p.id === state.activePossessionId)?.offensiveRebounds) return 'RESET'
  if (distanceBetween(passer.position, basket) > 6.75 && distanceBetween(receiver.position, basket) > 6.75) return 'SWING'
  return 'OTHER'
}

export function runPassGame(seed: number, maxTicks = 60000, transform?: (setup: MatchSetup) => MatchSetup): PassGame {
  const setup = transform === undefined ? preparedSetup(seed) : transform(preparedSetup(seed))
  const live = createMatchEnginePort('match-next').createLiveSession(setup)
  const passes: PassRow[] = []; const steals: StealRow[] = []; const turnovers: TurnoverRow[] = []
  const lastDecision = new Map<string, { t: number; kind: string; utility: Record<string, number> | undefined }>()
  const pendingKind = new Map<string, string>()
  const passCount = new Map<string, number>()
  const startInfo = new Map<string, { t: number; reason: string }>()
  let pending: PassRow | null = null
  let pendingTarget: CourtPosition | null = null
  let possessions = 0; let points = 0; let assists = 0; let fga = 0
  const shotMix: Record<string, number> = {}
  let prev: MatchState | null = null
  while (!live.matchState.isComplete && live.matchState.t < maxTicks) {
    live.advanceOneStep()
    const s: MatchState = live.matchState
    const before: MatchState = prev ?? s
    prev = s
    const events: MatchNextEvent[] = []
    for (let index = s.events.length - 1; index >= 0 && s.events[index]!.t === s.t; index -= 1) events.push(s.events[index]!)
    events.reverse()
    for (const e of events) {
      if (e.type === 'possessionStart' && e.possessionId !== undefined) { possessions += 1; startInfo.set(e.possessionId, { t: s.t, reason: e.startReason ?? '?' }) }
      if (e.type === 'shotMade') points += e.points ?? 0
      if (e.type === 'freeThrowMade') points += 1
      if (e.type === 'assist') assists += 1
      if (e.type === 'shotReleased') { fga += 1; const k = e.shotCreation ?? '-'; shotMix[k] = (shotMix[k] ?? 0) + 1; const z = e.shotZone ?? '-'; shotMix[`zone:${z}`] = (shotMix[`zone:${z}`] ?? 0) + 1 }
      if (e.type === 'decisionSelected' && e.playerId !== undefined) lastDecision.set(String(e.playerId), { t: s.t, kind: String(e.decisionKind), utility: e.utility as Record<string, number> | undefined })
      if (e.type === 'actionStarted' && (e.actionKind === 'PASS' || e.actionKind === 'KICK_OUT') && e.playerId !== undefined) pendingKind.set(String(e.playerId), e.actionKind)
      if (e.type === 'passReleased' && e.passerPlayerId !== undefined && e.receiverPlayerId !== undefined && s.ball.kind === 'PASS_IN_FLIGHT') {
        const a = s.players.find((x) => x.playerId === e.passerPlayerId)
        const b = s.players.find((x) => x.playerId === e.receiverPlayerId)
        if (a === undefined || b === undefined) continue
        const ball = s.ball
        const target = ball.target
        const flightSeconds = Math.max(0.1, (ball.arrivalT - ball.releaseT) / 10)
        const distance = distanceBetween(a.position, target)
        const info = lane(s, a, target, flightSeconds)
        const others = s.players.filter((x) => x.active && x.teamId !== a.teamId)
        const rsep = Math.min(...others.map((x) => distanceBetween(x.position, b.position)))
        const guardId = s.defensiveStructure?.assignments.find((x) => x.attackerPlayerId === b.playerId)?.defenderPlayerId
        const guard = s.players.find((x) => x.playerId === guardId)
        const guardDistance = guard === undefined ? rsep : distanceBetween(guard.position, b.position)
        const denied = guard !== undefined && distanceBetween(guard.position, a.position) < distanceBetween(b.position, a.position) - 0.5 && guardDistance < 1.6
        const help = others.filter((x) => x.playerId !== guardId && distanceBetween(x.position, b.position) < 2.5).length
        const pressure = Math.min(...others.map((x) => distanceBetween(x.position, a.position)))
        const possession = s.possessions.find((p) => p.id === s.activePossessionId)
        const start = possession === undefined ? undefined : startInfo.get(possession.id)
        const basket = attackingBasketForTeam(a.teamId, s.homeTeamId, s.period, s.court)
        const actionKind = e.actionId === undefined ? (ball.isInbound ? 'INBOUND' : 'PASS') : pendingKind.get(String(a.playerId)) ?? 'PASS'
        const idx = possession === undefined ? 0 : (passCount.get(possession.id) ?? 0)
        if (possession !== undefined) passCount.set(possession.id, idx + 1)
        const sinceStart = start === undefined ? 0 : s.t - start.t
        const type: PassType = ball.isInbound ? 'INBOUND' : classify(before, a, b, actionKind, basket, start?.reason ?? '?', sinceStart, idx)
        const dec = lastDecision.get(String(a.playerId))
        const util = dec !== undefined && s.t - dec.t <= 1 ? dec.utility : undefined
        const alternatives = util === undefined ? null : Math.max(util.shoot ?? -9, util.drive ?? -9, util.hold ?? -9, util.screen ?? -9)
        const quality = e.passQuality ?? null
        const flow = s.offenseFlow
        pending = {
          seed, t: s.t, passer: String(a.playerId), receiver: String(b.playerId), team: String(a.teamId), type, actionKind,
          distance, flightSeconds, speedMps: distance / flightSeconds,
          laneMinPerp: info.minPerp, defendersWithin1m: info.within1, defendersWithin2m: info.within2,
          bestSlack: info.bestSlack, bestSlackDefender: info.best === null ? null : String(info.best.playerId), bestSlackSteal: info.best?.defense.steal ?? 50, bestSlackMobility: info.best?.defense.mobility ?? 50, threats: info.threats,
          receiverSeparation: rsep, receiverGuardDistance: guardDistance, receiverDenied: denied, receiverSpeed: Math.hypot(b.velocity.x, b.velocity.y), helpNearReceiver: help,
          passerPressure: pressure, passerAccuracy: a.passing.accuracy, passerVision: a.passing.vision, passerTiming: a.passing.timing, passerBallSecurity: a.offense.ballSecurity,
          quality, perceivedInterceptAttempt: (() => { const pa = before.players.find((x) => x.playerId === a.playerId); const pb = before.players.find((x) => x.playerId === b.playerId); return pa === undefined || pb === undefined ? 0 : interceptAttemptChance(perceivedLaneRead(before, pa, pa.position, pb.position, ballFlightSeconds(distanceBetween(pa.position, pb.position)))) })(), perceivedRisk: (() => { const pa = before.players.find((x) => x.playerId === a.playerId); const pb = before.players.find((x) => x.playerId === b.playerId); return pa === undefined || pb === undefined ? null : 1 - perceivedCompletion(before, pa, pb) })(),
          phase: possession?.phase ?? '?', stage: flow === null || possession === undefined || flow.possessionId !== possession.id ? 'NO_FLOW' : flow.stage + (flow.settledAtT === null ? '/unsettled' : '/settled'),
          transitionAdvantage: s.transition === null || s.transition.teamId !== a.teamId ? 'NONE' : String(s.transition.advantage), startReason: start?.reason ?? '?',
          playKind: flow !== null && flow.settledAtT !== null && !ball.isInbound ? playFor(s, a.teamId) : null, sinceStartSeconds: sinceStart / 10,
          utilityPass: util?.pass ?? null, utilityBestAlternative: alternatives, utilityGap: util === undefined || alternatives === null ? null : (util.pass ?? 0) - alternatives, decisionKind: dec?.kind ?? null,
          result: 'UNRESOLVED', interceptor: null, interceptorSteal: null, receiverDriftAtArrival: null, ledTargetToReceiverAtRelease: distanceBetween(target, b.position), lostPossession: false,
        }
        pendingTarget = target
      }
      if (pending !== null) {
        if (e.type === 'passReceived' && e.receiverPlayerId !== undefined) {
          const b = s.players.find((x) => x.playerId === e.receiverPlayerId)
          pending.result = 'COMPLETED'; pending.receiverDriftAtArrival = b === undefined || pendingTarget === null ? null : distanceBetween(b.position, pendingTarget)
          passes.push(pending); pending = null
        } else if (e.type === 'passIntercepted') {
          pending.result = 'INTERCEPTED'; pending.interceptor = e.playerId === undefined ? null : String(e.playerId)
          const d = s.players.find((x) => x.playerId === e.playerId); pending.interceptorSteal = d?.defense.steal ?? null; pending.lostPossession = true
          passes.push(pending); pending = null
        } else if (e.type === 'deflection') {
          pending.result = 'DEFLECTED'; const d = s.players.find((x) => x.playerId === e.playerId); pending.interceptor = e.playerId === undefined ? null : String(e.playerId); pending.interceptorSteal = d?.defense.steal ?? null
          passes.push(pending); pending = null
        } else if (e.type === 'passBecameLoose') {
          const b = s.players.find((x) => x.playerId === pending!.receiver)
          pending.result = b !== undefined && pendingTarget !== null && distanceBetween(b.position, s.ball.position) < 1.3 ? 'LOOSE_RECEIVER' : 'LOOSE_INACCURATE'
          pending.receiverDriftAtArrival = b === undefined || pendingTarget === null ? null : distanceBetween(b.position, pendingTarget)
          passes.push(pending); pending = null
        } else if (e.type === 'outOfBounds' || e.type === 'turnover' && e.turnoverType === 'OUT_OF_BOUNDS') {
          pending.result = 'OUT_OF_BOUNDS'; passes.push(pending); pending = null
        }
      }
      if (e.type === 'turnover') {
        const lastPass = passes[passes.length - 1]
        const recentPass = lastPass !== undefined && s.t - lastPass.t <= 40 && lastPass.team === String(e.teamId)
        turnovers.push({ seed, t: s.t, type: String(e.turnoverType), team: String(e.teamId), cause: recentPass ? `pass:${lastPass!.result}` : 'noPass' })
        if (recentPass) lastPass!.lostPossession = true
      }
      if (e.type === 'steal') {
        const stealer = s.players.find((x) => x.playerId === e.playerId)
        const resp = before.responsibilities.find((x) => x.playerId === e.playerId && x.owner === 'defensiveStructure')
        const kind = String(e.stealKind)
        steals.push({ seed, t: s.t, kind, stealerResponsibility: resp === undefined ? '?' : String((resp as unknown as { kind?: string }).kind ?? '?'), viaPass: kind === 'PASS_INTERCEPTION' || kind === 'DEFLECTION', team: String(e.teamId), victim: e.victimPlayerId === undefined ? null : String(e.victimPlayerId), stealer: String(e.playerId), stealerSteal: stealer?.defense.steal ?? 50 })
      }
    }
  }
  return { seed, complete: live.matchState.isComplete, passes, steals, turnovers, possessions, points, assists, fga, shotMix }
}

const mean = (v: readonly number[]): number => Number((v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)).toFixed(3))
const pct = (n: number, d: number): number => Number((100 * n / Math.max(1, d)).toFixed(1))

export function summarizePasses(games: readonly PassGame[]): Record<string, unknown> {
  const n = games.length
  const per = (x: number): number => Number((x / n).toFixed(2))
  const rows = games.flatMap((g) => g.passes)
  const live = rows.filter((r) => r.type !== 'INBOUND')
  const stats = (set: readonly PassRow[]) => ({
    n: set.length, perGame: per(set.length), completedPct: pct(set.filter((r) => r.result === 'COMPLETED').length, set.length),
    interceptedPct: pct(set.filter((r) => r.result === 'INTERCEPTED').length, set.length), deflectedPct: pct(set.filter((r) => r.result === 'DEFLECTED').length, set.length),
    inaccuratePct: pct(set.filter((r) => r.result === 'LOOSE_INACCURATE').length, set.length), receiverPct: pct(set.filter((r) => r.result === 'LOOSE_RECEIVER').length, set.length), outPct: pct(set.filter((r) => r.result === 'OUT_OF_BOUNDS').length, set.length),
    lostPossessionPct: pct(set.filter((r) => r.lostPossession).length, set.length), turnoversPerGame: per(set.filter((r) => r.lostPossession).length),
  })
  const bucket = (f: (r: PassRow) => number, edges: readonly number[], set: readonly PassRow[] = live) => Object.fromEntries(edges.slice(0, -1).map((lo, i) => { const hi = edges[i + 1]!; return [`${lo}..${hi}`, stats(set.filter((r) => f(r) >= lo && f(r) < hi))] }))
  const byType = Object.fromEntries([...new Set(rows.map((r) => r.type))].sort().map((t) => [t, stats(rows.filter((r) => r.type === t))]))
  const byPlay = Object.fromEntries([...new Set(live.map((r) => r.playKind ?? `unsettled:${r.stage.split('/')[0]}`))].sort().map((t) => [t, stats(live.filter((r) => (r.playKind ?? `unsettled:${r.stage.split('/')[0]}`) === t))]))
  const byStart = Object.fromEntries([...new Set(live.map((r) => r.startReason))].sort().map((t) => [t, stats(live.filter((r) => r.startReason === t))]))
  const withUtil = live.filter((r) => r.utilityGap !== null)
  const lost = live.filter((r) => r.lostPossession && r.utilityGap !== null)
  const kept = live.filter((r) => !r.lostPossession && r.utilityGap !== null)
  const turnovers = games.flatMap((g) => g.turnovers)
  const taxonomy = Object.fromEntries([...new Set(turnovers.map((t) => `${t.type}|${t.cause}`))].sort().map((k) => [k, per(turnovers.filter((t) => `${t.type}|${t.cause}` === k).length)]))
  const steals = games.flatMap((g) => g.steals)
  const stealKinds = Object.fromEntries([...new Set(steals.map((t) => t.kind))].sort().map((k) => [k, per(steals.filter((t) => t.kind === k).length)]))
  const stealResp = Object.fromEntries([...new Set(steals.map((t) => `${t.kind}|${t.stealerResponsibility}`))].sort().map((k) => [k, per(steals.filter((t) => `${t.kind}|${t.stealerResponsibility}` === k).length)]))
  const passSkill = (r: PassRow): number => (r.passerAccuracy + r.passerVision + r.passerTiming) / 3
  return {
    games: n, complete: games.filter((g) => g.complete).length,
    totals: { possessions: per(games.reduce((a, g) => a + g.possessions, 0)), points: per(games.reduce((a, g) => a + g.points, 0)), assists: per(games.reduce((a, g) => a + g.assists, 0)), fga: per(games.reduce((a, g) => a + g.fga, 0)), passesLive: per(live.length), passesAll: per(rows.length), turnoversAll: per(turnovers.length), steals: per(steals.length), shotMix: Object.fromEntries(Object.entries(games.reduce((acc, g) => { for (const [k, v] of Object.entries(g.shotMix)) acc[k] = (acc[k] ?? 0) + v; return acc }, {} as Record<string, number>)).map(([k, v]) => [k, per(v)])) },
    overall: stats(live), byType, byPlay, byStart,
    contestedByPerp: bucket((r) => r.laneMinPerp, [0, 0.3, 0.6, 1.0, 1.5, 99]),
    contestedByPerpQuality: Object.fromEntries([[0, 0.3], [0.3, 0.6], [0.6, 1.0], [1.0, 1.5], [1.5, 99]].map(([lo, hi]) => { const set = live.filter((r) => r.laneMinPerp >= lo! && r.laneMinPerp < hi!); return [`${lo}..${hi}`, { passerSkill: mean(set.map(passSkill)), defenderSteal: mean(set.map((r) => r.bestSlackSteal)), share: pct(set.length, live.length) }] })),
    bySlack: bucket((r) => r.bestSlack, [-9, -0.6, -0.3, 0, 0.15, 0.3, 0.6, 99]),
    perpBySlack: Object.fromEntries([[0, 0.3], [0.3, 0.6], [0.6, 1.0], [1.0, 1.5], [1.5, 99]].map(([lo, hi]) => { const set = live.filter((r) => r.laneMinPerp >= lo! && r.laneMinPerp < hi!); return [`${lo}..${hi}`, { noTimeThreat: stats(set.filter((r) => r.bestSlack <= 0)), timeThreat: stats(set.filter((r) => r.bestSlack > 0)) }] })),
    byDefenderStealWhenThreat: Object.fromEntries([['LOW', 0, 45], ['MEDIUM', 45, 60], ['ELITE', 60, 101]].map(([label, lo, hi]) => [label as string, stats(live.filter((r) => r.bestSlack > 0 && r.bestSlackSteal >= (lo as number) && r.bestSlackSteal < (hi as number)))])),
    perceivedByPerp: Object.fromEntries([[0, 0.3], [0.3, 0.6], [0.6, 1.0], [1.0, 1.5], [1.5, 99]].map(([lo, hi]) => { const set = live.filter((r) => r.laneMinPerp >= lo! && r.laneMinPerp < hi!); return [`${lo}..${hi}`, { perceivedRiskPct: Number((100 * mean(set.map((r) => r.perceivedRisk ?? 0))).toFixed(1)), actualLostPct: pct(set.filter((r) => r.lostPossession).length, set.length), actualNotCompletedPct: pct(set.filter((r) => r.result !== 'COMPLETED').length, set.length) }] })),
    perceivedVsActualByType: Object.fromEntries([...new Set(live.map((r) => r.type))].sort().map((t) => { const set = live.filter((r) => r.type === t); return [t, { n: set.length, perceivedNotCompletedPct: Number((100 * mean(set.map((r) => r.perceivedRisk ?? 0))).toFixed(1)), actualNotCompletedPct: pct(set.filter((r) => r.result !== 'COMPLETED').length, set.length), actualLostPct: pct(set.filter((r) => r.lostPossession).length, set.length) }] })),
    lostPassDecisionQuality: (() => {
      const lostSet = live.filter((r) => r.lostPossession)
      const share = (f: (r: PassRow) => boolean): number => pct(lostSet.filter(f).length, lostSet.length)
      const completionOf = (r: PassRow): number => 1 - (r.perceivedRisk ?? 0)
      return { n: lostSet.length, perGame: per(lostSet.length), goodDecisionBadExecution: share((r) => completionOf(r) >= 0.93), marginalDecision: share((r) => completionOf(r) < 0.93 && completionOf(r) >= 0.8), badDecisionExpectedFailure: share((r) => completionOf(r) < 0.8), passWasNotTheBestOption: share((r) => r.utilityGap !== null && r.utilityGap < 0) }
    })(),
    interceptCalibration: { perceivedAttemptMean: mean(live.map((r) => r.perceivedInterceptAttempt)), actualInterceptOrDeflect: pct(live.filter((r) => r.result === 'INTERCEPTED' || r.result === 'DEFLECTED').length, live.length), byPerceivedBucket: Object.fromEntries([[0, 0.02], [0.02, 0.1], [0.1, 0.2], [0.2, 0.35], [0.35, 1.01]].map(([lo, hi]) => { const set = live.filter((r) => r.perceivedInterceptAttempt >= lo! && r.perceivedInterceptAttempt < hi!); return [`${lo}..${hi}`, { n: set.length, perceivedAttempt: mean(set.map((r) => r.perceivedInterceptAttempt)), actualInterceptOrDeflectPct: pct(set.filter((r) => r.result === 'INTERCEPTED' || r.result === 'DEFLECTED').length, set.length) }] })) },
    passesToDeniedReceiverShare: pct(live.filter((r) => r.receiverDenied).length, live.length),
    byTypeDistance: Object.fromEntries([...new Set(live.map((r) => r.type))].sort().map((t) => [t, { distance: mean(live.filter((r) => r.type === t).map((r) => r.distance)), laneUnder1m: pct(live.filter((r) => r.type === t && r.laneMinPerp < 1).length, live.filter((r) => r.type === t).length), timeThreat: pct(live.filter((r) => r.type === t && r.bestSlack > 0).length, live.filter((r) => r.type === t).length) }])),
    byThreats: Object.fromEntries([0, 1, 2, 3].map((k) => [k >= 3 ? '3+' : String(k), stats(live.filter((r) => (k >= 3 ? r.threats >= 3 : r.threats === k)))])),
    shareWithDefenderUnder1mButNoTimeThreat: pct(live.filter((r) => r.laneMinPerp < 1 && r.bestSlack <= 0).length, live.filter((r) => r.laneMinPerp < 1).length),
    byReceiverSeparation: bucket((r) => r.receiverSeparation, [0, 1, 1.5, 2.5, 4, 99]),
    byReceiverDenied: { denied: stats(live.filter((r) => r.receiverDenied)), open: stats(live.filter((r) => !r.receiverDenied)) },
    byDistance: bucket((r) => r.distance, [0, 4, 7, 10, 14, 99]),
    ballSpeed: { byType: Object.fromEntries([...new Set(live.map((r) => r.type))].sort().map((t) => [t, { speed: quantiles(live.filter((r) => r.type === t).map((r) => r.speedMps)), flightSeconds: mean(live.filter((r) => r.type === t).map((r) => r.flightSeconds)) }])) },
    receiverMovement: { speedAtRelease: quantiles(live.map((r) => r.receiverSpeed)), driftAtArrival: quantiles(live.flatMap((r) => (r.receiverDriftAtArrival === null ? [] : [r.receiverDriftAtArrival]))), driftOfLoose: quantiles(live.filter((r) => r.result.startsWith('LOOSE')).flatMap((r) => (r.receiverDriftAtArrival === null ? [] : [r.receiverDriftAtArrival]))), ledTargetToReceiverAtRelease: quantiles(live.map((r) => r.ledTargetToReceiverAtRelease)) },
    selection: {
      withUtility: withUtil.length,
      lostPass: { utilityPass: mean(lost.map((r) => r.utilityPass!)), bestAlternative: mean(lost.map((r) => r.utilityBestAlternative!)), gap: mean(lost.map((r) => r.utilityGap!)), perceivedRisk: mean(lost.map((r) => r.perceivedRisk ?? 0)), n: lost.length },
      keptPass: { utilityPass: mean(kept.map((r) => r.utilityPass!)), bestAlternative: mean(kept.map((r) => r.utilityBestAlternative!)), gap: mean(kept.map((r) => r.utilityGap!)), perceivedRisk: mean(kept.map((r) => r.perceivedRisk ?? 0)), n: kept.length },
      lostWherePassWasNotTheBest: pct(lost.filter((r) => r.utilityGap! < 0).length, lost.length), lostWithPerceivedRiskUnder5pct: pct(lost.filter((r) => (r.perceivedRisk ?? 0) < 0.05).length, lost.length),
      actualVsPerceivedRisk: { perceived: mean(live.map((r) => r.perceivedRisk ?? 0)), actualLostPct: pct(live.filter((r) => r.lostPossession).length, live.length), actualNotCompletedPct: pct(live.filter((r) => r.result !== 'COMPLETED').length, live.length) },
    },
    passerCohorts: Object.fromEntries([['LOW', 0, 52], ['MEDIUM', 52, 68], ['ELITE', 68, 101]].map(([label, lo, hi]) => { const set = live.filter((r) => passSkill(r) >= (lo as number) && passSkill(r) < (hi as number)); return [label as string, { ...stats(set), vision: mean(set.map((r) => r.passerVision)), meanSlack: mean(set.map((r) => r.bestSlack)), shareSlackPositive: pct(set.filter((r) => r.bestSlack > 0).length, set.length), shareLaneUnder1m: pct(set.filter((r) => r.laneMinPerp < 1).length, set.length), meanSeparation: mean(set.map((r) => r.receiverSeparation)), utilityGap: mean(set.filter((r) => r.utilityGap !== null).map((r) => r.utilityGap!)) }] })),
    defenderCohorts: Object.fromEntries([['LOW', 0, 45], ['MEDIUM', 45, 60], ['ELITE', 60, 101]].map(([label, lo, hi]) => { const set = live.filter((r) => r.bestSlackDefender !== null && r.bestSlackSteal >= (lo as number) && r.bestSlackSteal < (hi as number) && r.bestSlack > -0.3); return [label as string, stats(set)] })),
    turnoverTaxonomy: taxonomy, stealKinds, stealByResponsibility: stealResp,
    stealsViaPassShare: pct(steals.filter((s) => s.viaPass).length, steals.length),
  }
}
