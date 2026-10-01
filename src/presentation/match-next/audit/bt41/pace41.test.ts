import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { withTuning, type MatchNextTuning } from '@/engine/match-next/tuning'
import { runGame41, summarize41 } from './pace41'

/** BT2_AUDIT=1 BT41_TAG=bt4 BT41_SEEDS=8 npx vitest run .../pace41.test.ts -> docs/match-next-bt4-1/audit/pace41-<tag>.json */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT4.1 pace audit', () => {
  const tag = process.env.BT41_TAG ?? 'run'
  const seeds = [424242, 7, 1, 99, 2024, 31337, 11, 12, 13, 14, 15, 16].slice(0, Number(process.env.BT41_SEEDS ?? 6))
  const overrides = JSON.parse(process.env.BT41_TUNING ?? '{}') as Partial<MatchNextTuning>
  const games = seeds.map((seed) => withTuning(overrides, () => runGame41(seed)))
  mkdirSync('docs/match-next-bt4-1/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4-1/audit/pace41-${tag}.json`, JSON.stringify({ tag, seeds, overrides, summary: summarize41(games), perGame: games.map((g) => ({ seed: g.seed, complete: g.complete, possessions: g.possessions.length, ...g.counts })) }, null, 2))
}, 6_000_000)
