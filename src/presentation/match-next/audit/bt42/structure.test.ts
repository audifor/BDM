import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { runStructureGame, summarizeStructure } from './structure'

/** BT2_AUDIT=1 BT42_SEEDS=31337,424242,7 npx vitest run .../structure.test.ts -> docs/match-next-bt4-2/audit/structure-<tag>.json */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT4.2 possession structure analysis', () => {
  const seeds = (process.env.BT42_SEEDS ?? '31337,424242,7').split(',').map(Number)
  const games = seeds.map((seed) => runStructureGame(seed))
  mkdirSync('docs/match-next-bt4-2/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4-2/audit/structure-${process.env.BT42_TAG ?? 'run'}.json`, JSON.stringify({ seeds, summary: summarizeStructure(games) }, null, 2))
}, 6_000_000)
