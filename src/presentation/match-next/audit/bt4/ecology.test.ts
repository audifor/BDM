import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { SHOT_CREATIONS, SHOT_ZONES } from '@/engine/match-next/stats/ShotEcology'
import { preparedSetup } from '../bt2/economy'
import { ecologyTables, shotRows, summarizeRows } from './ecology'

/** BT2_AUDIT=1 BT4_TAG=bt3 BT4_SEEDS=6 npx vitest run .../ecology.test.ts -> docs/match-next-bt4/audit/ecology-<tag>.json */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT4E/F/J shot ecology', () => {
  const seeds = [424242, 7, 1, 99, 2024, 31337, 11, 12, 13, 14, 15, 16].slice(0, Number(process.env.BT4_SEEDS ?? 6))
  const rows = seeds.flatMap((seed) => {
    const live = createMatchEnginePort('match-next').createLiveSession(preparedSetup(seed))
    while (!live.matchState.isComplete && live.matchState.t < 60000) live.advanceTicks(3)
    return [...shotRows(live.matchState.events)]
  })
  const tables = ecologyTables(rows, SHOT_ZONES, SHOT_CREATIONS)
  mkdirSync('docs/match-next-bt4/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4/audit/ecology-${process.env.BT4_TAG ?? 'run'}.json`, JSON.stringify({ seeds, shotsPerGame: rows.length / seeds.length, overall: summarizeRows(rows), ...tables }, null, 2))
}, 6_000_000)
