import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dist, runBt3Game, type Bt3Game } from './economy3'
import { preparedSetup } from '../bt2/economy'

/** Multi-seed soak. BT2_AUDIT=1 BT3_TAG=after BT3_SEEDS=8 npx vitest run .../run3.test.ts -> docs/match-next-bt3/audit/economy-<tag>.json */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT3S multi-seed soak', () => {
  const tag = process.env.BT3_TAG ?? 'after'
  const n = Number(process.env.BT3_SEEDS ?? 8)
  const seeds = [424242, 7, 1, 99, 2024, 31337, 11, 12, 13, 14, 15, 16].slice(0, n)
  const games = seeds.map((seed) => runBt3Game(seed))
  const col = (f: (g: Bt3Game) => number) => dist(games.map(f))
  const out = {
    tag, seeds,
    distributions: {
      points: col((g) => g.points), possessions: col((g) => g.possessions), meanPossessionSeconds: col((g) => g.meanPossessionSeconds), fga: col((g) => g.fga), fgPct: col((g) => g.fgMade / Math.max(1, g.fga)),
      fta: col((g) => g.fta), ftMade: col((g) => g.ftMade), ftPct: col((g) => g.ftMade / Math.max(1, g.fta)), ftaPerFga: col((g) => g.ftaPerFga),
      threeShare: col((g) => g.threeShare), rimShare: col((g) => g.rimShare), paintShare: col((g) => g.paintShare), midShare: col((g) => g.midShare), deepShare: col((g) => g.deepShare),
      fouls: col((g) => g.fouls), bonusFouls: col((g) => g.bonusFouls), andOnes: col((g) => g.andOnes), ftSequences: col((g) => g.ftSequences), maxPersonalFouls: col((g) => g.maxPersonalFouls), foulOuts: col((g) => g.foulOuts),
      blocks: col((g) => g.blocks), steals: col((g) => g.steals), deflections: col((g) => g.deflections), stealAttempts: col((g) => g.stealAttempts),
      turnovers: col((g) => g.turnovers), outOfBounds: col((g) => g.outOfBounds), assists: col((g) => g.assists),
      oreb: col((g) => g.oreb), dreb: col((g) => g.dreb), orebShare: col((g) => g.oreb / Math.max(1, g.oreb + g.dreb)), putbacks: col((g) => g.putbacks), putbackMade: col((g) => g.putbackMade), putbackMeanProbability: col((g) => g.putbackMeanProbability), screens: col((g) => g.screens), drives: col((g) => g.drives), passes: col((g) => g.passes),
      meanShotProbability: col((g) => g.meanShotProbability), meanContestScore: col((g) => g.meanContestScore), shotClockViolations: col((g) => g.shotClockViolations), transitionStarts: col((g) => g.transitionStarts), transitionShots: col((g) => g.transitionShots), completed: col((g) => (g.complete ? 1 : 0)),
      contacts: col((g) => g.contacts), ppp: col((g) => g.ppp), scrumWithin15: col((g) => g.scrumWithin15 / Math.max(1, g.scrumSamples)), scrumWithin06: col((g) => g.scrumWithin06 / Math.max(1, g.scrumSamples)), illegalPlayTransitions: col((g) => g.illegalPlayTransitions),
    },
    foulsByType: Object.fromEntries([...new Set(games.flatMap((g) => Object.keys(g.foulsByType)))].map((k) => [k, Number((games.reduce((a, g) => a + (g.foulsByType[k] ?? 0), 0) / games.length).toFixed(2))])),
    turnoverTypes: Object.fromEntries([...new Set(games.flatMap((g) => Object.keys(g.turnoverTypes)))].map((k) => [k, Number((games.reduce((a, g) => a + (g.turnoverTypes[k] ?? 0), 0) / games.length).toFixed(2))])),
    stealKinds: Object.fromEntries([...new Set(games.flatMap((g) => Object.keys(g.stealKinds)))].map((k) => [k, Number((games.reduce((a, g) => a + (g.stealKinds[k] ?? 0), 0) / games.length).toFixed(2))])),
    perGame: games.map((g) => ({ ...g, playerLines: undefined })),
    playerLines: games.flatMap((g) => g.playerLines),
    ratings: Object.fromEntries(preparedSetup(seeds[0]!).players.map((player) => [String(player.playerId), { heightCm: player.physical.heightCm, standingReachCm: player.physical.standingReachCm, ...player.offense, passAccuracy: player.passing?.accuracy ?? 50, passVision: player.passing?.vision ?? 50, ...Object.fromEntries(Object.entries(player.defense).map(([key, value]) => [`def_${key}`, value])), rebounding: player.rebounding.impact }])),
  }
  mkdirSync('docs/match-next-bt3/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt3/audit/economy-${tag}.json`, JSON.stringify(out, null, 2))
}, 6_000_000)
