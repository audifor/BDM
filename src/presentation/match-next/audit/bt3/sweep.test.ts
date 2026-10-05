import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { withTuning, type MatchNextTuning } from '@/engine/match-next/tuning'
import { runGame, summarizeGame } from '../bt2/economy'

/**
 * BT3A robustness sweep. Plays whole games with one tuning parameter moved around its current value and writes how the
 * shot mix and the action rates respond. Run:
 *   BT2_AUDIT=1 BT3_PARAM=closeoutEfficiency BT3_VALUES=0.3,0.35,0.4,0.45,0.5 BT3_SEEDS=3 BT3_TAG=before npx vitest run .../sweep.test.ts
 */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT3A sweep', () => {
  const param = (process.env.BT3_PARAM ?? 'closeoutReactionTicks') as keyof MatchNextTuning
  const values = (process.env.BT3_VALUES ?? '0.4').split(',').map(Number)
  const seedCount = Number(process.env.BT3_SEEDS ?? 3)
  const tag = process.env.BT3_TAG ?? 'sweep'
  const seeds = [424242, 7, 1, 99, 2024, 31337, 11, 12].slice(0, seedCount)
  const rows = values.map((value) => {
    const games = seeds.map((seed) => withTuning({ [param]: value } as Partial<MatchNextTuning>, () => runGame(seed)))
    const mean = (f: (g: (typeof games)[number]) => number): number => Number((games.reduce((a, g) => a + f(g), 0) / games.length).toFixed(3))
    const share = (g: (typeof games)[number], lo: number, hi: number): number => g.economy.shotRecords.filter((s) => s.distance >= lo && s.distance < hi).length / Math.max(1, g.economy.shotRecords.length)
    return {
      value,
      points: mean((g) => summarizeGame(g.economy).points), shots: mean((g) => summarizeGame(g.economy).shots), possessions: mean((g) => g.economy.possessions.length),
      threeShare: mean((g) => g.economy.threes / Math.max(1, g.economy.shots)), rimShare: mean((g) => share(g, 0, 2.2)), paintShare: mean((g) => share(g, 2.2, 4.5)), midShare: mean((g) => share(g, 4.5, 6.5)),
      screens: mean((g) => g.economy.possessions.reduce((a, p) => a + p.screens, 0)), drives: mean((g) => g.economy.possessions.reduce((a, p) => a + p.drives, 0)),
      passes: mean((g) => g.economy.possessions.reduce((a, p) => a + p.passes, 0)),
      orebShare: mean((g) => g.economy.offensiveRebounds / Math.max(1, g.economy.rebounds)), turnovers: mean((g) => g.economy.turnovers), fg: mean((g) => g.economy.made / Math.max(1, g.economy.shots)),
    }
  })
  mkdirSync('docs/match-next-bt3/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt3/audit/sweep-${tag}-${String(param)}.json`, JSON.stringify({ param, seeds, rows }, null, 2))
}, 6_000_000)
