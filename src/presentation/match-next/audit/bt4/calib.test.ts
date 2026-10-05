import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { withTuning, type MatchNextTuning } from '@/engine/match-next/tuning'
import { runBt3Game, type Bt3Game } from '../bt3/economy3'

/**
 * Calibration / sensitivity harness: each named configuration is a set of tuning overrides; every one is played over the same seeds.
 * BT2_AUDIT=1 BT4_TAG=x BT4_SEEDS=4 BT4_CONFIGS='{"a":{},"b":{"continuationValuePoints":1.15}}' npx vitest run .../calib.test.ts
 */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT4 calibration', () => {
  const seeds = [424242, 7, 1, 99, 2024, 31337, 11, 12].slice(0, Number(process.env.BT4_SEEDS ?? 4))
  const configs = JSON.parse(process.env.BT4_CONFIGS ?? '{"current":{}}') as Record<string, Partial<MatchNextTuning>>
  const result: Record<string, unknown> = {}
  for (const [name, overrides] of Object.entries(configs)) {
    const games = seeds.map((seed) => withTuning(overrides, () => runBt3Game(seed, { maxTicks: 60000 })))
    const mean = (f: (g: Bt3Game) => number): number => Number((games.reduce((a, g) => a + f(g), 0) / games.length).toFixed(3))
    result[name] = {
      overrides, points: mean((g) => g.points), possessions: mean((g) => g.possessions), possessionSeconds: mean((g) => g.meanPossessionSeconds), fga: mean((g) => g.fga), fgPct: mean((g) => g.fgMade / g.fga),
      threeShare: mean((g) => g.threeShare), rimShare: mean((g) => g.rimShare), paintShare: mean((g) => g.paintShare), midShare: mean((g) => g.midShare),
      fta: mean((g) => g.fta), ftaPerFga: mean((g) => g.fta / g.fga), fouls: mean((g) => g.fouls), bonusFouls: mean((g) => g.bonusFouls), turnovers: mean((g) => g.turnovers), steals: mean((g) => g.steals), blocks: mean((g) => g.blocks),
      orebShare: mean((g) => g.oreb / Math.max(1, g.oreb + g.dreb)), assists: mean((g) => g.assists), drives: mean((g) => g.drives), screens: mean((g) => g.screens), passes: mean((g) => g.passes), ppp: mean((g) => g.points / Math.max(1, g.possessions)),
      pointsPerFga: mean((g) => g.points / g.fga), completed: mean((g) => (g.complete ? 1 : 0)),
    }
  }
  mkdirSync('docs/match-next-bt4/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4/audit/calib-${process.env.BT4_TAG ?? 'run'}.json`, JSON.stringify({ seeds, result }, null, 2))
}, 6_000_000)
