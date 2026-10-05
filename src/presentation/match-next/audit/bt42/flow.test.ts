import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { withTuning, type MatchNextTuning } from '@/engine/match-next/tuning'
import { preparedSetup } from '../bt2/economy'
import { runFlowGame, summarizeFlow } from './flow'

/** BT2_AUDIT=1 BT42_TAG=x BT42_SEEDS=8 [BT42_TUNING='{}'] npx vitest run .../flow.test.ts -> docs/match-next-bt4-2/audit/flow-<tag>.json */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT4.2 offensive flow audit', () => {
  const tag = process.env.BT42_TAG ?? 'run'
  const seeds = [424242, 7, 1, 99, 2024, 31337, 11, 12, 13, 14, 15, 16].slice(0, Number(process.env.BT42_SEEDS ?? 6))
  const overrides = JSON.parse(process.env.BT42_TUNING ?? '{}') as Partial<MatchNextTuning>
  const ratings = new Map<number, Map<string, Record<string, number>>>()
  const games = withTuning(overrides, () => seeds.map((seed) => {
    const setup = preparedSetup(seed)
    ratings.set(seed, new Map(setup.players.map((p) => [String(p.playerId), { usage: p.offense.usage, shooting: p.offense.shooting, creation: p.offense.creation, vision: p.passing?.vision ?? 50 }])))
    return runFlowGame(seed)
  }))
  mkdirSync('docs/match-next-bt4-2/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4-2/audit/flow-${tag}.json`, JSON.stringify({ tag, seeds, overrides, summary: summarizeFlow(games, ratings) }, null, 2))
}, 6_000_000)
