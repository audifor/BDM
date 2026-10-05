import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { withTuning, type MatchNextTuning } from '@/engine/match-next/tuning'
import { runLedgerGame, summarizeLedger } from './ledger'

/** BT2_AUDIT=1 BT44_TAG=x BT44_SEEDS=31337,424242,7 [BT44_TUNING='{"earlyOffenseRadiusMeters":0}'] npx vitest run .../ledger.test.ts -> docs/match-next-bt4-4/audit/ledger-<tag>.json (+ rows) */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT4.4 possession ledger', () => {
  const seeds = (process.env.BT44_SEEDS ?? '31337,424242,7').split(',').map(Number)
  const overrides = JSON.parse(process.env.BT44_TUNING ?? '{}') as Partial<MatchNextTuning>
  const tag = process.env.BT44_TAG ?? 'run'
  const games = seeds.map((seed) => withTuning(overrides, () => runLedgerGame(seed)))
  mkdirSync('docs/match-next-bt4-4/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4-4/audit/ledger-${tag}.json`, JSON.stringify({ seeds, overrides, summary: summarizeLedger(games) }, null, 2))
  writeFileSync(`docs/match-next-bt4-4/audit/ledger-rows-${tag}.json`, JSON.stringify(games.map((g) => ({ seed: g.seed, rows: g.rows }))))
}, 6_000_000)
