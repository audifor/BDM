import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { withTuning, type MatchNextTuning } from '@/engine/match-next/tuning'
import { runPassGame, summarizePasses } from './passLedger'
import { CONFIGS } from '../bt5/configs'
import { BT6_CONFIGS } from '../bt6/configs'

/** BT2_AUDIT=1 BT45_TAG=x BT45_SEEDS=31337,424242,7 [BT45_TUNING='{...}'] npx vitest run .../passLedger.test.ts -> docs/match-next-bt4-5/audit/pass-<tag>.json (+ rows of the first seed) */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT4.5 pass ledger', () => {
  const seeds = (process.env.BT45_SEEDS ?? '31337,424242,7').split(',').map(Number)
  const overrides = JSON.parse(process.env.BT45_TUNING ?? '{}') as Partial<MatchNextTuning>
  const tag = process.env.BT45_TAG ?? 'run'
  const config = process.env.BT45_CONFIG === undefined ? undefined : BT6_CONFIGS[process.env.BT45_CONFIG] ?? CONFIGS[process.env.BT45_CONFIG]
  const games = seeds.map((seed) => withTuning(overrides, () => runPassGame(seed, 60000, config?.transform)))
  mkdirSync('docs/match-next-bt4-5/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4-5/audit/pass-${tag}.json`, JSON.stringify({ seeds, overrides, summary: summarizePasses(games) }, null, 2))
  if (process.env.BT45_ROWS !== undefined) writeFileSync(`docs/match-next-bt4-5/audit/pass-rows-${tag}.json`, JSON.stringify(games.map((g) => ({ seed: g.seed, passes: g.passes, steals: g.steals, turnovers: g.turnovers }))))
}, 6_000_000)
