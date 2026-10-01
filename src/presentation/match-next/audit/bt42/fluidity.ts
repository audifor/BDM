/**
 * BT4.2 fluidity analysis: why does a game feel flat? One pass per game over every tick of the real session (live controller path).
 * Defense: how much each defender moves for what he achieves, how often he changes his mind, how often he is the wrong side of the
 * ball. Offense: how many players do something at the same time, how much of the floor is standing, how varied the possessions are.
 * Nothing here changes a game.
 */
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { distanceBetween } from '@/domain/court'
import type { MatchNextEvent } from '@/engine/match-next'
import { preparedSetup } from '../bt2/economy'
import { quantiles } from '../bt4/pace'

const BANDS = [['standing', 0, 0.5], ['walk', 0.5, 2], ['jog', 2, 4], ['run', 4, 6], ['sprint', 6, 99]] as const

interface RoleStats { frames: number; speedSum: number; bands: Record<string, number>; reversals: number; pathMeters: number; netMeters: number; windows: number; headingChange: number; turnFrames: number }
const newRole = (): RoleStats => ({ frames: 0, speedSum: 0, bands: {}, reversals: 0, pathMeters: 0, netMeters: 0, windows: 0, headingChange: 0, turnFrames: 0 })

export interface FluidityGame {
  readonly seed: number
  readonly roles: Record<string, RoleStats>
  readonly kindSwitchesPerMinute: number[]
  readonly targetJumpsPerMinute: number[]
  readonly offensePlayersMovingShare: number[]
  readonly offStationaryHoldersSeconds: number[]
  readonly spacing: { nearestMate: number[]; hullArea: number[] }
  readonly touches: number[]
  readonly possessionPatterns: string[]
  readonly sampleTimelines: string[]
  readonly offBallMoves: Record<string, number>
  readonly decisionKinds: Record<string, number>
  readonly liveMinutes: number
  readonly defenderSeparationFromBall: number[]
  readonly sideOfBallDefenders: number[]
  readonly firstActionSeconds: number[]
  readonly offersPerPossession: number[]
  readonly offers: { useful: number; total: number }
}

function hullArea(points: readonly { x: number; y: number }[]): number {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (sorted.length < 3) return 0
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: { x: number; y: number }[] = []
  for (const p of sorted) { while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop(); lower.push(p) }
  const upper: { x: number; y: number }[] = []
  for (const p of [...sorted].reverse()) { while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop(); upper.push(p) }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)]
  let area = 0
  for (let i = 0; i < hull.length; i += 1) { const a = hull[i]!; const b = hull[(i + 1) % hull.length]!; area += a.x * b.y - b.x * a.y }
  return Math.abs(area) / 2
}

export function runFluidityGame(seed: number, maxTicks = 60000): FluidityGame {
  const live = createMatchEnginePort('match-next').createLiveSession(preparedSetup(seed))
  const roles: Record<string, RoleStats> = { ballHandler: newRole(), offBall: newRole(), onBallDefender: newRole(), offBallDefender: newRole() }
  const lastPos = new Map<string, { x: number; y: number }>()
  const lastVel = new Map<string, { x: number; y: number }>()
  const window = new Map<string, { start: { x: number; y: number }; path: number; n: number }>()
  const lastKind = new Map<string, string>()
  const lastTarget = new Map<string, { x: number; y: number }>()
  const kindSwitches = new Map<string, number>()
  const targetJumps = new Map<string, number>()
  const movingShare: number[] = []
  const holderStill: number[] = []
  const nearest: number[] = []
  const hulls: number[] = []
  const sepFromBall: number[] = []
  const sideOfBall: number[] = []
  const touches: number[] = []
  const patterns: string[] = []
  const timelines: string[] = []
  const offBallMoves: Record<string, number> = {}
  const decisionKinds: Record<string, number> = {}
  const open = new Map<string, { start: number; reason: string; seq: string[]; touchers: Set<string>; firstAction?: number; offers: number; firstDecision?: number }>()
  const firstAction: number[] = []
  const offersPer: number[] = []
  const offerTracker = new Map<string, number>()
  const offerStats = { useful: 0, total: 0 }
  let liveTicks = 0
  let holdTicks = 0
  let holdPlayer: string | undefined
  let seenEvents = 0
  while (!live.matchState.isComplete && live.matchState.t < maxTicks) {
    live.advanceOneStep()
    const s = live.matchState
    const fresh: MatchNextEvent[] = s.events.slice(seenEvents)
    seenEvents = s.events.length
    for (const e of fresh) {
      if (e.type === 'possessionStart' && e.possessionId !== undefined) open.set(e.possessionId, { start: s.t, reason: e.startReason ?? '?', seq: [], touchers: new Set(), offers: 0 })
      const id = e.possessionId ?? s.activePossessionId ?? undefined
      const p = id === undefined ? undefined : open.get(id)
      if (e.type === 'offBallMove') offBallMoves[String(e.ballReason)] = (offBallMoves[String(e.ballReason)] ?? 0) + 1
      if (e.type === 'offBallMove' && e.ballReason === 'OFFER' && e.playerId !== undefined) { offerTracker.set(String(e.playerId), e.t); offerStats.total += 1; const q = e.possessionId ?? s.activePossessionId ?? undefined; const pp = q === undefined ? undefined : open.get(q); if (pp) pp.offers += 1 }
      if (e.type === 'passReceived' && e.playerId !== undefined) { const t0 = offerTracker.get(String(e.playerId)); if (t0 !== undefined && e.t - t0 <= 40) { offerStats.useful += 1; offerTracker.delete(String(e.playerId)) } }
      if (e.type === 'decisionSelected') decisionKinds[String(e.decisionKind)] = (decisionKinds[String(e.decisionKind)] ?? 0) + 1
      if (p === undefined) continue
      const at = ((e.t - p.start) / 10).toFixed(1)
      if (e.type === 'decisionSelected') { p.seq.push(`${at}s ${e.decisionKind}`); if (p.firstAction === undefined && ['SCREEN', 'DRIVE', 'KICK_OUT', 'CATCH_AND_SHOOT', 'SHOOT'].includes(String(e.decisionKind))) p.firstAction = (e.t - p.start) / 10 }
      if (e.type === 'passReceived' && e.playerId !== undefined) { p.touchers.add(String(e.playerId)); p.seq.push(`${at}s catch`) }
      if (e.type === 'shotReleased') p.seq.push(`${at}s SHOT ${e.shotCreation ?? ''} ${e.shotZone ?? ''}`)
      if (e.type === 'screenSet') p.seq.push(`${at}s screenSet`)
      if (e.type === 'offBallMove') p.seq.push(`${at}s ${e.ballReason}`)
      if (e.type === 'turnover') p.seq.push(`${at}s TURNOVER ${e.turnoverType ?? ''}`)
      if (e.type === 'reboundSecured') p.seq.push(`${at}s REB ${e.reboundType}`)
      if (e.type === 'possessionEnd') {
        touches.push(p.touchers.size)
        if ((e.t - p.start) / 10 >= 6) { firstAction.push(p.firstAction ?? (e.t - p.start) / 10); offersPer.push(p.offers) }
        patterns.push(p.seq.filter((x) => !x.includes('offBall')).map((x) => x.split(' ').slice(1).join(' ')).filter((x) => x !== '').slice(0, 7).join(' > '))
        if (timelines.length < 14 && p.seq.length >= 4 && (e.t - p.start) / 10 >= 8) timelines.push(`#${id} ${p.reason} ${((e.t - p.start) / 10).toFixed(1)}s: ${p.seq.join(' | ')}`)
        open.delete(id!)
      }
    }
    const possession = s.possessions.find((p) => p.id === s.activePossessionId)
    if (possession === undefined || !s.clock.gameRunning || s.ball.kind === 'DEAD' || s.ball.kind === 'INBOUND') continue
    liveTicks += 1
    const offTeam = possession.teamId
    const holderId = s.ball.kind === 'HELD' ? String(s.ball.ownerPlayerId) : undefined
    const onBallDefId = s.defensiveStructure?.onBallDefenderPlayerId === undefined ? undefined : String(s.defensiveStructure.onBallDefenderPlayerId)
    const basket = s.defensiveStructure?.defendedBasket
    const halfCourt = possession.phase === 'SETUP' || possession.phase === 'ACTION'
    let moving = 0
    const offense = s.players.filter((p) => p.active && p.teamId === offTeam)
    for (const player of s.players) {
      if (!player.active) continue
      const id = String(player.playerId)
      const isOffense = player.teamId === offTeam
      const role = isOffense ? (id === holderId ? 'ballHandler' : 'offBall') : (id === onBallDefId ? 'onBallDefender' : 'offBallDefender')
      const stats = roles[role]!
      const speed = Math.hypot(player.velocity.x, player.velocity.y)
      stats.frames += 1; stats.speedSum += speed
      for (const [name, lo, hi] of BANDS) if (speed >= lo && speed < hi) stats.bands[name] = (stats.bands[name] ?? 0) + 1
      const prev = lastPos.get(id)
      if (prev !== undefined) stats.pathMeters += distanceBetween(prev, player.position)
      lastPos.set(id, { ...player.position })
      const pv = lastVel.get(id)
      if (pv !== undefined && speed > 1 && Math.hypot(pv.x, pv.y) > 1) {
        const cos = (pv.x * player.velocity.x + pv.y * player.velocity.y) / (speed * Math.hypot(pv.x, pv.y))
        if (cos < 0.2) stats.reversals += 1
        stats.headingChange += Math.acos(Math.max(-1, Math.min(1, cos)))
        stats.turnFrames += 1
      }
      lastVel.set(id, { ...player.velocity })
      const w = window.get(id) ?? { start: { ...player.position }, path: 0, n: 0 }
      if (prev !== undefined) w.path += distanceBetween(prev, player.position)
      w.n += 1
      if (w.n >= 30) { stats.netMeters += distanceBetween(w.start, player.position); stats.pathMeters += 0; stats.windows += w.path > 0.5 ? 1 : 0; window.set(id, { start: { ...player.position }, path: 0, n: 0 }) } else window.set(id, w)
      if (isOffense && id !== holderId && speed > 1.2) moving += 1
      if (!isOffense) {
        const resp = s.responsibilities.find((r) => r.playerId === player.playerId && r.owner === 'defensiveStructure')
        if (resp !== undefined) { const before = lastKind.get(id); if (before !== undefined && before !== resp.kind) kindSwitches.set(id, (kindSwitches.get(id) ?? 0) + 1); lastKind.set(id, resp.kind) }
        const intent = s.movementIntents.find((i) => i.playerId === player.playerId && i.provenance.owner === 'defensiveStructure')
        if (intent !== undefined) { const before = lastTarget.get(id); if (before !== undefined && distanceBetween(before, intent.target) > 1.2) targetJumps.set(id, (targetJumps.get(id) ?? 0) + 1); lastTarget.set(id, { ...intent.target }) }
        if (halfCourt && basket !== undefined) {
          const ballToBasket = distanceBetween(s.ball.position, basket)
          sepFromBall.push(distanceBetween(player.position, s.ball.position))
          if (distanceBetween(player.position, basket) > ballToBasket + 1) sideOfBall.push(1); else sideOfBall.push(0)
        }
      }
    }
    if (halfCourt) {
      movingShare.push(moving / Math.max(1, offense.length - 1))
      const pts = offense.map((p) => p.position)
      let near = 0
      for (const a of pts) near += Math.min(...pts.filter((b) => b !== a).map((b) => distanceBetween(a, b)))
      nearest.push(near / pts.length); hulls.push(hullArea(pts))
    }
    if (holderId !== undefined) {
      const holder = s.players.find((p) => String(p.playerId) === holderId)!
      if (holdPlayer === holderId && Math.hypot(holder.velocity.x, holder.velocity.y) < 0.6) holdTicks += 1
      else { if (holdTicks >= 20) holderStill.push(holdTicks / 10); holdTicks = 0 }
      holdPlayer = holderId
    } else { if (holdTicks >= 20) holderStill.push(holdTicks / 10); holdTicks = 0; holdPlayer = undefined }
  }
  const minutes = liveTicks / 600
  return {
    seed, roles, kindSwitchesPerMinute: [...kindSwitches.values()].map((v) => v / minutes), targetJumpsPerMinute: [...targetJumps.values()].map((v) => v / minutes),
    offensePlayersMovingShare: movingShare, offStationaryHoldersSeconds: holderStill, spacing: { nearestMate: nearest, hullArea: hulls }, touches, possessionPatterns: patterns,
    sampleTimelines: timelines, offBallMoves, decisionKinds, liveMinutes: minutes, defenderSeparationFromBall: sepFromBall, sideOfBallDefenders: sideOfBall, firstActionSeconds: firstAction, offersPerPossession: offersPer, offers: offerStats,
  }
}

export function summarizeFluidity(games: readonly FluidityGame[]): Record<string, unknown> {
  const roleNames = ['ballHandler', 'offBall', 'onBallDefender', 'offBallDefender']
  const byRole = Object.fromEntries(roleNames.map((r) => {
    const sum = newRole(); const bandTotals: Record<string, number> = {}
    for (const g of games) { const x = g.roles[r]!; sum.frames += x.frames; sum.speedSum += x.speedSum; sum.reversals += x.reversals; sum.pathMeters += x.pathMeters; sum.netMeters += x.netMeters; sum.windows += x.windows; sum.headingChange += x.headingChange; sum.turnFrames += x.turnFrames; for (const [k, v] of Object.entries(x.bands)) bandTotals[k] = (bandTotals[k] ?? 0) + v }
    const seconds = sum.frames / 10
    return [r, {
      meanSpeed: Number((sum.speedSum / Math.max(1, sum.frames)).toFixed(2)), bands: Object.fromEntries(BANDS.map(([name]) => [name, Number(((bandTotals[name] ?? 0) / Math.max(1, sum.frames)).toFixed(3))])),
      reversalsPerMinute: Number(((sum.reversals / Math.max(1, seconds)) * 60).toFixed(1)), meanTurnDegreesPerTick: Number(((sum.headingChange / Math.max(1, sum.turnFrames)) * 180 / Math.PI).toFixed(1)),
      pathEfficiency3s: Number((sum.netMeters / Math.max(1e-9, sum.pathMeters)).toFixed(2)),
    }]
  }))
  const flat = <T,>(pick: (g: FluidityGame) => readonly T[]): T[] => games.flatMap((g) => [...pick(g)])
  const patterns = flat((g) => g.possessionPatterns)
  const patternCounts: Record<string, number> = {}
  for (const p of patterns) patternCounts[p] = (patternCounts[p] ?? 0) + 1
  const top = Object.entries(patternCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => ({ pattern: k === '' ? '(empty)' : k, share: Number((v / patterns.length).toFixed(3)) }))
  const sumKinds = (pick: (g: FluidityGame) => Record<string, number>): Record<string, number> => { const out: Record<string, number> = {}; for (const g of games) for (const [k, v] of Object.entries(pick(g))) out[k] = (out[k] ?? 0) + v; return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Number((v / games.length).toFixed(1))])) }
  const minutes = games.reduce((a, g) => a + g.liveMinutes, 0) / games.length
  return {
    games: games.length, liveMinutesPerGame: Number(minutes.toFixed(1)), byRole,
    defense: {
      responsibilityKindSwitchesPerDefenderMinute: quantiles(flat((g) => g.kindSwitchesPerMinute)), movementTargetJumpsPerDefenderMinute: quantiles(flat((g) => g.targetJumpsPerMinute)),
      distanceToBall: quantiles(flat((g) => g.defenderSeparationFromBall)), shareOfHalfCourtDefenderFramesBeyondTheBallLine: Number((flat((g) => g.sideOfBallDefenders).reduce((a, b) => a + b, 0) / Math.max(1, flat((g) => g.sideOfBallDefenders).length)).toFixed(3)),
    },
    offense: {
      shareOfOffBallPlayersMoving: quantiles(flat((g) => g.offensePlayersMovingShare)), holderStandingStretchesPerGame: Number((flat((g) => g.offStationaryHoldersSeconds).length / games.length).toFixed(1)), holderStandingSeconds: quantiles(flat((g) => g.offStationaryHoldersSeconds)),
      nearestTeammateMeters: quantiles(flat((g) => g.spacing.nearestMate)), hullAreaSquareMeters: quantiles(flat((g) => g.spacing.hullArea)), playersWhoTouchedTheBallPerPossession: quantiles(flat((g) => g.touches)),
      secondsUntilTheFirstRealAction: quantiles(flat((g) => g.firstActionSeconds)), offersPerPossession: quantiles(flat((g) => g.offersPerPossession)), offersThatGotTheBallWithin4s: Number((games.reduce((a, g) => a + g.offers.useful, 0) / Math.max(1, games.reduce((a, g) => a + g.offers.total, 0))).toFixed(3)),
      offBallMovesPerGame: sumKinds((g) => g.offBallMoves), decisionsPerGame: sumKinds((g) => g.decisionKinds), mostCommonPossessionPatterns: top,
      distinctPatterns: Object.keys(patternCounts).length, possessions: patterns.length,
    },
    sampleTimelines: games[0]!.sampleTimelines,
  }
}
