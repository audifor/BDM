import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { withTuning, type MatchNextTuning } from '@/engine/match-next/tuning'
import { runPassGame, summarizePasses } from './passLedger'

/**
 * Cohort experiment: every player of the game gets the same level of one skill, nothing else changes.
 * BT2_AUDIT=1 BT45_COHORT=passer|defender BT45_LEVELS=30,55,80 BT45_SEEDS=4 npx vitest run .../cohorts.test.ts -> docs/match-next-bt4-5/audit/cohort-<cohort>-<tag>.json
 * passer: accuracy, vision and timing = level. defender: steal = level (and mobility = level for the "reaction" cohort).
 */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT4.5 cohorts', () => {
  const cohort = process.env.BT45_COHORT ?? 'passer'
  const levels = (process.env.BT45_LEVELS ?? '30,55,80').split(',').map(Number)
  const seeds = [31337, 424242, 7, 1, 99, 2024, 11, 12].slice(0, Number(process.env.BT45_SEEDS ?? 4))
  const overrides = JSON.parse(process.env.BT45_TUNING ?? '{}') as Partial<MatchNextTuning>
  const out: Record<string, unknown> = {}
  for (const level of levels) {
    const games = seeds.map((seed) => withTuning(overrides, () => runPassGame(seed, 60000, (setup) => ({
      ...setup,
      players: setup.players.map((player) => cohort === 'passer'
        ? { ...player, passing: { accuracy: level, vision: level, timing: level } }
        : { ...player, defense: { ...player.defense, steal: level } }),
    }))))
    const summary = summarizePasses(games) as Record<string, any>
    out[String(level)] = { totals: summary.totals, overall: summary.overall, turnoverTaxonomy: summary.turnoverTaxonomy, stealKinds: summary.stealKinds, selection: summary.selection, perceived: summary.perceivedByPerp, byThreats: summary.byThreats, byType: summary.byType, bySlack: summary.bySlack, passerLane: { meanDistance: summary.byDistance } }
  }
  mkdirSync('docs/match-next-bt4-5/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4-5/audit/cohort-${cohort}-${process.env.BT45_TAG ?? 'run'}.json`, JSON.stringify({ seeds, levels, out }, null, 2))
}, 6_000_000)
