/**
 * BT4.2 offensive-flow audit. One pass per game over the canonical events and the state; nothing here changes a game.
 *  1. passes: per half-court possession, before the first shot, after a drive (kick-outs)
 *  2. transition: time to the first decision / to the frontcourt / to the half-court phase, by how the possession started
 *  3. utilities of the options the handler had, and what he chose
 *  4. cadence by player (touch time, pass share) against his ratings
 *  5. second chances: where the time goes
 */
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import type { MatchNextEvent } from '@/engine/match-next'
import { preparedSetup } from '../bt2/economy'
import { classifyFine, FINE_PHASES } from '../bt41/pace41'
import { quantiles } from '../bt4/pace'

interface Decision { readonly t: number; readonly playerId: string; readonly kind: string; readonly utility: Readonly<Record<string, number>> | undefined }
interface PossessionFlow {
  id: string; startReason: string; startT: number; endT: number
  passes: { t: number; passer: string; kind: string }[]
  drives: { t: number; resolvedT: number | undefined; player: string; outcome: string | undefined }[]
  decisions: Decision[]
  shots: { t: number; creation: string | undefined }[]
  setupT: number | undefined; crossT: number | undefined; transitionStartT: number | undefined; transitionResolvedT: number | undefined; transitionResolvedDetail: string | undefined
  orebs: number[]; ticks: Record<string, number>; ticksAfterFirstOreb: Record<string, number>
}

export interface FlowGame { readonly seed: number; readonly possessions: readonly PossessionFlow[]; readonly touches: readonly { player: string; seconds: number; passed: boolean }[]; readonly assists: Readonly<Record<string, number>>; readonly sampleEvents: Record<string, unknown> }

export function runFlowGame(seed: number, maxTicks = 60000): FlowGame {
  const setup = preparedSetup(seed)
  const live = createMatchEnginePort('match-next').createLiveSession(setup)
  const open = new Map<string, PossessionFlow>()
  const done: PossessionFlow[] = []
  const touches: { player: string; seconds: number; passed: boolean }[] = []
  const caughtAt = new Map<string, number>()
  const assists: Record<string, number> = {}
  const sampleEvents: Record<string, unknown> = {}
  const pendingKind = new Map<string, string>()
  let crossRecorded = new Set<string>()
  while (!live.matchState.isComplete && live.matchState.t < maxTicks) {
    live.advanceOneStep()
    const s = live.matchState
    const events: MatchNextEvent[] = []
    for (let index = s.events.length - 1; index >= 0 && s.events[index]!.t === s.t; index -= 1) events.push(s.events[index]!)
    events.reverse()
    for (const e of events) {
      if (['transitionResolved', 'transitionStarted', 'possessionPhaseChanged', 'assist'].includes(e.type) && sampleEvents[e.type] === undefined) sampleEvents[e.type] = e
      const pid = e.possessionId ?? (e.type === 'decisionSelected' || e.type === 'actionStarted' || e.type === 'actionResolved' || e.type === 'transitionStarted' || e.type === 'transitionResolved' ? s.activePossessionId ?? undefined : undefined)
      if (e.type === 'possessionStart' && e.possessionId !== undefined) open.set(e.possessionId, { id: e.possessionId, startReason: e.startReason ?? '?', startT: s.t, endT: s.t, passes: [], drives: [], decisions: [], shots: [], setupT: undefined, crossT: undefined, transitionStartT: undefined, transitionResolvedT: undefined, transitionResolvedDetail: undefined, orebs: [], ticks: {}, ticksAfterFirstOreb: {} })
      if (e.type === 'assist' && e.playerId !== undefined) assists[String(e.playerId)] = (assists[String(e.playerId)] ?? 0) + 1
      if (e.type === 'passReceived' && e.receiverPlayerId !== undefined) caughtAt.set(String(e.receiverPlayerId), s.t)
      const p = pid === undefined ? undefined : open.get(pid)
      if (p === undefined) continue
      if (e.type === 'actionStarted' && (e.actionKind === 'PASS' || e.actionKind === 'KICK_OUT') && e.playerId !== undefined) pendingKind.set(String(e.playerId), e.actionKind)
      if (e.type === 'actionStarted' && e.actionKind === 'DRIVE') p.drives.push({ t: s.t, resolvedT: undefined, player: String(e.playerId), outcome: undefined })
      if (e.type === 'actionResolved' && e.actionKind === 'DRIVE') { const d = [...p.drives].reverse().find((x) => x.player === String(e.playerId) && x.resolvedT === undefined); if (d) { d.resolvedT = s.t; d.outcome = e.actionOutcome } }
      if (e.type === 'passReleased' && e.passerPlayerId !== undefined) p.passes.push({ t: s.t, passer: String(e.passerPlayerId), kind: pendingKind.get(String(e.passerPlayerId)) ?? 'PASS' })
      if (e.type === 'decisionSelected' && e.playerId !== undefined) {
        p.decisions.push({ t: s.t, playerId: String(e.playerId), kind: String(e.decisionKind), utility: e.utility as Record<string, number> | undefined })
        const caught = caughtAt.get(String(e.playerId))
        if (caught !== undefined && s.t - caught < 200) { touches.push({ player: String(e.playerId), seconds: (s.t - caught) / 10, passed: e.decisionKind === 'PASS' || e.decisionKind === 'KICK_OUT' }); caughtAt.delete(String(e.playerId)) }
      }
      if (e.type === 'shotReleased') p.shots.push({ t: s.t, creation: e.shotCreation })
      if (e.type === 'possessionPhaseChanged' && e.phase === 'SETUP' && p.setupT === undefined) p.setupT = s.t
      if (e.type === 'transitionStarted' && p.transitionStartT === undefined) p.transitionStartT = s.t
      if (e.type === 'transitionResolved' && p.transitionResolvedT === undefined) { p.transitionResolvedT = s.t; p.transitionResolvedDetail = [e.transitionAdvantage, e.transitionTrigger].filter((x) => x !== undefined).join('/') }
      if (e.type === 'reboundSecured' && e.reboundType === 'offensive') p.orebs.push(s.t)
    }
    const id = s.activePossessionId
    const current = id === null ? undefined : open.get(id)
    if (current !== undefined) {
      const phase = classifyFine(s)
      current.ticks[phase] = (current.ticks[phase] ?? 0) + 1
      if (current.orebs.length > 0) current.ticksAfterFirstOreb[phase] = (current.ticksAfterFirstOreb[phase] ?? 0) + 1
      const control = s.backcourtControl
      if (control != null && control.done && control.possessionId === current.id && current.crossT === undefined && !crossRecorded.has(current.id)) { current.crossT = s.t; crossRecorded.add(current.id) }
    }
    for (const e of events) {
      if (e.type !== 'possessionEnd' || e.possessionId === undefined) continue
      const p = open.get(e.possessionId)
      if (p !== undefined) { p.endT = s.t; done.push(p); open.delete(e.possessionId) }
    }
  }
  return { seed, possessions: done, touches, assists, sampleEvents }
}

const sec = (a: number | undefined, b: number): number | undefined => (a === undefined ? undefined : (a - b) / 10)

export function summarizeFlow(games: readonly FlowGame[], ratingsBySeed: ReadonlyMap<number, ReadonlyMap<string, Record<string, number>>>): Record<string, unknown> {
  const n = games.length
  const all = games.flatMap((g) => g.possessions.map((p) => ({ ...p, seed: g.seed })))
  const half = all.filter((p) => p.setupT !== undefined)
  const q = (values: readonly (number | undefined)[]) => quantiles(values.filter((v): v is number => v !== undefined))
  // 1. passes
  const passesBeforeShot = all.filter((p) => p.shots.length > 0).map((p) => p.passes.filter((x) => x.t < p.shots[0]!.t).length)
  const share = (values: readonly number[], test: (v: number) => boolean): number => Number((values.filter(test).length / Math.max(1, values.length)).toFixed(3))
  const driveRows = all.flatMap((p) => p.drives.map((d) => {
    const end = d.resolvedT ?? d.t
    const kick = p.passes.some((x) => x.passer === d.player && x.t >= end && x.t <= end + 40)
    const shot = p.shots.some((x) => x.t >= end && x.t <= end + 40)
    return { outcome: d.outcome ?? '?', kick, shot }
  }))
  const driveOutcomes = [...new Set(driveRows.map((d) => d.outcome))].sort()
  const passes = {
    perGame: Number((all.reduce((a, p) => a + p.passes.length, 0) / n).toFixed(1)),
    perHalfCourtPossession: q(half.map((p) => p.passes.length)),
    shareOfHalfCourtWithZeroOrOnePass: share(half.map((p) => p.passes.length), (v) => v <= 1),
    beforeFirstShot: { distribution: q(passesBeforeShot), zero: share(passesBeforeShot, (v) => v === 0), one: share(passesBeforeShot, (v) => v === 1), twoOrThree: share(passesBeforeShot, (v) => v === 2 || v === 3), fourPlus: share(passesBeforeShot, (v) => v >= 4) },
    kickOutPassesPerGame: Number((all.reduce((a, p) => a + p.passes.filter((x) => x.kind === 'KICK_OUT').length, 0) / n).toFixed(1)),
    afterDrive: Object.fromEntries(driveOutcomes.map((o) => { const rows = driveRows.filter((d) => d.outcome === o); return [o, { perGame: Number((rows.length / n).toFixed(1)), kickOutWithin4s: share(rows.map((r) => (r.kick ? 1 : 0)), (v) => v === 1), shotWithin4s: share(rows.map((r) => (r.shot ? 1 : 0)), (v) => v === 1) }] })),
  }
  // 2. transition
  const reasons = [...new Set(all.map((p) => p.startReason))].sort()
  const transition = Object.fromEntries(reasons.map((r) => {
    const rows = all.filter((p) => p.startReason === r)
    const firstDecision = rows.map((p) => sec(p.decisions[0]?.t, p.startT))
    const resolved = rows.filter((p) => p.transitionResolvedT !== undefined)
    const details: Record<string, number> = {}
    for (const p of resolved) details[p.transitionResolvedDetail ?? '?'] = (details[p.transitionResolvedDetail ?? '?'] ?? 0) + 1
    return [r, {
      perGame: Number((rows.length / n).toFixed(1)), toFirstDecision: q(firstDecision), toFrontcourt: q(rows.map((p) => sec(p.crossT, p.startT))), toHalfCourtPhase: q(rows.map((p) => sec(p.setupT, p.startT))),
      transitionLife: q(rows.map((p) => sec(p.transitionResolvedT, p.transitionStartT ?? p.startT))), resolvedDetail: details,
      shotWithin8s: share(rows.map((p) => (p.shots.length > 0 && (p.shots[0]!.t - p.startT) / 10 <= 8 ? 1 : 0)), (v) => v === 1), firstShotSeconds: q(rows.map((p) => sec(p.shots[0]?.t, p.startT))),
    }]
  }))
  // 3. utilities
  const decisions = all.flatMap((p) => p.decisions.filter((d) => d.utility !== undefined))
  const kinds = [...new Set(decisions.map((d) => d.kind))].sort()
  const meanOf = (rows: readonly Decision[], key: string): number => Number((rows.reduce((a, d) => a + (d.utility?.[key] ?? 0), 0) / Math.max(1, rows.length)).toFixed(3))
  const utilities = {
    decisions: decisions.length, decisionsPerPossession: Number((decisions.length / Math.max(1, all.length)).toFixed(2)),
    meanUtility: Object.fromEntries(['shoot', 'drive', 'pass', 'hold', 'screen'].map((k) => [k, meanOf(decisions, k)])),
    chosenShare: Object.fromEntries(kinds.map((k) => [k, Number((decisions.filter((d) => d.kind === k).length / Math.max(1, decisions.length)).toFixed(3))])),
    utilityWhenChosen: Object.fromEntries(kinds.map((k) => { const rows = decisions.filter((d) => d.kind === k); return [k, { n: rows.length, shoot: meanOf(rows, 'shoot'), drive: meanOf(rows, 'drive'), pass: meanOf(rows, 'pass'), hold: meanOf(rows, 'hold') }] })),
    passBeatsDriveShare: Number((decisions.filter((d) => (d.utility?.pass ?? 0) > (d.utility?.drive ?? 0)).length / Math.max(1, decisions.length)).toFixed(3)),
    passWithin0_1OfBestShare: Number((decisions.filter((d) => Math.max(d.utility?.shoot ?? 0, d.utility?.drive ?? 0, d.utility?.screen ?? 0) - (d.utility?.pass ?? 0) <= 0.1).length / Math.max(1, decisions.length)).toFixed(3)),
  }
  // 4. cadence by player
  const rows: { touch: number; passShare: number; assists: number; vision: number; creation: number; usage: number; shooting: number; n: number }[] = []
  for (const g of games) {
    const ratings = ratingsBySeed.get(g.seed)!
    const byPlayer = new Map<string, { s: number; passed: number; n: number }>()
    for (const t of g.touches) { const r = byPlayer.get(t.player) ?? { s: 0, passed: 0, n: 0 }; r.s += t.seconds; r.n += 1; if (t.passed) r.passed += 1; byPlayer.set(t.player, r) }
    for (const [id, r] of byPlayer) {
      const rt = ratings.get(id)
      if (rt === undefined || r.n < 8) continue
      rows.push({ touch: r.s / r.n, passShare: r.passed / r.n, assists: g.assists[id] ?? 0, vision: rt.vision!, creation: rt.creation!, usage: rt.usage!, shooting: rt.shooting!, n: r.n })
    }
  }
  const pearson = (xs: readonly number[], ys: readonly number[]): number => {
    const k = xs.length; if (k < 4) return 0
    const mx = xs.reduce((a, b) => a + b, 0) / k, my = ys.reduce((a, b) => a + b, 0) / k
    let num = 0, dx = 0, dy = 0
    for (let i = 0; i < k; i += 1) { num += (xs[i]! - mx) * (ys[i]! - my); dx += (xs[i]! - mx) ** 2; dy += (ys[i]! - my) ** 2 }
    return dx === 0 || dy === 0 ? 0 : Number((num / Math.sqrt(dx * dy)).toFixed(2))
  }
  const col = (key: 'touch' | 'passShare' | 'assists') => rows.map((r) => r[key])
  const cadence = {
    playerGames: rows.length, touchSeconds: q(rows.map((r) => r.touch)), passShare: q(rows.map((r) => r.passShare)),
    correlations: { 'vision vs touchSeconds': pearson(rows.map((r) => r.vision), col('touch')), 'creation vs touchSeconds': pearson(rows.map((r) => r.creation), col('touch')), 'usage vs touchSeconds': pearson(rows.map((r) => r.usage), col('touch')), 'vision vs passShare': pearson(rows.map((r) => r.vision), col('passShare')), 'creation vs passShare': pearson(rows.map((r) => r.creation), col('passShare')), 'usage vs passShare': pearson(rows.map((r) => r.usage), col('passShare')), 'creation vs assists': pearson(rows.map((r) => r.creation), col('assists')), 'vision vs assists': pearson(rows.map((r) => r.vision), col('assists')), 'passShare vs assists': pearson(col('passShare'), col('assists')) },
  }
  // 5. second chances
  const second = all.filter((p) => p.orebs.length > 0)
  const phaseMeans = (pick: (p: PossessionFlow) => Record<string, number>) => Object.fromEntries(FINE_PHASES.map((ph) => [ph, Number((second.reduce((a, p) => a + (pick(p)[ph] ?? 0), 0) / Math.max(1, second.length) / 10).toFixed(2))]).filter(([, v]) => (v as number) > 0))
  const secondChance = {
    perGame: Number((second.length / n).toFixed(1)), seconds: q(second.map((p) => (p.endT - p.startT) / 10)), orebsPerPossession: Number((second.reduce((a, p) => a + p.orebs.length, 0) / Math.max(1, second.length)).toFixed(2)),
    secondsBeforeFirstOreb: q(second.map((p) => (p.orebs[0]! - p.startT) / 10)), secondsFromFirstOrebToEnd: q(second.map((p) => (p.endT - p.orebs[0]!) / 10)),
    toFirstDecisionAfterOreb: q(second.map((p) => sec(p.decisions.find((d) => d.t > p.orebs[0]!)?.t, p.orebs[0]!))), toNextShotAfterOreb: q(second.map((p) => sec(p.shots.find((x) => x.t > p.orebs[0]!)?.t, p.orebs[0]!))),
    phaseSecondsWholePossession: phaseMeans((p) => p.ticks), phaseSecondsAfterFirstOreb: phaseMeans((p) => p.ticksAfterFirstOreb),
    shotsPerPossession: Number((second.reduce((a, p) => a + p.shots.length, 0) / Math.max(1, second.length)).toFixed(2)),
    passesAfterOrebBeforeShot: q(second.map((p) => p.passes.filter((x) => x.t > p.orebs[0]! && (p.shots.find((s) => s.t > p.orebs[0]!)?.t ?? Infinity) > x.t).length)),
  }
  return { games: n, possessionsPerGame: Number((all.length / n).toFixed(1)), passes, transition, utilities, cadence, secondChance, sampleEvents: games[0]?.sampleEvents }
}
