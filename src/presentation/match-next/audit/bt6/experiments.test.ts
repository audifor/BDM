import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { withTuning, type MatchNextTuning } from '@/engine/match-next/tuning'
import { fingerprint, runFingerprintGame, type FingerprintGame, type Side, type TeamCounts } from '../bt5/fingerprint'
import { CONFIGS } from '../bt5/configs'
import { BT6_CONFIGS } from './configs'
import { defenseObserver, summarizeDefense, type DefenseCounts } from './defense'
import { driveObserver, summarizeDrives, type DriveCounts } from '../bt61/drives'

/**
 * BT6 controlled experiments: the BT5 fingerprint plus the BT6 defensive observer, per config and side.
 * BT2_AUDIT=1 BT6_CONFIGS=a,b BT6_SEEDS=6 BT6_TAG=x [BT6_TUNING='{...}'] npx vitest run .../bt6/experiments.test.ts -> docs/match-next-bt6/audit/exp-<tag>.json
 */
function totals(games: readonly FingerprintGame[], defense: readonly Record<Side, DefenseCounts>[]): Record<string, number> {
  const n = Math.max(1, games.length)
  const both = (f: (t: TeamCounts) => number): number => games.reduce((a, g) => a + f(g.teams.home) + f(g.teams.away), 0) / n
  const dboth = (f: (c: DefenseCounts) => number): number => defense.reduce((a, g) => a + f(g.home) + f(g.away), 0) / n
  const r = (v: number): number => Number(v.toFixed(2))
  const possessions = both((t) => t.possessions)
  const points = both((t) => t.points)
  const fga = both((t) => t.fga)
  const threes = both((t) => t.threes)
  const seconds = defense.flatMap((g) => [...g.home.possessionSeconds, ...g.away.possessionSeconds])
  const post = games.reduce((a, g) => a + (g.teams.home.playFamilies.POST ?? 0) + (g.teams.away.playFamilies.POST ?? 0), 0) / n
  return {
    possessions: r(possessions), points: r(points), ppp: r(points / Math.max(1, possessions)), fga: r(fga), twoPa: r(fga - threes), threePa: r(threes), fta: r(both((t) => t.fta)),
    turnovers: r(both((t) => t.turnovers)), steals: r(both((t) => t.steals)), oreb: r(both((t) => t.oreb)), dreb: r(both((t) => t.dreb)), assists: r(both((t) => t.assists)), fouls: r(both((t) => t.fouls)), blocks: r(both((t) => t.blocks)),
    transitionPossessions: r(both((t) => t.transitionPossessions)), shotsWithin8: r(dboth((c) => c.shotsWithin8)), halfCourtPossessions: r(dboth((c) => Object.entries(c.durations).filter(([k]) => k.startsWith('halfCourt')).reduce((a, [, v]) => a + v, 0))),
    possessionSecondsMean: r(seconds.reduce((a, b) => a + b, 0) / Math.max(1, seconds.length)), passesPerPossession: r(both((t) => t.passes) / Math.max(1, possessions)),
    drives: r(both((t) => t.drives)), ballScreens: r(both((t) => t.screens)), offBallActions: r(both((t) => t.cuts + t.offBallScreens)), postPlays: r(post),
    tovPct: r(100 * both((t) => t.turnovers) / Math.max(1, possessions)), orebPct: r(100 * both((t) => t.oreb) / Math.max(1, both((t) => t.oreb) + both((t) => t.dreb))), ftRate: r(both((t) => t.fta) / Math.max(1, fga)), astPerFgm: r(both((t) => t.assists) / Math.max(1, both((t) => t.fgm))),
  }
}

it.skipIf(process.env.BT2_AUDIT === undefined)('BT6 experiments', () => {
  const seeds = (process.env.BT6_SEED_LIST ?? '31337,424242,7,1,99,2024,11,12,3,5,21,42').split(',').map(Number).slice(0, Number(process.env.BT6_SEEDS ?? 6))
  const names = (process.env.BT6_CONFIGS ?? 'neutral').split(',')
  const overrides = JSON.parse(process.env.BT6_TUNING ?? '{}') as Partial<MatchNextTuning>
  const out: Record<string, unknown> = {}
  for (const name of names) {
    const config = BT6_CONFIGS[name] ?? CONFIGS[name]
    if (config === undefined) throw new Error(`Unknown config ${name}`)
    const started = Date.now()
    const defense: Record<Side, DefenseCounts>[] = []
    const driveGames: Record<Side, DriveCounts>[] = []
    const games: FingerprintGame[] = seeds.map((seed) => withTuning(overrides, () => {
      const observer = defenseObserver()
      const driveAudit = driveObserver()
      const game = runFingerprintGame(seed, config.transform, { observe: (s, e, setup) => { observer.observe(s, e, setup); driveAudit.observe(s, e, setup) } })
      defense.push(observer.counts)
      driveGames.push(driveAudit.counts)
      process.stderr.write(`[bt6] ${name} seed ${seed} done (${game.score.home}-${game.score.away})\n`)
      return game
    }))
    const sides = Object.fromEntries((['home', 'away'] as const).map((side) => {
      const other: Side = side === 'home' ? 'away' : 'home'
      const own = games.reduce((a, g) => a + g.teams[side].possessions, 0)
      const opp = games.reduce((a, g) => a + g.teams[other].possessions, 0)
      return [side, { fingerprint: fingerprint(games, side), bt6: summarizeDefense(defense, side, { own, opp }), drives: summarizeDrives(driveGames, side) }]
    }))
    out[name] = { description: config.description, msPerGame: Math.round((Date.now() - started) / games.length), complete: games.filter((g) => g.complete).length, totals: totals(games, defense), perSeed: games.map((g) => ({ seed: g.seed, score: g.score, possessions: g.teams.home.possessions + g.teams.away.possessions, turnovers: g.teams.home.turnovers + g.teams.away.turnovers, steals: g.teams.home.steals + g.teams.away.steals })), adjustments: games.map((g) => g.adjustments), ...sides }
  }
  mkdirSync('docs/match-next-bt6/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt6/audit/exp-${process.env.BT6_TAG ?? 'run'}.json`, JSON.stringify({ seeds, overrides, out }, null, 2))
}, 60_000_000)
