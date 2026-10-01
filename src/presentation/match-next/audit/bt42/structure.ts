/**
 * BT4.2 structure analysis: what is a half-court possession made of? Ball circulation (pass lengths, side-to-side reversals, dribble),
 * who takes part (players that pass, catch, screen, cut, shoot, do nothing), how far the players run, how much of the off-ball time is
 * standing on a slot, and what the defense does per possession (closeouts, rotations). Nothing here changes a game.
 */
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { distanceBetween } from '@/domain/court'
import type { MatchNextEvent } from '@/engine/match-next'
import { preparedSetup } from '../bt2/economy'
import { quantiles } from '../bt4/pace'

interface PossessionStructure {
  id: string; seconds: number; reason: string; secondChance: boolean
  passes: { distance: number; lateral: number; towardBasket: number; crossedMiddle: boolean }[]
  involved: Set<string>; passers: Set<string>; catchers: Set<string>; screeners: Set<string>; cutters: Set<string>; shooters: Set<string>; drivers: Set<string>
  path: Map<string, number>; onSlot: Map<string, number>; offFrames: Map<string, number>
  closeouts: number; rotations: number; kindChanges: number; ballMovingFrames: number; ballFrames: number; handlerPath: number; screens: number; screensUsed: number
}

export interface StructureGame { readonly seed: number; readonly rows: readonly Omit<PossessionStructure, 'involved' | 'passers' | 'catchers' | 'screeners' | 'cutters' | 'shooters' | 'drivers' | 'path' | 'onSlot' | 'offFrames'>[]; readonly involvement: readonly { involved: number; passers: number; catchers: number; offBallRunMeters: number[]; offBallSlotShare: number[] }[] }

export function runStructureGame(seed: number, maxTicks = 60000): StructureGame {
  const live = createMatchEnginePort('match-next').createLiveSession(preparedSetup(seed))
  const open = new Map<string, PossessionStructure>()
  const rows: StructureGame['rows'][number][] = []
  const involvement: StructureGame['involvement'][number][] = []
  const lastPos = new Map<string, { x: number; y: number }>()
  let seen = 0
  while (!live.matchState.isComplete && live.matchState.t < maxTicks) {
    live.advanceOneStep()
    const s = live.matchState
    const fresh: MatchNextEvent[] = s.events.slice(seen)
    seen = s.events.length
    const centerY = s.court.widthMeters / 2
    for (const e of fresh) {
      if (e.type === 'possessionStart' && e.possessionId !== undefined) open.set(e.possessionId, { id: e.possessionId, seconds: 0, reason: e.startReason ?? '?', secondChance: false, passes: [], involved: new Set(), passers: new Set(), catchers: new Set(), screeners: new Set(), cutters: new Set(), shooters: new Set(), drivers: new Set(), path: new Map(), onSlot: new Map(), offFrames: new Map(), closeouts: 0, rotations: 0, kindChanges: 0, ballMovingFrames: 0, ballFrames: 0, handlerPath: 0, screens: 0, screensUsed: 0 })
      const id = e.possessionId ?? s.activePossessionId ?? undefined
      const p = id === undefined ? undefined : open.get(id)
      if (p !== undefined) {
        if (e.type === 'reboundSecured' && e.reboundType === 'offensive') p.secondChance = true
        if (e.type === 'passReleased' && e.passerPlayerId !== undefined && e.receiverPlayerId !== undefined) {
          const a = s.players.find((x) => x.playerId === e.passerPlayerId)
          const b = s.players.find((x) => x.playerId === e.receiverPlayerId)
          const basket = s.offensiveStructure?.attackingBasket
          if (a !== undefined && b !== undefined) {
            const d = distanceBetween(a.position, b.position)
            p.passes.push({ distance: d, lateral: Math.abs(b.position.y - a.position.y), towardBasket: basket === undefined ? 0 : distanceBetween(a.position, basket) - distanceBetween(b.position, basket), crossedMiddle: (a.position.y - centerY) * (b.position.y - centerY) < 0 && Math.abs(b.position.y - a.position.y) > 3 })
          }
          p.passers.add(String(e.passerPlayerId)); p.involved.add(String(e.passerPlayerId)); p.involved.add(String(e.receiverPlayerId))
        }
        if (e.type === 'passReceived' && e.playerId !== undefined) p.catchers.add(String(e.playerId))
        if (e.type === 'screenSet') { p.screens += 1; if (e.playerId !== undefined) { p.screeners.add(String(e.playerId)); p.involved.add(String(e.playerId)) } }
        if (e.type === 'screenUsed') p.screensUsed += 1
        if (e.type === 'offBallMove' && (e.ballReason === 'BASKET_CUT' || e.ballReason === 'BACKDOOR_CUT') && e.playerId !== undefined) { p.cutters.add(String(e.playerId)); p.involved.add(String(e.playerId)) }
        if (e.type === 'shotReleased' && e.shooterPlayerId !== undefined) { p.shooters.add(String(e.shooterPlayerId)); p.involved.add(String(e.shooterPlayerId)) }
        if (e.type === 'actionStarted' && e.actionKind === 'DRIVE' && e.playerId !== undefined) { p.drivers.add(String(e.playerId)); p.involved.add(String(e.playerId)) }
        if (e.type === 'actionStarted' && e.actionKind === 'CLOSEOUT') p.closeouts += 1
        if (e.type === 'defensiveResponsibilityChanged') { p.kindChanges += 1; if (e.responsibilityKind === 'HELP' || e.responsibilityKind === 'LOW_MAN' || e.responsibilityKind === 'ROTATE' || e.responsibilityKind === 'X_OUT') p.rotations += 1 }
        if (e.type === 'possessionEnd') {
          p.seconds = (e.t - (p as unknown as { startT?: number }).startT!) / 10
        }
      }
      if (e.type === 'possessionStart' && e.possessionId !== undefined) (open.get(e.possessionId) as unknown as { startT: number }).startT = e.t
    }
    const id = s.activePossessionId
    const p = id === null ? undefined : open.get(id)
    const possession = s.possessions.find((x) => x.id === id)
    if (p !== undefined && possession !== undefined && (possession.phase === 'SETUP' || possession.phase === 'ACTION') && s.clock.gameRunning && s.ball.kind !== 'DEAD') {
      p.ballFrames += 1
      const holderId = s.ball.kind === 'HELD' ? String(s.ball.ownerPlayerId) : undefined
      for (const player of s.players) {
        if (!player.active || player.teamId !== possession.teamId) continue
        const pid = String(player.playerId)
        const prev = lastPos.get(pid)
        const step = prev === undefined ? 0 : distanceBetween(prev, player.position)
        p.path.set(pid, (p.path.get(pid) ?? 0) + step)
        if (pid === holderId) { p.handlerPath += step; if (Math.hypot(player.velocity.x, player.velocity.y) > 1) p.ballMovingFrames += 1 } else {
          p.offFrames.set(pid, (p.offFrames.get(pid) ?? 0) + 1)
          const assignment = s.offensiveStructure?.assignments.find((a) => a.playerId === player.playerId)
          const slot = assignment === undefined ? undefined : s.offensiveStructure?.slots.find((sl) => sl.slot === assignment.slot)
          if (slot !== undefined && distanceBetween(player.position, slot.position) <= 1.2) p.onSlot.set(pid, (p.onSlot.get(pid) ?? 0) + 1)
        }
      }
    }
    for (const player of s.players) lastPos.set(String(player.playerId), { ...player.position })
    for (const e of fresh) {
      if (e.type !== 'possessionEnd' || e.possessionId === undefined) continue
      const q = open.get(e.possessionId)
      if (q === undefined) continue
      open.delete(e.possessionId)
      if (q.ballFrames >= 60) {
        const { involved, passers, catchers, screeners, cutters, shooters, drivers, path, onSlot, offFrames, ...rest } = q
        rows.push(rest)
        const runs = [...offFrames.keys()].map((k) => path.get(k) ?? 0)
        const slotShare = [...offFrames.keys()].map((k) => (onSlot.get(k) ?? 0) / Math.max(1, offFrames.get(k)!))
        for (const k of cutters) involved.add(k)
        void screeners; void shooters; void drivers
        involvement.push({ involved: involved.size, passers: passers.size, catchers: catchers.size, offBallRunMeters: runs, offBallSlotShare: slotShare })
      }
    }
  }
  return { seed, rows, involvement }
}

export function summarizeStructure(games: readonly StructureGame[]): Record<string, unknown> {
  const rows = games.flatMap((g) => g.rows)
  const inv = games.flatMap((g) => g.involvement)
  const passes = rows.flatMap((r) => r.passes)
  const n = rows.length
  const mean = (v: readonly number[]): number => Number((v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)).toFixed(2))
  const share = (test: (r: (typeof rows)[number]) => boolean): number => Number((rows.filter(test).length / Math.max(1, n)).toFixed(3))
  return {
    halfCourtPossessions: n, perGame: Number((n / games.length).toFixed(1)),
    passes: {
      perPossession: quantiles(rows.map((r) => r.passes.length)), lengthMeters: quantiles(passes.map((p) => p.distance)), shareShorterThan4m: Number((passes.filter((p) => p.distance < 4).length / Math.max(1, passes.length)).toFixed(3)),
      shareLongerThan10m: Number((passes.filter((p) => p.distance > 10).length / Math.max(1, passes.length)).toFixed(3)), towardBasketMeters: quantiles(passes.map((p) => p.towardBasket)), lateralMeters: quantiles(passes.map((p) => p.lateral)),
      sideSwitchesPerPossession: Number((passes.filter((p) => p.crossedMiddle).length / Math.max(1, n)).toFixed(2)),
      possessionsWithASideSwitch: share((r) => r.passes.some((p) => p.crossedMiddle)), possessionsWithNoPass: share((r) => r.passes.length === 0),
    },
    handler: { metersCarriedPerPossession: quantiles(rows.map((r) => r.handlerPath)), shareOfBallTimeMoving: Number((rows.reduce((a, r) => a + r.ballMovingFrames, 0) / Math.max(1, rows.reduce((a, r) => a + r.ballFrames, 0))).toFixed(3)) },
    involvement: {
      playersInvolvedPerPossession: quantiles(inv.map((i) => i.involved)), playersWhoPassedPerPossession: quantiles(inv.map((i) => i.passers)), playersWhoCaughtPerPossession: quantiles(inv.map((i) => i.catchers)),
      offBallRunMetersPerPlayerPossession: quantiles(inv.flatMap((i) => i.offBallRunMeters)), offBallRunMetersPerMinute: Number((inv.flatMap((i) => i.offBallRunMeters).reduce((a, b) => a + b, 0) / Math.max(1, rows.reduce((a, r) => a + r.ballFrames, 0) / 10 / 60) / 4).toFixed(1)),
      offBallShareOfTimeStandingOnTheSlot: quantiles(inv.flatMap((i) => i.offBallSlotShare)),
      possessionsWhereAnOffBallPlayerRanUnder3m: Number((inv.filter((i) => i.offBallRunMeters.some((m) => m < 3)).length / Math.max(1, inv.length)).toFixed(3)),
    },
    screens: { perPossession: mean(rows.map((r) => r.screens)), usedShare: Number((rows.reduce((a, r) => a + r.screensUsed, 0) / Math.max(1, rows.reduce((a, r) => a + r.screens, 0))).toFixed(3)) },
    defense: { closeoutsPerPossession: mean(rows.map((r) => r.closeouts)), rotationsPerPossession: mean(rows.map((r) => r.rotations)), responsibilityChangesPerPossession: mean(rows.map((r) => r.kindChanges)) },
    possessionSeconds: quantiles(rows.map((r) => r.seconds)),
  }
}
