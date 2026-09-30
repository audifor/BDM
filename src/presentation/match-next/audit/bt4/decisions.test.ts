import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { preparedSetup } from '../bt2/economy'

/**
 * BT4A: what do the offensive decisions look like? Mean utility of every option at every decision, the share of each chosen kind,
 * and decisions per possession. Runs on any engine that emits `decisionSelected` with `utility` (BT2 and later).
 * BT2_AUDIT=1 BT4_TAG=bt3 npx vitest run .../decisions.test.ts
 */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT4A decisions', () => {
  const seeds = [424242, 7, 1].slice(0, Number(process.env.BT4_SEEDS ?? 3))
  const sums: Record<string, number> = { shoot: 0, drive: 0, pass: 0, hold: 0, screen: 0, screenN: 0 }
  const chosen: Record<string, number> = {}
  const chosenUtility: Record<string, { n: number; shoot: number; drive: number; pass: number; hold: number }> = {}
  let decisions = 0
  let possessions = 0
  for (const seed of seeds) {
    const live = createMatchEnginePort('match-next').createLiveSession(preparedSetup(seed))
    while (!live.matchState.isComplete && live.matchState.t < 60000) live.advanceTicks(3)
    const events = live.matchState.events
    possessions += events.filter((e) => e.type === 'possessionStart').length
    for (const e of events) {
      if (e.type !== 'decisionSelected' || e.utility === undefined) continue
      decisions += 1
      sums.shoot += e.utility.shoot; sums.drive += e.utility.drive; sums.pass += e.utility.pass; sums.hold += e.utility.hold
      if (e.utility.screen !== undefined) { sums.screen += e.utility.screen; sums.screenN += 1 }
      const kind = e.decisionKind ?? '?'
      chosen[kind] = (chosen[kind] ?? 0) + 1
      const u = (chosenUtility[kind] ??= { n: 0, shoot: 0, drive: 0, pass: 0, hold: 0 })
      u.n += 1; u.shoot += e.utility.shoot; u.drive += e.utility.drive; u.pass += e.utility.pass; u.hold += e.utility.hold
    }
  }
  const r = (v: number): number => Number(v.toFixed(3))
  const out = {
    seeds, decisions, decisionsPerPossession: r(decisions / possessions),
    meanUtility: { shoot: r(sums.shoot / decisions), drive: r(sums.drive / decisions), pass: r(sums.pass / decisions), hold: r(sums.hold / decisions), screen: r(sums.screen / Math.max(1, sums.screenN)) },
    chosenShare: Object.fromEntries(Object.entries(chosen).map(([k, v]) => [k, r(v / decisions)])),
    utilityWhenChosen: Object.fromEntries(Object.entries(chosenUtility).map(([k, u]) => [k, { n: u.n, shoot: r(u.shoot / u.n), drive: r(u.drive / u.n), pass: r(u.pass / u.n), hold: r(u.hold / u.n) }])),
  }
  mkdirSync('docs/match-next-bt4/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4/audit/decisions-${process.env.BT4_TAG ?? 'run'}.json`, JSON.stringify(out, null, 2))
}, 3_000_000)
