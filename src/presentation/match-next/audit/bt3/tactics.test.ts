import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { runBt3Game, type Bt3Game } from './economy3'

type Level = -2 | -1 | 0 | 1 | 2
interface PlanChange { readonly pace?: Level; readonly rim?: Level; readonly midRange?: Level; readonly threePoint?: Level; readonly coverage?: 'switch' | 'drop' | 'hedge' | 'blitz' }

const CONFIGS: Readonly<Record<string, PlanChange>> = {
  neutral: {},
  threeHeavy: { threePoint: 2, rim: -1, midRange: -1 },
  rimHeavy: { rim: 2, threePoint: -2 },
  midHeavy: { midRange: 2, threePoint: -2, rim: -1 },
  fast: { pace: 2 },
  slow: { pace: -2 },
  blitz: { coverage: 'blitz' },
  drop: { coverage: 'drop' },
}

/** BT3Q: does the tactical plan change how the team plays? Both teams get the same plan so the effect is not a matchup accident. */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT3Q tactical variability', () => {
  const seeds = [424242, 7, 1, 99].slice(0, Number(process.env.BT3_SEEDS ?? 3))
  const names = (process.env.BT3_CONFIGS ?? Object.keys(CONFIGS).join(',')).split(',')
  const result: Record<string, unknown> = {}
  for (const name of names) {
    const change = CONFIGS[name]!
    const games = seeds.map((seed) => runBt3Game(seed, {
      setup: (setup) => {
        const plan = (side: 'home' | 'away') => ({
          ...setup.tacticalPlans[side], pace: change.pace ?? setup.tacticalPlans[side].pace,
          shotProfile: { rim: change.rim ?? setup.tacticalPlans[side].shotProfile.rim, midRange: change.midRange ?? setup.tacticalPlans[side].shotProfile.midRange, threePoint: change.threePoint ?? setup.tacticalPlans[side].shotProfile.threePoint },
          defense: { ...setup.tacticalPlans[side].defense, ...(change.coverage === undefined ? {} : { pickAndRollCoverage: change.coverage }) },
        })
        return { ...setup, tacticalPlans: { home: plan('home'), away: plan('away') } }
      },
    }))
    const mean = (f: (g: Bt3Game) => number): number => Number((games.reduce((a, g) => a + f(g), 0) / games.length).toFixed(3))
    result[name] = {
      change, points: mean((g) => g.points), possessions: mean((g) => g.possessions), meanPossessionSeconds: mean((g) => g.meanPossessionSeconds), fga: mean((g) => g.fga),
      threeShare: mean((g) => g.threeShare), rimShare: mean((g) => g.rimShare), paintShare: mean((g) => g.paintShare), midShare: mean((g) => g.midShare),
      screensPerPossession: mean((g) => g.screens / Math.max(1, g.possessions)), drivesPerPossession: mean((g) => g.drives / Math.max(1, g.possessions)), passesPerPossession: mean((g) => g.passes / Math.max(1, g.possessions)),
      turnovers: mean((g) => g.turnovers), fta: mean((g) => g.fta), completed: mean((g) => (g.complete ? 1 : 0)),
    }
  }
  mkdirSync('docs/match-next-bt3/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt3/audit/tactics-${process.env.BT3_TAG ?? 'run'}.json`, JSON.stringify({ seeds, result }, null, 2))
}, 6_000_000)
