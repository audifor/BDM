/**
 * BT4.4 pace-causality audit. One pass per game over the canonical events and the state; nothing here changes a game.
 *  1. possession ledger (every possession, with the clock it consumed and the group of time it was spent in)
 *  2. end reasons, duration by end reason
 *  3. clock reconciliation (live game clock = transition + half court + action + other live; dead ball apart) and double-count checks
 *  6. early offense: every first attack inside 8 s of a new possession, classified
 *  7. turnover chains
 *  8. pass risk
 *  9. play-type economy
 * 10. star usage
 */
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { distanceBetween, type CourtPosition } from '@/domain/court'
import { defenseIsSet, playFor, type MatchNextEvent, type MatchState } from '@/engine/match-next'
import { attackingBasketForTeam } from '@/engine/match-next/structure/FiveOutStructure'
import { preparedSetup } from '../bt2/economy'
import { classifyFine, type FinePhase } from '../bt41/pace41'
import { quantiles } from '../bt4/pace'

export type EndClass = 'MADE_SHOT' | 'DEFENSIVE_REBOUND' | 'TURNOVER_BAD_PASS' | 'TURNOVER_STEAL' | 'TURNOVER_DRIBBLE' | 'OFFENSIVE_FOUL' | 'OTHER_TURNOVER' | 'SHOT_CLOCK_VIOLATION' | 'FREE_THROW_SEQUENCE' | 'PERIOD_END' | 'OTHER'
export type TimeGroup = 'transition' | 'halfCourt' | 'action' | 'otherLive'

const GROUP_OF: Readonly<Record<FinePhase, TimeGroup>> = {
  inbound: 'transition', backcourtAdvance: 'transition', transition: 'transition', earlyOffense: 'transition',
  settlement: 'halfCourt', reading: 'halfCourt', offBallMove: 'halfCourt', advantage: 'halfCourt', offensiveReset: 'halfCourt',
  screenSetup: 'action', screenUse: 'action', drive: 'action', passFlight: 'action', catchGather: 'action', shotSetup: 'action', shotFlight: 'action', rebound: 'action',
  deadBall: 'otherLive',
}

export interface EarlyAttack {
  readonly possessionId: string; readonly startReason: string; readonly sinceStartSeconds: number; readonly kind: 'SHOT' | 'DRIVE'
  readonly ballDistanceToBasket: number; readonly attackersAhead: number; readonly defendersAhead: number; readonly organizedDefenders: number
  readonly defenderToBall: number; readonly shotProbability: number | null; readonly defenseSet45: boolean; readonly unsettled: boolean
  readonly klass: 'LEGITIMATE_TRANSITION' | 'SEMI_TRANSITION' | 'FALSE_EARLY_OFFENSE'; readonly nextAction: string
  readonly stage: string; readonly phase: string; readonly transitionAdvantage: string; readonly transitionTrigger: string; readonly creation: string | null; readonly zone: string | null; readonly passesBefore: number; readonly crossedHalf: boolean; readonly fromPossessionStartToCross: number | null
}

export interface PossessionRow {
  id: string; team: string; startT: number; endT: number; startClockTenths: number; endClockTenths: number; period: number
  elapsedGameSeconds: number; wallSeconds: number; startReason: string; endReason: string; endClass: EndClass
  shotClockAtStart: number | null; shotClockAtEnd: number | null
  passes: number; drives: number; screens: number; shots: number; made: number; points: number; turnovers: string[]; fouls: number
  orebs: number; drebs: number; stealsSuffered: number; stealsMade: number; freeThrowSequences: number
  deadBallSeconds: number; transitionSeconds: number; halfCourtSeconds: number; actionSeconds: number; otherLiveSeconds: number
  firstDecisionSeconds: number | null; firstShotSeconds: number | null; initiator: string | null; playKind: string | null; playClass: string
  settledAtSeconds: number | null; sameTeamAsPrevious: boolean; previousEndReason: string | null
}

export interface PassRow { passer: string; receiver: string; distance: number; laneClearance: number; outcome: 'CAUGHT' | 'INTERCEPTED' | 'LOOSE' | 'UNRESOLVED'; interceptor: string | null; passerSkill: number; quality: number | null; kind: string }
export interface PlayerUse { player: string; team: string; fga: number; points: number; touches: number; passesMade: number; passesReceived: number; turnovers: number; initiations: number; assists: number; ftTrips: number }

export interface LedgerGame {
  readonly seed: number; readonly complete: boolean; readonly rows: readonly PossessionRow[]; readonly early: readonly EarlyAttack[]; readonly passes: readonly PassRow[]; readonly players: readonly PlayerUse[]
  readonly clock: { totalTicks: number; consumedTicks: number; deadTicks: number; consumedByGroup: Record<TimeGroup, number>; deadByPhase: Record<string, number>; periodLengthTenths: number; periods: number; consumedWithoutPossession: number }
  readonly possessionStartsWithoutClock: number; readonly teamChanges: number; readonly ownershipEvents: Record<string, number>
}

function segmentDistance(p: CourtPosition, a: CourtPosition, b: CourtPosition): number {
  const dx = b.x - a.x; const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy))
}

export function runLedgerGame(seed: number, maxTicks = 60000): LedgerGame {
  const setup = preparedSetup(seed)
  const live = createMatchEnginePort('match-next').createLiveSession(setup)
  const open = new Map<string, PossessionRow & { _ticks: Record<string, number>; _decisionT: number | null; _shotT: number | null; _playSampled: boolean; _earlyDone: boolean; _lastShotClock: number | null; _firstHolderSet: boolean }>()
  const rows: PossessionRow[] = []
  const early: EarlyAttack[] = []
  const passes: PassRow[] = []
  const use = new Map<string, PlayerUse>()
  const consumedByGroup: Record<TimeGroup, number> = { transition: 0, halfCourt: 0, action: 0, otherLive: 0 }
  const deadByPhase: Record<string, number> = {}
  const ownershipEvents: Record<string, number> = {}
  let consumedTicks = 0; let deadTicks = 0; let consumedWithoutPossession = 0; let totalTicks = 0
  let possessionStartsWithoutClock = 0; let teamChanges = 0
  let prevPeriod = 1; let prevClock = setup.clockRules.periodSeconds * 10
  let lastClockAtPossessionEnd: number | null = null
  let lastEnded: PossessionRow | null = null
  let pending: { passer: string; receiver: string; distance: number; laneClearance: number; skill: number; quality: number | null; kind: string } | null = null
  const pendingKind = new Map<string, string>()
  const lastClosedByTeam = new Map<string, PossessionRow>()
  const touched = new Set<string>()
  const u = (id: string, team: string): PlayerUse => { let r = use.get(id); if (r === undefined) { r = { player: id, team, fga: 0, points: 0, touches: 0, passesMade: 0, passesReceived: 0, turnovers: 0, initiations: 0, assists: 0, ftTrips: 0 }; use.set(id, r) }; return r }
  let lastStartT = -1e9
  let prev: MatchState | null = null
  while (!live.matchState.isComplete && live.matchState.t < maxTicks) {
    live.advanceOneStep()
    const s: MatchState = live.matchState
    const before: MatchState = prev ?? s
    prev = s
    totalTicks += 1
    const consumed = s.period === prevPeriod ? Math.max(0, prevClock - s.gameClockTenths) : 0
    prevPeriod = s.period; prevClock = s.gameClockTenths
    const events: MatchNextEvent[] = []
    for (let index = s.events.length - 1; index >= 0 && s.events[index]!.t === s.t; index -= 1) events.push(s.events[index]!)
    events.reverse()
    const playerTeam = (id: string): string => String(s.players.find((p) => String(p.playerId) === id)?.teamId ?? '?')
    // ---- tick accounting (attributed to the possession open after the tick, or to the one that just closed)
    const activeId = s.activePossessionId
    const closing = events.find((e) => e.type === 'possessionEnd')
    const tickPossession = activeId !== null ? open.get(activeId) : closing?.possessionId === undefined ? undefined : open.get(closing.possessionId)
    const fine = classifyFine(s)
    if (consumed > 0) {
      consumedTicks += 1
      const group = tickPossession === undefined ? 'otherLive' : GROUP_OF[fine]
      consumedByGroup[group] += 1
      if (tickPossession === undefined) consumedWithoutPossession += 1
      if (tickPossession !== undefined) { tickPossession._ticks[group] = (tickPossession._ticks[group] ?? 0) + 1; tickPossession._ticks.clock = (tickPossession._ticks.clock ?? 0) + 1 }
    } else {
      deadTicks += 1
      deadByPhase[s.playState.phase] = (deadByPhase[s.playState.phase] ?? 0) + 1
      if (tickPossession !== undefined) tickPossession._ticks.dead = (tickPossession._ticks.dead ?? 0) + 1
    }
    if (tickPossession !== undefined) { tickPossession._ticks.wall = (tickPossession._ticks.wall ?? 0) + 1; if (s.shotClockTenths !== null) tickPossession._lastShotClock = s.shotClockTenths / 10 }
    // ---- events
    for (const e of events) {
      ownershipEvents[e.type] = (ownershipEvents[e.type] ?? 0) + 1
      if (e.type === 'possessionStart' && e.possessionId !== undefined) {
        const previous = lastEnded
        if (previous !== null && previous.endClockTenths === e.gameClockTenths && previous.period === e.period && lastClockAtPossessionEnd === e.gameClockTenths) possessionStartsWithoutClock += 1
        const sameTeam = previous !== null && String(e.teamId) === previous.team
        if (previous !== null && !sameTeam) teamChanges += 1
        open.set(e.possessionId, {
          id: e.possessionId, team: String(e.teamId), startT: s.t, endT: s.t, startClockTenths: e.gameClockTenths, endClockTenths: e.gameClockTenths, period: e.period, elapsedGameSeconds: 0, wallSeconds: 0,
          startReason: e.startReason ?? '?', endReason: '?', endClass: 'OTHER', shotClockAtStart: s.shotClockTenths === null ? null : s.shotClockTenths / 10, shotClockAtEnd: null,
          passes: 0, drives: 0, screens: 0, shots: 0, made: 0, points: 0, turnovers: [], fouls: 0, orebs: 0, drebs: 0, stealsSuffered: 0, stealsMade: 0, freeThrowSequences: 0,
          deadBallSeconds: 0, transitionSeconds: 0, halfCourtSeconds: 0, actionSeconds: 0, otherLiveSeconds: 0, firstDecisionSeconds: null, firstShotSeconds: null, initiator: null,
          playKind: null, playClass: 'NO_PLAY', settledAtSeconds: null, sameTeamAsPrevious: sameTeam, previousEndReason: previous?.endReason ?? null,
          _ticks: {}, _decisionT: null, _shotT: null, _playSampled: false, _earlyDone: false, _lastShotClock: null, _firstHolderSet: false,
        })
        lastStartT = s.t
        void lastStartT
      }
      const pid = e.possessionId ?? s.activePossessionId ?? undefined
      let p = pid === undefined ? undefined : open.get(pid)
      if (p === undefined && e.teamId !== undefined && (e.type === 'freeThrowMade' || e.type === 'shotMade')) { const last = lastClosedByTeam.get(String(e.shootingTeamId ?? e.teamId)); if (last !== undefined) { if (e.type === 'freeThrowMade') last.points += 1; } }
      if (e.type === 'passReleased' && e.passerPlayerId !== undefined && e.receiverPlayerId !== undefined) {
        const a = s.players.find((x) => x.playerId === e.passerPlayerId); const b = s.players.find((x) => x.playerId === e.receiverPlayerId)
        if (a !== undefined && b !== undefined) {
          const clearance = Math.min(...s.players.filter((x) => x.active && x.teamId !== a.teamId).map((x) => segmentDistance(x.position, a.position, b.position)))
          const skill = Object.values(a.passing).filter((v): v is number => typeof v === 'number')
          pending = { passer: String(e.passerPlayerId), receiver: String(e.receiverPlayerId), distance: distanceBetween(a.position, b.position), laneClearance: clearance, skill: skill.reduce((x, y) => x + y, 0) / Math.max(1, skill.length), quality: e.passQuality ?? null, kind: pendingKind.get(String(e.passerPlayerId)) ?? 'PASS' }
        }
        u(String(e.passerPlayerId), playerTeam(String(e.passerPlayerId))).passesMade += 1
        if (p !== undefined) p.passes += 1
      }
      if (e.type === 'actionStarted' && (e.actionKind === 'PASS' || e.actionKind === 'KICK_OUT') && e.playerId !== undefined) pendingKind.set(String(e.playerId), e.actionKind)
      if (e.type === 'passReceived' && e.receiverPlayerId !== undefined) {
        u(String(e.receiverPlayerId), playerTeam(String(e.receiverPlayerId))).passesReceived += 1
        if (pending !== null) { passes.push({ ...pending, passerSkill: pending.skill, outcome: 'CAUGHT', interceptor: null }); pending = null }
      }
      if (e.type === 'passIntercepted') { if (pending !== null) { passes.push({ ...pending, passerSkill: pending.skill, outcome: 'INTERCEPTED', interceptor: e.playerId === undefined ? null : String(e.playerId) }); pending = null } }
      if (e.type === 'passBecameLoose') { if (pending !== null) { passes.push({ ...pending, passerSkill: pending.skill, outcome: 'LOOSE', interceptor: null }); pending = null } }
      if (e.type === 'passReceived' || e.type === 'looseBallRecovered' || e.type === 'reboundSecured') { const id = String(e.playerId ?? e.receiverPlayerId ?? ''); if (id !== '') u(id, playerTeam(id)).touches += 1 }
      if (e.type === 'steal') { if (p !== undefined) p.stealsSuffered += 1; for (const q of open.values()) if (q.team !== String(e.teamId) && q.id === e.possessionId) q.stealsSuffered += 0 }
      if (p === undefined) continue
      if (e.type === 'screenSet') p.screens += 1
      if (e.type === 'actionStarted' && e.actionKind === 'DRIVE') p.drives += 1
      if (e.type === 'foul') p.fouls += 1
      if (e.type === 'freeThrowSequenceStarted') { p.freeThrowSequences += 1; if (e.playerId !== undefined || e.shooterPlayerId !== undefined) u(String(e.shooterPlayerId ?? e.playerId), String(e.teamId ?? '?')).ftTrips += 1 }
      if (e.type === 'freeThrowMade') { p.points += 1; if (e.shooterPlayerId !== undefined || e.playerId !== undefined) u(String(e.shooterPlayerId ?? e.playerId), String(e.teamId ?? '?')).points += 1 }
      if (e.type === 'turnover') { p.turnovers.push(String(e.turnoverType)); if (e.playerId !== undefined) u(String(e.playerId), playerTeam(String(e.playerId))).turnovers += 1 }
      if (e.type === 'reboundSecured') { if (e.reboundType === 'offensive') p.orebs += 1; else p.drebs += 1 }
      if (e.type === 'assist' && e.playerId !== undefined) u(String(e.playerId), playerTeam(String(e.playerId))).assists += 1
      if (e.type === 'shotMade') { p.made += 1; p.points += e.points ?? 0; if (e.shooterPlayerId !== undefined) u(String(e.shooterPlayerId), playerTeam(String(e.shooterPlayerId))).points += e.points ?? 0 }
      if (e.type === 'decisionSelected' && e.playerId !== undefined) {
        if (p._decisionT === null) { p._decisionT = s.t; p.firstDecisionSeconds = (s.t - p.startT) / 10 }
        if (!p._firstHolderSet) { p._firstHolderSet = true; p.initiator = String(e.playerId); u(String(e.playerId), playerTeam(String(e.playerId))).initiations += 1 }
      }
      if (e.type === 'shotReleased') {
        p.shots += 1
        if (p._shotT === null) { p._shotT = s.t; p.firstShotSeconds = (s.t - p.startT) / 10 }
        if (e.shooterPlayerId !== undefined) u(String(e.shooterPlayerId), playerTeam(String(e.shooterPlayerId))).fga += 1
      }
      // early offense: first attack (drive or shot) inside 8 s of a new possession
      if (!p._earlyDone && (e.type === 'shotReleased' || (e.type === 'actionStarted' && e.actionKind === 'DRIVE')) && s.t - p.startT <= 80) {
        p._earlyDone = true
        const actorId = e.shooterPlayerId ?? e.playerId
        const actor = s.players.find((x) => x.playerId === actorId)
        const team = actor?.teamId
        if (actor !== undefined && team !== undefined) {
          const basket = attackingBasketForTeam(team, s.homeTeamId, s.period, s.court)
          const myDist = distanceBetween(actor.position, basket)
          const others = s.players.filter((x) => x.active && x.playerId !== actor.playerId)
          const attackersAhead = others.filter((x) => x.teamId === team && distanceBetween(x.position, basket) < myDist).length
          const defendersAhead = others.filter((x) => x.teamId !== team && distanceBetween(x.position, basket) < myDist).length
          const defenderToBall = Math.min(...others.filter((x) => x.teamId !== team).map((x) => distanceBetween(x.position, actor.position)))
          const set45 = defenseIsSet(s, 4.5)
          const organized = others.filter((x) => x.teamId !== team && distanceBetween(x.position, basket) < myDist + 2 && distanceBetween(x.position, actor.position) < 8).length
          const flow = s.offenseFlow
          const unsettled = flow === null || flow.possessionId !== p.id || flow.settledAtT === null
          const klass = defendersAhead <= attackersAhead ? 'LEGITIMATE_TRANSITION' : defendersAhead >= 4 && set45 ? 'FALSE_EARLY_OFFENSE' : 'SEMI_TRANSITION'
          early.push({ possessionId: p.id, startReason: p.startReason, sinceStartSeconds: (s.t - p.startT) / 10, kind: e.type === 'shotReleased' ? 'SHOT' : 'DRIVE', ballDistanceToBasket: myDist, attackersAhead, defendersAhead, organizedDefenders: organized, defenderToBall, shotProbability: e.shotProbability ?? null, defenseSet45: set45, unsettled, klass, nextAction: 'pending', stage: before.offenseFlow === null || before.offenseFlow.possessionId !== p.id ? 'NO_FLOW' : before.offenseFlow.stage + (before.offenseFlow.settledAtT === null ? '/unsettled' : '/settled'), phase: before.possessions.find((x) => x.id === p.id)?.phase ?? '?', transitionAdvantage: before.transition === null || before.transition.teamId !== team ? 'NONE' : String(before.transition.advantage), transitionTrigger: before.transition === null || before.transition.teamId !== team ? 'NONE' : String(before.transition.trigger), creation: e.shotCreation ?? null, zone: e.shotZone ?? null, passesBefore: p.passes, crossedHalf: s.backcourtControl != null && s.backcourtControl.done, fromPossessionStartToCross: null })
        }
      }
      if (e.type === 'possessionEnd' && e.possessionId !== undefined) {
        const q = open.get(e.possessionId)
        if (q === undefined) continue
        q.endT = s.t; q.endClockTenths = e.gameClockTenths; q.endReason = e.endReason ?? '?'; q.shotClockAtEnd = q._lastShotClock
        const t = q._ticks
        q.elapsedGameSeconds = (t.clock ?? 0) / 10; q.wallSeconds = (s.t - q.startT) / 10
        q.deadBallSeconds = (t.dead ?? 0) / 10; q.transitionSeconds = (t.transition ?? 0) / 10; q.halfCourtSeconds = (t.halfCourt ?? 0) / 10; q.actionSeconds = (t.action ?? 0) / 10; q.otherLiveSeconds = (t.otherLive ?? 0) / 10
        q.endClass = classifyEnd(q)
        lastEnded = q; lastClockAtPossessionEnd = e.gameClockTenths
        lastClosedByTeam.set(q.team, q)
        const { _ticks, _decisionT, _shotT, _playSampled, _earlyDone, _lastShotClock, _firstHolderSet, ...rest } = q
        void _ticks; void _decisionT; void _shotT; void _playSampled; void _earlyDone; void _lastShotClock; void _firstHolderSet
        rows.push(rest)
        open.delete(e.possessionId)
      }
    }
    // play kind: sampled once, the first tick the half court is settled
    const cur = s.activePossessionId === null ? undefined : open.get(s.activePossessionId)
    if (cur !== undefined && !cur._playSampled && s.offenseFlow !== null && s.offenseFlow.possessionId === cur.id && s.offenseFlow.settledAtT !== null) {
      cur._playSampled = true
      cur.playKind = playFor(s, s.offenseFlow.teamId)
      cur.settledAtSeconds = (s.offenseFlow.settledAtT - cur.startT) / 10
    }
    // the action that follows an early attack
    void touched
  }
  for (const r of rows) r.playClass = classifyPlay(r, early.some((x) => x.possessionId === r.id))
  return {
    seed, complete: live.matchState.isComplete, rows, early, passes, players: [...use.values()],
    clock: { totalTicks, consumedTicks, deadTicks, consumedByGroup, deadByPhase, periodLengthTenths: setup.clockRules.periodSeconds * 10, periods: setup.clockRules.periodCount, consumedWithoutPossession },
    possessionStartsWithoutClock, teamChanges, ownershipEvents,
  }
}

function classifyEnd(q: PossessionRow): EndClass {
  if (q.endReason === 'periodEnd') return 'PERIOD_END'
  if (q.endReason === 'shotClock') return 'SHOT_CLOCK_VIOLATION'
  if (q.endReason === 'made') return q.made === 0 && q.freeThrowSequences > 0 ? 'FREE_THROW_SEQUENCE' : 'MADE_SHOT'
  if (q.endReason === 'defensiveRebound') return 'DEFENSIVE_REBOUND'
  if (q.endReason === 'turnover') {
    const t = q.turnovers[0]
    if (t === 'BAD_PASS') return 'TURNOVER_BAD_PASS'
    if (t === 'INTERCEPTION' || q.stealsSuffered > 0) return 'TURNOVER_STEAL'
    if (t === 'LOST_DRIBBLE') return 'TURNOVER_DRIBBLE'
    if (t === 'OFFENSIVE_FOUL') return 'OFFENSIVE_FOUL'
    return 'OTHER_TURNOVER'
  }
  return 'OTHER'
}

function classifyPlay(r: PossessionRow, hasEarly: boolean): string {
  if (hasEarly && (r.settledAtSeconds === null || (r.firstShotSeconds !== null && r.firstShotSeconds <= 8 && r.settledAtSeconds > (r.firstShotSeconds ?? 0)))) return 'EARLY_OFFENSE'
  if (r.orebs > 0) return 'BROKEN_PLAY_RESET'
  if (r.playKind === 'BALL_SCREEN') return 'BALL_SCREEN'
  if (r.playKind === 'DRIVE_KICK') return 'DRIVE_KICK'
  if (r.playKind === 'SWING') return 'CIRCULATION'
  return 'NO_SET_REACHED'
}

const mean = (v: readonly number[]): number => Number((v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)).toFixed(2))

export function summarizeLedger(games: readonly LedgerGame[]): Record<string, unknown> {
  const n = games.length
  const all = games.flatMap((g) => g.rows.map((r) => ({ ...r, seed: g.seed })))
  const per = (x: number): number => Number((x / n).toFixed(2))
  // 2. end classes
  const classes = [...new Set(all.map((r) => r.endClass))].sort()
  const byEnd = Object.fromEntries(classes.map((c) => { const rows = all.filter((r) => r.endClass === c); return [c, { perGame: per(rows.length), pct: Number((100 * rows.length / all.length).toFixed(1)), meanGameSeconds: mean(rows.map((r) => r.elapsedGameSeconds)), medianGameSeconds: quantiles(rows.map((r) => r.elapsedGameSeconds)).median }] }))
  const reasons = [...new Set(all.map((r) => r.startReason))].sort()
  const byStart = Object.fromEntries(reasons.map((c) => { const rows = all.filter((r) => r.startReason === c); return [c, { perGame: per(rows.length), pct: Number((100 * rows.length / all.length).toFixed(1)), meanGameSeconds: mean(rows.map((r) => r.elapsedGameSeconds)), medianGameSeconds: quantiles(rows.map((r) => r.elapsedGameSeconds)).median, shotsPerPossession: mean(rows.map((r) => r.shots)), points: mean(rows.map((r) => r.points)) }] }))
  // 3. clock
  const sum = (f: (g: LedgerGame) => number): number => games.reduce((a, g) => a + f(g), 0) / n / 10
  const rowsClock = all.reduce((a, r) => a + r.elapsedGameSeconds, 0) / n
  const clock = {
    gamesComplete: games.filter((g) => g.complete).length,
    liveClockSecondsPerGame: Number(sum((g) => g.clock.consumedTicks).toFixed(1)), deadBallSecondsPerGame: Number(sum((g) => g.clock.deadTicks).toFixed(1)),
    transitionSeconds: Number(sum((g) => g.clock.consumedByGroup.transition).toFixed(1)), halfCourtSeconds: Number(sum((g) => g.clock.consumedByGroup.halfCourt).toFixed(1)), actionSeconds: Number(sum((g) => g.clock.consumedByGroup.action).toFixed(1)), otherLiveSeconds: Number(sum((g) => g.clock.consumedByGroup.otherLive).toFixed(1)),
    liveWithoutAnyOpenPossessionSeconds: Number(sum((g) => g.clock.consumedWithoutPossession).toFixed(1)),
    possessionRowsClockSecondsPerGame: Number(rowsClock.toFixed(1)),
    reconciliationGapSeconds: Number((sum((g) => g.clock.consumedTicks) - sum((g) => g.clock.consumedByGroup.transition + g.clock.consumedByGroup.halfCourt + g.clock.consumedByGroup.action + g.clock.consumedByGroup.otherLive)).toFixed(3)),
    deadBallByPlayPhaseSeconds: Object.fromEntries(Object.keys(games[0]!.clock.deadByPhase).map((k) => [k, Number(sum((g) => g.clock.deadByPhase[k] ?? 0).toFixed(1))])),
    scheduledSecondsPerGame: Number(((games[0]!.clock.periodLengthTenths * games[0]!.clock.periods) / 10).toFixed(1)),
  }
  // 3/4 double counting
  const gapsBetween: number[] = []
  for (const g of games) for (let i = 1; i < g.rows.length; i += 1) gapsBetween.push((g.rows[i]!.startT - g.rows[i - 1]!.startT) / 10)
  const doubleCount = {
    possessionsPerGame: per(all.length), teamPossessionChangesPerGame: per(games.reduce((a, g) => a + g.teamChanges, 0)),
    consecutiveSameTeamPossessionsPerGame: per(all.filter((r) => r.sameTeamAsPrevious).length),
    sameTeamConsecutiveByPreviousEnd: Object.fromEntries([...new Set(all.filter((r) => r.sameTeamAsPrevious).map((r) => `${r.previousEndReason}->${r.startReason}`))].map((k) => [k, per(all.filter((r) => r.sameTeamAsPrevious && `${r.previousEndReason}->${r.startReason}` === k).length)])),
    possessionsWithZeroClock: per(all.filter((r) => r.elapsedGameSeconds === 0).length), possessionsUnder1s: per(all.filter((r) => r.elapsedGameSeconds < 1).length), possessionsUnder2s: per(all.filter((r) => r.elapsedGameSeconds < 2).length),
    startsWithinOneSecondOfPreviousStart: per(gapsBetween.filter((x) => x < 1).length),
    startsThatShareTheClockTickOfTheLastEnd: per(games.reduce((a, g) => a + g.possessionStartsWithoutClock, 0)),
    possessionsWithNoShotNoTurnoverNoFreeThrowNoRebound: per(all.filter((r) => r.shots === 0 && r.turnovers.length === 0 && r.freeThrowSequences === 0 && r.orebs === 0).length),
    possessionsWithFreeThrows: per(all.filter((r) => r.freeThrowSequences > 0).length),
    possessionsEndingInTurnoverThatAlsoHadAShot: per(all.filter((r) => r.turnovers.length > 0 && r.shots > 0).length),
    ownershipEventsPerGame: Object.fromEntries(['possessionStart', 'possessionEnd', 'passReceived', 'passIntercepted', 'steal', 'deflection', 'looseBallRecovered', 'reboundSecured', 'turnover', 'inboundReleased', 'jumpBallResolved'].map((k) => [k, per(games.reduce((a, g) => a + (g.ownershipEvents[k] ?? 0), 0))])),
  }
  // 5. duration by end reason already in byEnd; add start x end matrix for steals
  // 6. early offense
  const earlyAll = games.flatMap((g) => g.early)
  const classesE = ['LEGITIMATE_TRANSITION', 'SEMI_TRANSITION', 'FALSE_EARLY_OFFENSE'] as const
  const startsE = [...new Set(earlyAll.map((e) => e.startReason))].sort()
  const earlySummary = {
    attemptsPerGame: per(earlyAll.length),
    byClass: Object.fromEntries(classesE.map((c) => { const rows = earlyAll.filter((e) => e.klass === c); return [c, { perGame: per(rows.length), pct: Number((100 * rows.length / Math.max(1, earlyAll.length)).toFixed(1)), meanSeconds: mean(rows.map((e) => e.sinceStartSeconds)), attackersAhead: mean(rows.map((e) => e.attackersAhead)), defendersAhead: mean(rows.map((e) => e.defendersAhead)), organizedDefenders: mean(rows.map((e) => e.organizedDefenders)), defenderToBall: mean(rows.map((e) => e.defenderToBall)), shotProbability: mean(rows.flatMap((e) => (e.shotProbability === null ? [] : [e.shotProbability]))), shots: rows.filter((e) => e.kind === 'SHOT').length / n, drives: rows.filter((e) => e.kind === 'DRIVE').length / n }] })),
    byStart: Object.fromEntries(startsE.map((s) => { const rows = earlyAll.filter((e) => e.startReason === s); return [s, { perGame: per(rows.length), legit: per(rows.filter((e) => e.klass === 'LEGITIMATE_TRANSITION').length), semi: per(rows.filter((e) => e.klass === 'SEMI_TRANSITION').length), falseEarly: per(rows.filter((e) => e.klass === 'FALSE_EARLY_OFFENSE').length), unsettled: per(rows.filter((e) => e.unsettled).length), defenseSet45: per(rows.filter((e) => e.defenseSet45).length) }] })),
    byKindAndCreation: Object.fromEntries([...new Set(earlyAll.map((e) => `${e.kind}/${e.creation ?? '-'}`))].sort().map((k) => { const rows = earlyAll.filter((e) => `${e.kind}/${e.creation ?? '-'}` === k); return [k, { perGame: per(rows.length), legit: per(rows.filter((e) => e.klass === 'LEGITIMATE_TRANSITION').length), semi: per(rows.filter((e) => e.klass === 'SEMI_TRANSITION').length), falseEarly: per(rows.filter((e) => e.klass === 'FALSE_EARLY_OFFENSE').length), passesBefore: mean(rows.map((e) => e.passesBefore)), seconds: mean(rows.map((e) => e.sinceStartSeconds)), shotProbability: mean(rows.flatMap((e) => (e.shotProbability === null ? [] : [e.shotProbability]))) }] })),
    byTrigger: Object.fromEntries([...new Set(earlyAll.map((e) => `${e.kind}|stage=${e.stage}|phase=${e.phase}|transition=${e.transitionAdvantage}`))].sort().map((k) => { const rows = earlyAll.filter((e) => `${e.kind}|stage=${e.stage}|phase=${e.phase}|transition=${e.transitionAdvantage}` === k); return [k, { perGame: per(rows.length), legit: per(rows.filter((e) => e.klass === 'LEGITIMATE_TRANSITION').length), semi: per(rows.filter((e) => e.klass === 'SEMI_TRANSITION').length), falseEarly: per(rows.filter((e) => e.klass === 'FALSE_EARLY_OFFENSE').length), seconds: mean(rows.map((e) => e.sinceStartSeconds)) }] })),
    byZone: Object.fromEntries([...new Set(earlyAll.filter((e) => e.kind === 'SHOT').map((e) => e.zone ?? '-'))].sort().map((k) => [k, per(earlyAll.filter((e) => e.kind === 'SHOT' && (e.zone ?? '-') === k).length)])),
    passesBefore: quantiles(earlyAll.map((e) => e.passesBefore)),
    ballDistanceToBasket: quantiles(earlyAll.map((e) => e.ballDistanceToBasket)), sinceStartSeconds: quantiles(earlyAll.map((e) => e.sinceStartSeconds)),
    shareOfPossessionsWithAnAttackWithin8s: Number((earlyAll.length / Math.max(1, all.length)).toFixed(3)),
  }
  // 7. turnover chains
  const chains: { turnoverClass: EndClass; nextStart: string; nextFirstDecision: number | null; nextFirstShot: number | null; nextEnd: EndClass; nextSeconds: number; chain: boolean }[] = []
  for (const g of games) for (let i = 0; i < g.rows.length - 1; i += 1) {
    const r = g.rows[i]!; const next = g.rows[i + 1]!
    if (!['TURNOVER_BAD_PASS', 'TURNOVER_STEAL', 'TURNOVER_DRIBBLE', 'OFFENSIVE_FOUL', 'OTHER_TURNOVER', 'SHOT_CLOCK_VIOLATION'].includes(r.endClass)) continue
    chains.push({ turnoverClass: r.endClass, nextStart: next.startReason, nextFirstDecision: next.firstDecisionSeconds, nextFirstShot: next.firstShotSeconds, nextEnd: next.endClass, nextSeconds: next.elapsedGameSeconds, chain: ['TURNOVER_BAD_PASS', 'TURNOVER_STEAL', 'TURNOVER_DRIBBLE', 'OFFENSIVE_FOUL', 'OTHER_TURNOVER'].includes(next.endClass) })
  }
  const turnoverEnds = all.filter((r) => ['TURNOVER_BAD_PASS', 'TURNOVER_STEAL', 'TURNOVER_DRIBBLE', 'OFFENSIVE_FOUL', 'OTHER_TURNOVER'].includes(r.endClass))
  const afterTurnover = chains
  const turnoverSummary = {
    turnoversPerGame: per(turnoverEnds.length), stealsMadePerGame: per(games.reduce((a, g) => a + (g.ownershipEvents.steal ?? 0), 0)), possessionsStartedByTurnoverPerGame: per(all.filter((r) => ['steal', 'turnoverInbound', 'shotClockViolation'].includes(r.startReason)).length),
    nextPossession: { n: afterTurnover.length, firstDecisionSeconds: quantiles(afterTurnover.flatMap((c) => (c.nextFirstDecision === null ? [] : [c.nextFirstDecision]))), firstShotSeconds: quantiles(afterTurnover.flatMap((c) => (c.nextFirstShot === null ? [] : [c.nextFirstShot]))), gameSeconds: quantiles(afterTurnover.map((c) => c.nextSeconds)), endingInTurnoverShare: Number((afterTurnover.filter((c) => c.chain).length / Math.max(1, afterTurnover.length)).toFixed(3)), endClassShare: Object.fromEntries([...new Set(afterTurnover.map((c) => c.nextEnd))].sort().map((k) => [k, Number((afterTurnover.filter((c) => c.nextEnd === k).length / Math.max(1, afterTurnover.length)).toFixed(3))])) },
    turnoverToTurnoverChainsPerGame: per(afterTurnover.filter((c) => c.chain).length),
    byTurnoverClass: Object.fromEntries([...new Set(afterTurnover.map((c) => c.turnoverClass))].sort().map((k) => { const rows = afterTurnover.filter((c) => c.turnoverClass === k); return [k, { perGame: per(rows.length), nextPossessionSeconds: mean(rows.map((c) => c.nextSeconds)), nextShotWithin8s: Number((rows.filter((c) => c.nextFirstShot !== null && c.nextFirstShot <= 8).length / Math.max(1, rows.length)).toFixed(3)), nextEndsInTurnover: Number((rows.filter((c) => c.chain).length / Math.max(1, rows.length)).toFixed(3)) }] })),
    possessionSecondsAfterTurnoverVsOther: { afterTurnover: mean(all.filter((r) => ['steal', 'turnoverInbound', 'shotClockViolation'].includes(r.startReason)).map((r) => r.elapsedGameSeconds)), other: mean(all.filter((r) => !['steal', 'turnoverInbound', 'shotClockViolation'].includes(r.startReason)).map((r) => r.elapsedGameSeconds)) },
  }
  // 8. pass risk
  const pr = games.flatMap((g) => g.passes)
  const bin = (lo: number, hi: number, f: (p: PassRow) => number): PassRow[] => pr.filter((p) => f(p) >= lo && f(p) < hi)
  const rate = (rows: readonly PassRow[]) => ({ n: rows.length, perGame: per(rows.length), interceptPct: Number((100 * rows.filter((p) => p.outcome === 'INTERCEPTED').length / Math.max(1, rows.length)).toFixed(1)), loosePct: Number((100 * rows.filter((p) => p.outcome === 'LOOSE').length / Math.max(1, rows.length)).toFixed(1)), lossPct: Number((100 * rows.filter((p) => p.outcome !== 'CAUGHT').length / Math.max(1, rows.length)).toFixed(1)) })
  const byPasser = new Map<string, PassRow[]>(); for (const p of pr) byPasser.set(p.passer, [...(byPasser.get(p.passer) ?? []), p])
  const byInterceptor = new Map<string, number>(); for (const p of pr) if (p.interceptor !== null) byInterceptor.set(p.interceptor, (byInterceptor.get(p.interceptor) ?? 0) + 1)
  const passRisk = {
    overall: rate(pr), byKind: Object.fromEntries([...new Set(pr.map((p) => p.kind))].map((k) => [k, rate(pr.filter((p) => p.kind === k))])),
    byDistance: Object.fromEntries([[0, 4], [4, 7], [7, 10], [10, 14], [14, 99]].map(([lo, hi]) => [`${lo}-${hi}m`, rate(bin(lo!, hi!, (p) => p.distance))])),
    byLaneClearance: Object.fromEntries([[0, 1], [1, 1.5], [1.5, 2.5], [2.5, 4], [4, 99]].map(([lo, hi]) => [`${lo}-${hi}m`, rate(bin(lo!, hi!, (p) => p.laneClearance))])),
    bySkill: Object.fromEntries([[0, 50], [50, 60], [60, 70], [70, 80], [80, 101]].map(([lo, hi]) => [`${lo}-${hi}`, rate(bin(lo!, hi!, (p) => p.passerSkill))])),
    topPassersByLosses: [...byPasser.entries()].map(([k, v]) => ({ passer: k, ...rate(v), skill: mean(v.map((p) => p.passerSkill)) })).sort((a, b) => b.n - a.n).slice(0, 6),
    interceptorsTop: [...byInterceptor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ defender: k, perGame: per(v) })),
    meanDistance: mean(pr.map((p) => p.distance)), meanLaneClearance: mean(pr.map((p) => p.laneClearance)),
    passesWithClearanceUnder1_5m: per(pr.filter((p) => p.laneClearance < 1.5).length),
  }
  // 9. play type economy
  const playTypes = [...new Set(all.map((r) => r.playClass))].sort()
  const playEconomy = Object.fromEntries(playTypes.map((k) => {
    const rows = all.filter((r) => r.playClass === k)
    return [k, { perGame: per(rows.length), pct: Number((100 * rows.length / all.length).toFixed(1)), gameSeconds: mean(rows.map((r) => r.elapsedGameSeconds)), passes: mean(rows.map((r) => r.passes)), drives: mean(rows.map((r) => r.drives)), screens: mean(rows.map((r) => r.screens)), fgaPerPossession: mean(rows.map((r) => r.shots)), turnoversPerPossession: mean(rows.map((r) => r.turnovers.length)), ppp: mean(rows.map((r) => r.points)), shareOfGameClock: Number((100 * rows.reduce((a, r) => a + r.elapsedGameSeconds, 0) / Math.max(1, all.reduce((a, r) => a + r.elapsedGameSeconds, 0))).toFixed(1)) }]
  }))
  // 10. star usage
  const usage = games.flatMap((g) => { const teams = [...new Set(g.players.map((p) => p.team))]; return teams.flatMap((t) => { const ps = g.players.filter((p) => p.team === t).sort((a, b) => b.fga - a.fga); const teamFga = ps.reduce((a, p) => a + p.fga, 0); const teamInit = ps.reduce((a, p) => a + p.initiations, 0); return ps.slice(0, 3).map((p, i) => ({ seed: g.seed, team: t, rank: i + 1, fga: p.fga, fgaShare: Number((p.fga / Math.max(1, teamFga)).toFixed(3)), initiations: p.initiations, initShare: Number((p.initiations / Math.max(1, teamInit)).toFixed(3)), touches: p.touches, passesMade: p.passesMade, passesReceived: p.passesReceived, turnovers: p.turnovers, points: p.points, assists: p.assists })) }) })
  const rank = (r: number) => usage.filter((x) => x.rank === r)
  const starUsage = {
    perTeamGame: Object.fromEntries([1, 2, 3].map((r) => [`rank${r}`, { fga: mean(rank(r).map((x) => x.fga)), fgaShare: mean(rank(r).map((x) => x.fgaShare)), initiationShare: mean(rank(r).map((x) => x.initShare)), touches: mean(rank(r).map((x) => x.touches)), passesMade: mean(rank(r).map((x) => x.passesMade)), passesReceived: mean(rank(r).map((x) => x.passesReceived)), turnovers: mean(rank(r).map((x) => x.turnovers)), points: mean(rank(r).map((x) => x.points)) }])),
    topFgaPerTeamGame: Number(Math.max(...rank(1).map((x) => x.fga)).toFixed(0)),
    fgaPerTeamGame: mean(games.flatMap((g) => { const teams = [...new Set(g.players.map((p) => p.team))]; return teams.map((t) => g.players.filter((p) => p.team === t).reduce((a, p) => a + p.fga, 0)) })),
  }
  const stat = (f: (r: (typeof all)[number]) => number): number => per(all.reduce((a, r) => a + f(r), 0))
  return {
    games: n, seeds: games.map((g) => g.seed),
    totals: { possessionsPerGame: per(all.length), gameSecondsPerPossession: mean(all.map((r) => r.elapsedGameSeconds)), wallSecondsPerPossession: mean(all.map((r) => r.wallSeconds)), points: stat((r) => r.points), shots: stat((r) => r.shots), made: stat((r) => r.made), passes: stat((r) => r.passes), drives: stat((r) => r.drives), screens: stat((r) => r.screens), turnovers: stat((r) => r.turnovers.length), steals: stat((r) => r.stealsSuffered), fouls: stat((r) => r.fouls), orebs: stat((r) => r.orebs), drebs: stat((r) => r.drebs), assists: per(games.reduce((a, g) => a + g.players.reduce((b, p) => b + p.assists, 0), 0)), pppPerPossession: mean(all.map((r) => r.points)), possessionSeconds: quantiles(all.map((r) => r.elapsedGameSeconds)) },
    byEndClass: byEnd, byStartReason: byStart, clock, doubleCount, early: earlySummary, turnoverChain: turnoverSummary, passRisk, playEconomy, starUsage,
  }
}
