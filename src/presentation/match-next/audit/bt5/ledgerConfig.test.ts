import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { runPassGame, summarizePasses } from '../bt45/passLedger'
import { CONFIGS } from './configs'
import { withTuning, type MatchNextTuning } from '@/engine/match-next/tuning'

/** BT2_AUDIT=1 BT5_CONFIG=coachA BT5_SEEDS=31337,424242 npx vitest run .../bt5/ledgerConfig.test.ts -> docs/match-next-bt5/audit/ledger-<config>-<tag>.json (pass ledger of a BT5 configuration) */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT5 pass ledger of a configuration', () => {
  const name = process.env.BT5_CONFIG ?? 'neutral'
  const seeds = (process.env.BT5_SEEDS ?? '31337,424242').split(',').map(Number)
  const overrides = JSON.parse(process.env.BT5_TUNING ?? '{}') as Partial<MatchNextTuning>
  const games = seeds.map((seed) => withTuning(overrides, () => runPassGame(seed, 60000, CONFIGS[name]!.transform)))
  mkdirSync('docs/match-next-bt5/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt5/audit/ledger-${name}-${process.env.BT5_TAG ?? 'run'}.json`, JSON.stringify({ seeds, summary: summarizePasses(games) }, null, 2))
}, 6_000_000)
