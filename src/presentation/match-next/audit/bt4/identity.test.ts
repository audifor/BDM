import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import type { MatchSetup } from '@/engine/match-next'
import { preparedSetup } from '../bt2/economy'
import { measure } from './metrics'

/**
 * BT4K-Q identity cohorts. One attribute family of every player of the HOME squad is fixed at 25 / 50 / 85 (the away team and every
 * other attribute untouched), the same seeds are played at each level, and what the home team does and what it allows is measured
 * from the event stream. A cohort that does not change behaviour, not only results, fails.
 * BT2_AUDIT=1 BT4_TAG=x BT4_SEEDS=5 BT4_COHORTS=shooter,handler npx vitest run .../identity.test.ts
 */
type Cohort = 'shooter' | 'handler' | 'passer' | 'finisher' | 'protector' | 'rebounder'

function withCohort(setup: MatchSetup, cohort: Cohort, value: number): MatchSetup {
  return {
    ...setup,
    players: setup.players.map((player) => {
      if (player.teamId !== setup.homeTeamId) return player
      switch (cohort) {
        case 'shooter': return { ...player, offense: { ...player.offense, shooting: value } }
        case 'handler': return { ...player, offense: { ...player.offense, creation: value, ballSecurity: value } }
        case 'passer': return { ...player, passing: { accuracy: value, vision: value, timing: value } }
        case 'finisher': return { ...player, offense: { ...player.offense, rimAttack: value } }
        case 'protector': return { ...player, defense: { ...player.defense, interior: value, mobility: value } }
        case 'rebounder': return { ...player, rebounding: { ...player.rebounding, impact: value } }
      }
    }),
  }
}

it.skipIf(process.env.BT2_AUDIT === undefined)('BT4K-Q identity cohorts', () => {
  const seeds = [424242, 7, 1, 99, 2024, 31337, 11, 12].slice(0, Number(process.env.BT4_SEEDS ?? 5))
  const cohorts = (process.env.BT4_COHORTS ?? 'shooter,handler,passer,finisher,protector,rebounder').split(',') as Cohort[]
  const levels = (process.env.BT4_LEVELS ?? '25,50,85').split(',').map(Number)
  const out: Record<string, Record<string, Record<string, number>>> = {}
  for (const cohort of cohorts) {
    out[cohort] = {}
    for (const level of levels) {
      const totals: Record<string, number> = {}
      for (const seed of seeds) {
        const setup = withCohort(preparedSetup(seed), cohort, level)
        const live = createMatchEnginePort('match-next').createLiveSession(setup)
        while (!live.matchState.isComplete && live.matchState.t < 60000) live.advanceTicks(3)
        for (const [key, value] of Object.entries(measure(setup, live.matchState.events))) totals[key] = (totals[key] ?? 0) + value / seeds.length
      }
      out[cohort]![String(level)] = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Number(v.toFixed(3))]))
    }
  }
  mkdirSync('docs/match-next-bt4/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4/audit/identity-${process.env.BT4_TAG ?? 'run'}.json`, JSON.stringify({ seeds, levels, out }, null, 2))
}, 12_000_000)
