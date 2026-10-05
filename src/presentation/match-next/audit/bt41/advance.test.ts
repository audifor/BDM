import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { withTuning, type MatchNextTuning } from '@/engine/match-next/tuning'
import { preparedSetup } from '../bt2/economy'
import { quantiles } from '../bt4/pace'

/**
 * BT4.1: how long does a team take to bring the ball into its frontcourt, and how many 8-second violations are there? The backcourt
 * clock itself (state.backcourtControl) is read, so this is the rule's own measure.
 * BT2_AUDIT=1 BT41_TAG=x BT41_SEEDS=3 npx vitest run .../advance.test.ts -> docs/match-next-bt4-1/audit/advance-<tag>.json
 */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT4.1 ball advance', () => {
  const seeds = [424242, 7, 1, 99, 2024, 31337].slice(0, Number(process.env.BT41_SEEDS ?? 3))
  const overrides = JSON.parse(process.env.BT41_TUNING ?? '{}') as Partial<MatchNextTuning>
  const crossing: { reason: string; seconds: number }[] = []
  let violations = 0
  let possessions = 0
  const byReason: Record<string, number> = {}
  withTuning(overrides, () => {
    for (const seed of seeds) {
      const live = createMatchEnginePort('match-next').createLiveSession(preparedSetup(seed))
      const reasonOf = new Map<string, string>()
      const done = new Set<string>()
      while (!live.matchState.isComplete && live.matchState.t < 60000) {
        live.advanceOneStep()
        const s = live.matchState
        for (let index = s.events.length - 1; index >= 0 && s.events[index]!.t === s.t; index -= 1) {
          const e = s.events[index]!
          if (e.type === 'possessionStart' && e.possessionId !== undefined) { reasonOf.set(e.possessionId, e.startReason ?? '?'); possessions += 1 }
          if (e.type === 'turnover' && e.turnoverType === 'EIGHT_SECOND') { violations += 1; const r = reasonOf.get(String(e.possessionId)) ?? '?'; byReason[r] = (byReason[r] ?? 0) + 1 }
        }
        const control = s.backcourtControl
        if (control != null && control.done && !done.has(control.possessionId)) {
          done.add(control.possessionId)
          crossing.push({ reason: reasonOf.get(control.possessionId) ?? '?', seconds: control.ticks / 10 })
        }
      }
    }
  })
  const reasons = [...new Set(crossing.map((c) => c.reason))]
  const summary = {
    games: seeds.length, possessionsPerGame: Number((possessions / seeds.length).toFixed(1)), violationsPerGame: Number((violations / seeds.length).toFixed(2)),
    violationShareOfPossessions: Number((violations / Math.max(1, possessions)).toFixed(3)), violationsByStartReason: byReason,
    controlSecondsUntilFrontcourt: quantiles(crossing.map((c) => c.seconds)),
    byStartReason: Object.fromEntries(reasons.map((r) => [r, quantiles(crossing.filter((c) => c.reason === r).map((c) => c.seconds))])),
  }
  mkdirSync('docs/match-next-bt4-1/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4-1/audit/advance-${process.env.BT41_TAG ?? 'run'}.json`, JSON.stringify(summary, null, 2))
}, 900_000)
