import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { findNextScenarios } from '../scenarios'
import { runNextAudit } from '../nextAudit'

/** Writes docs/match-next-bt2/audit/scenarios.json (reproducible seed + tick windows, found from the real event stream). */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT2 scenarios', () => {
  const seeds = (process.env.BT2_SCENARIO_SEEDS ?? '424242,7,1,99').split(',').map(Number)
  const scenarios = findNextScenarios(seeds, (seed) => runNextAudit(seed, { maxTicks: 16000 }))
  mkdirSync('docs/match-next-bt2/audit', { recursive: true })
  writeFileSync('docs/match-next-bt2/audit/scenarios.json', JSON.stringify(scenarios, null, 2))
}, 3_000_000)
