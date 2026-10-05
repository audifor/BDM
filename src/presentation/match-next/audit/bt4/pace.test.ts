import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { runPaceGame, summarizePace } from './pace'

/** BT2_AUDIT=1 BT4_TAG=bt3 BT4_SEEDS=6 npx vitest run .../pace.test.ts -> docs/match-next-bt4/audit/pace-<tag>.json */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT4A pace accounting', () => {
  const tag = process.env.BT4_TAG ?? 'run'
  const seeds = [424242, 7, 1, 99, 2024, 31337, 11, 12, 13, 14, 15, 16].slice(0, Number(process.env.BT4_SEEDS ?? 6))
  const games = seeds.map((seed) => runPaceGame(seed))
  mkdirSync('docs/match-next-bt4/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4/audit/pace-${tag}.json`, JSON.stringify({ tag, seeds, summary: summarizePace(games) }, null, 2))
}, 6_000_000)
