import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { runBt3Game, type Bt3Game } from './economy3'

type Setup = Parameters<NonNullable<Parameters<typeof runBt3Game>[1]>['setup'] & {}>[0]

/** Sets one canonical attribute of every home player to a fixed level (same attribute, everything else equal). */
function withAttribute(setup: Setup, attribute: string, value: number): Setup {
  return {
    ...setup,
    players: setup.players.map((player) => {
      if (player.teamId !== setup.homeTeamId) return player
      switch (attribute) {
        case 'ballSecurity': return { ...player, offense: { ...player.offense, ballSecurity: value } }
        case 'passing': return { ...player, passing: { accuracy: value, vision: value, timing: value } }
        case 'stealRating': return { ...player, defense: { ...player.defense, steal: value } }
        case 'interiorDefense': return { ...player, defense: { ...player.defense, interior: value, mobility: value } }
        case 'shooting': return { ...player, offense: { ...player.offense, shooting: value } }
        case 'rebounding': return { ...player, rebounding: { ...player.rebounding, impact: value } }
        default: throw new Error(attribute)
      }
    }),
  }
}

/**
 * BT3T: controlled rating experiments. Every home player gets the attribute at 30 (low) or 80 (high) and nothing else changes; the
 * outcome that the attribute should move is measured for the home team over the same seeds. Correlations of a pooled sample would
 * be confounded by playing time and matchups; this is not.
 */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT3T player differentiation by rating', () => {
  const seeds = [424242, 7, 1, 99, 2024, 31337, 11, 12].slice(0, Number(process.env.BT3_SEEDS ?? 3))
  const result: Record<string, unknown> = {}
  const teamLines = (games: readonly Bt3Game[], homePrefix: string) => games.map((g) => g.playerLines.filter((line) => line.teamId === homePrefix))
  for (const attribute of (process.env.BT3_ATTRS ?? 'ballSecurity,passing,stealRating,interiorDefense,shooting,rebounding').split(',')) {
    const levels: Record<string, unknown> = {}
    for (const level of [30, 80]) {
      const games = seeds.map((seed) => runBt3Game(seed, { setup: (setup) => withAttribute(setup, attribute, level) }))
      const homeTeam = (g: Bt3Game): string => g.playerLines[0]!.teamId
      const sum = (g: Bt3Game, key: 'blocks' | 'steals' | 'turnovers' | 'oreb' | 'dreb' | 'fta' | 'ftm' | 'fga' | 'fgm' | 'badPasses' | 'passes' | 'points'): number =>
        g.playerLines.filter((line) => line.teamId === homeTeam(g)).reduce((acc, line) => acc + line[key], 0)
      void teamLines
      const mean = (f: (g: Bt3Game) => number): number => Number((games.reduce((a, g) => a + f(g), 0) / games.length).toFixed(3))
      levels[String(level)] = {
        homeTurnovers: mean((g) => sum(g, 'turnovers')), homeBadPassShare: mean((g) => sum(g, 'badPasses') / Math.max(1, sum(g, 'passes'))), homeSteals: mean((g) => sum(g, 'steals')),
        homeBlocks: mean((g) => sum(g, 'blocks')), homeFtPct: mean((g) => sum(g, 'ftm') / Math.max(1, sum(g, 'fta'))), homeFta: mean((g) => sum(g, 'fta')), homeFgPct: mean((g) => sum(g, 'fgm') / Math.max(1, sum(g, 'fga'))),
        homeOreb: mean((g) => sum(g, 'oreb')), homeDreb: mean((g) => sum(g, 'dreb')), homePoints: mean((g) => sum(g, 'points')),
        awayTurnovers: mean((g) => g.turnovers - sum(g, 'turnovers')),
      }
    }
    result[attribute] = levels
  }
  mkdirSync('docs/match-next-bt3/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt3/audit/differentiation-${process.env.BT3_TAG ?? 'run'}.json`, JSON.stringify({ seeds, result }, null, 2))
}, 6_000_000)
