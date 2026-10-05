import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import type { MatchSetup } from '@/engine/match-next'
import { preparedSetup } from '../bt2/economy'
import { measure } from './metrics'

/**
 * BT4V team-level emergence. The HOME roster is given a different identity (same tactical plan for everybody, same opponent, same
 * seeds) and the profile of the game is compared with the untouched roster. If every roster played the same game, player identity
 * would be decoration.
 * BT2_AUDIT=1 BT4_TAG=x BT4_SEEDS=5 npx vitest run .../teams.test.ts
 */
type Roster = 'baseline' | 'shooting' | 'rim' | 'playmaking' | 'defensive' | 'rebounding'

function withRoster(setup: MatchSetup, roster: Roster): MatchSetup {
  if (roster === 'baseline') return setup
  return {
    ...setup,
    players: setup.players.map((player) => {
      if (player.teamId !== setup.homeTeamId) return player
      switch (roster) {
        case 'shooting': return { ...player, offense: { ...player.offense, shooting: 82, rimAttack: 42, creation: 50, usage: 55 } }
        case 'rim': return { ...player, offense: { ...player.offense, shooting: 38, rimAttack: 84, creation: 55, usage: 55 } }
        case 'playmaking': return { ...player, offense: { ...player.offense, creation: 84, ballSecurity: 78 }, passing: { accuracy: 84, vision: 84, timing: 80 } }
        case 'defensive': return { ...player, defense: { pointOfAttack: 84, interior: 84, mobility: 80, steal: 78 } }
        case 'rebounding': return { ...player, rebounding: { ...player.rebounding, impact: 88 } }
      }
    }),
  }
}

it.skipIf(process.env.BT2_AUDIT === undefined)('BT4V rosters', () => {
  const seeds = [424242, 7, 1, 99, 2024, 31337, 11, 12].slice(0, Number(process.env.BT4_SEEDS ?? 5))
  const rosters = (process.env.BT4_ROSTERS ?? 'baseline,shooting,rim,playmaking,defensive,rebounding').split(',') as Roster[]
  const out: Record<string, Record<string, number>> = {}
  for (const roster of rosters) {
    const totals: Record<string, number> = {}
    for (const seed of seeds) {
      const setup = withRoster(preparedSetup(seed), roster)
      const live = createMatchEnginePort('match-next').createLiveSession(setup)
      while (!live.matchState.isComplete && live.matchState.t < 60000) live.advanceTicks(3)
      const state = live.matchState
      const metrics = measure(setup, state.events)
      const homePoints = state.score.home
      const awayPoints = state.score.away
      for (const [key, value] of Object.entries({ ...metrics, homePoints, awayPoints, margin: homePoints - awayPoints })) totals[key] = (totals[key] ?? 0) + value / seeds.length
    }
    out[roster] = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Number(v.toFixed(3))]))
  }
  mkdirSync('docs/match-next-bt4/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4/audit/teams-${process.env.BT4_TAG ?? 'run'}.json`, JSON.stringify({ seeds, out }, null, 2))
}, 12_000_000)
