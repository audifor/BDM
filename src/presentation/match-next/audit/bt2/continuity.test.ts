import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { auditContinuity } from './continuity'

/** Writes docs/match-next-bt2/audit/continuity-<tag>.json. Run: BT2_AUDIT=1 BT2_TAG=after BT2_TICKS=30000 npx vitest run .../continuity.test.ts */
it.skipIf(process.env.BT2_AUDIT === undefined)('ball continuity', () => {
  const tag = process.env.BT2_TAG ?? 'after'
  const ticks = Number(process.env.BT2_TICKS ?? 30000)
  const reports = [424242, 7].map((seed) => auditContinuity(seed, ticks))
  mkdirSync('docs/match-next-bt2/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt2/audit/continuity-${tag}.json`, JSON.stringify(reports, null, 2))
}, 3_000_000)
