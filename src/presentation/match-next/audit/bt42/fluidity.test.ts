import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { withTuning, type MatchNextTuning } from '@/engine/match-next/tuning'
import { runFluidityGame, summarizeFluidity } from './fluidity'

/** BT2_AUDIT=1 BT42_SEEDS=31337,424242,7 npx vitest run .../fluidity.test.ts -> docs/match-next-bt4-2/audit/fluidity-<tag>.json */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT4.2 fluidity analysis', () => {
  const seeds = (process.env.BT42_SEEDS ?? '31337,424242,7').split(',').map(Number)
  const overrides = JSON.parse(process.env.BT42_TUNING ?? '{}') as Partial<MatchNextTuning>
  const games = seeds.map((seed) => withTuning(overrides, () => runFluidityGame(seed)))
  mkdirSync('docs/match-next-bt4-2/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4-2/audit/fluidity-${process.env.BT42_TAG ?? 'run'}.json`, JSON.stringify({ seeds, summary: summarizeFluidity(games) }, null, 2))
}, 6_000_000)
