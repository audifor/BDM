import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { shotMakeProbability } from '@/engine/match-next/actions/DecisionCore'

/**
 * BT3P: why is the mid-range share small? Prints the expected value of a shot by distance, rating and contest. It does not
 * change anything: the point is to show where the EV gap comes from (the make-probability curve), so a fix (pull-ups off the
 * dribble, tendencies with real weight, drive stops) can be argued instead of forcing a share.
 */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT3P midrange EV table', () => {
  const rows: Record<string, unknown>[] = []
  for (const shooting of [40, 60, 80]) for (const contest of [0, 0.3, 0.6]) for (const distance of [1.2, 2.5, 4, 5.5, 6.3, 6.9, 7.6]) {
    const points = distance >= 6.6 ? 3 : 2
    const probability = shotMakeProbability(shooting, distance, points as 2 | 3, contest)
    rows.push({ shooting, contest, distance, points, probability: Number(probability.toFixed(3)), expectedPoints: Number((probability * points).toFixed(3)) })
  }
  mkdirSync('docs/match-next-bt3/audit', { recursive: true })
  writeFileSync('docs/match-next-bt3/audit/midrange-ev.json', JSON.stringify({ rows }, null, 2))
})
