import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { distanceBetween } from '@/domain/court'
import { withTuning, type MatchNextTuning } from '@/engine/match-next/tuning'
import { runNextAudit } from '../nextAudit'

/**
 * BT4.1: "the point guard goes coast to coast and the defense lets him". A carry is the time one player has the ball in his hands
 * without passing. For long carries (>= 15 m of path): how many per game, how close the nearest defender was while he went, how many
 * end in a shot, and whether any defender was between him and the rim within 2 m at some point.
 * BT2_AUDIT=1 BT41_TAG=x npx vitest run .../coastToCoast.test.ts -> docs/match-next-bt4-1/audit/coast-<tag>.json
 */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT4.1 coast to coast', () => {
  const seeds = [424242, 7, 1].slice(0, Number(process.env.BT41_SEEDS ?? 3))
  const overrides = JSON.parse(process.env.BT41_TUNING ?? '{}') as Partial<MatchNextTuning>
  interface Carry { owner: string; path: number; nearest: number[]; stopped: boolean; start: { x: number; y: number }; last: { x: number; y: number }; shot: boolean; contested: boolean }
  const carries: Carry[] = []
  withTuning(overrides, () => {
    for (const seed of seeds) {
      let open: Carry | undefined
      runNextAudit(seed, { maxTicks: 30000, onFrame: (f) => {
        const owner = f.ball.kind === 'HELD' ? String(f.ball.ownerPlayerId) : undefined
        if (open !== undefined && (owner !== open.owner)) {
          open.shot = f.ball.kind === 'SHOT_IN_FLIGHT'
          carries.push(open)
          open = undefined
        }
        if (owner === undefined) return
        const holder = f.players.find((p) => String(p.playerId) === owner)
        if (holder === undefined) return
        const defenders = f.players.filter((p) => p.teamId !== holder.teamId)
        const nearest = Math.min(...defenders.map((d) => distanceBetween(d.position, holder.position)))
        if (open === undefined) open = { owner, path: 0, nearest: [], stopped: false, start: { ...holder.position }, last: { ...holder.position }, shot: false, contested: false }
        open.path += distanceBetween(open.last, holder.position)
        open.last = { ...holder.position }
        open.nearest.push(nearest)
      } })
    }
  })
  const long = carries.filter((c) => c.path >= 15)
  const mean = (values: readonly number[]): number => Number((values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)).toFixed(2))
  const second = (c: Carry): number[] => c.nearest.slice(Math.floor(c.nearest.length / 2))
  const summary = {
    games: seeds.length, carries: carries.length, longCarriesPerGame: Number((long.length / seeds.length).toFixed(1)),
    longCarryMeanPath: mean(long.map((c) => c.path)), longCarryEndedInShot: Number((long.filter((c) => c.shot).length / Math.max(1, long.length)).toFixed(2)),
    nearestDefenderSecondHalfMean: mean(long.flatMap(second)), shareOfLongCarryFramesDefenderBeyond2_5m: Number((long.flatMap(second).filter((d) => d > 2.5).length / Math.max(1, long.flatMap(second).length)).toFixed(2)),
    longCarriesBeyond25m: Number((long.filter((c) => c.path >= 25).length / seeds.length).toFixed(1)),
  }
  mkdirSync('docs/match-next-bt4-1/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4-1/audit/coast-${process.env.BT41_TAG ?? 'run'}.json`, JSON.stringify(summary, null, 2))
}, 900_000)
