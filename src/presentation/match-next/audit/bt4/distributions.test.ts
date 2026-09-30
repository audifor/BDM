import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import type { MatchNextEvent } from '@/engine/match-next'
import { preparedSetup } from '../bt2/economy'
import { quantiles } from './pace'
import { shotRows } from './ecology'

/**
 * BT4W player stat distributions and BT4Y extreme games, from the same set of games.
 * BT2_AUDIT=1 BT4_TAG=x BT4_SEEDS=16 npx vitest run .../distributions.test.ts
 * -> docs/match-next-bt4/audit/players-<tag>.json and extremes-<tag>.json
 */
const pearson = (xs: readonly number[], ys: readonly number[]): number => {
  const n = xs.length
  if (n < 3) return 0
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i += 1) { num += (xs[i]! - mx) * (ys[i]! - my); dx += (xs[i]! - mx) ** 2; dy += (ys[i]! - my) ** 2 }
  return dx === 0 || dy === 0 ? 0 : Number((num / Math.sqrt(dx * dy)).toFixed(2))
}

interface Line { minutes: number; fga: number; threes: number; rim: number; mid: number; fta: number; points: number; assists: number; turnovers: number; steals: number; blocks: number; rebounds: number; oreb: number; fouls: number }

it.skipIf(process.env.BT2_AUDIT === undefined)('BT4W/Y distributions and extreme games', () => {
  const seeds = [424242, 7, 1, 99, 2024, 31337, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].slice(0, Number(process.env.BT4_SEEDS ?? 16))
  const lines = new Map<string, Line>()
  const ratings = new Map<string, Record<string, number>>()
  const games: { seed: number; complete: boolean; components: Record<string, number> }[] = []
  for (const seed of seeds) {
    const setup = preparedSetup(seed)
    for (const p of setup.players) ratings.set(String(p.playerId), { usage: p.offense.usage, shooting: p.offense.shooting, rimAttack: p.offense.rimAttack, creation: p.offense.creation, ballSecurity: p.offense.ballSecurity, vision: p.passing?.vision ?? 50, accuracy: p.passing?.accuracy ?? 50, interior: p.defense.interior, steal: p.defense.steal ?? 50, rebounding: p.rebounding.impact, height: p.physical.heightCm ?? 190 })
    const live = createMatchEnginePort('match-next').createLiveSession(setup)
    while (!live.matchState.isComplete && live.matchState.t < 60000) live.advanceTicks(3)
    const state = live.matchState
    const events = state.events
    const rows = shotRows(events)
    const line = (id: string): Line => { let l = lines.get(id); if (!l) { l = { minutes: 0, fga: 0, threes: 0, rim: 0, mid: 0, fta: 0, points: 0, assists: 0, turnovers: 0, steals: 0, blocks: 0, rebounds: 0, oreb: 0, fouls: 0 }; lines.set(id, l) } return l }
    for (const p of state.players) line(String(p.playerId)).minutes += (state.courtTimeTenthsByPlayerId?.[p.playerId] ?? 0) / 600
    for (const row of rows) {
      const l = line(row.shooter)
      l.fga += 1
      if (row.points === 3) l.threes += 1
      if (row.zone === 'RESTRICTED' || row.zone === 'RIM') l.rim += 1
      if (row.zone === 'MIDRANGE' || row.zone === 'LONG_MIDRANGE') l.mid += 1
      l.points += (row.made ? row.points : 0) + row.freeThrowPoints
    }
    const add = (e: MatchNextEvent, key: keyof Line, who: string | undefined): void => { if (who !== undefined) line(who)[key] += 1 }
    for (const e of events) {
      if (e.type === 'freeThrowMade' || e.type === 'freeThrowMissed') add(e, 'fta', String(e.shooterPlayerId))
      if (e.type === 'assist') add(e, 'assists', String(e.playerId))
      if (e.type === 'turnover' && e.playerId !== undefined) add(e, 'turnovers', String(e.playerId))
      if (e.type === 'steal') add(e, 'steals', String(e.playerId))
      if (e.type === 'shotBlocked') add(e, 'blocks', String(e.playerId))
      if (e.type === 'foul') add(e, 'fouls', String(e.playerId))
      if (e.type === 'reboundSecured') { add(e, 'rebounds', String(e.playerId)); if (e.reboundType === 'offensive') add(e, 'oreb', String(e.playerId)) }
    }
    const expectedField = rows.reduce((a, r) => a + r.probability * r.points, 0)
    const actualField = rows.reduce((a, r) => a + (r.made ? r.points : 0), 0)
    const fta = events.filter((e) => e.type === 'freeThrowMade' || e.type === 'freeThrowMissed').length
    const ftMade = events.filter((e) => e.type === 'freeThrowMade').length
    games.push({ seed, complete: state.isComplete, components: {
      points: state.score.home + state.score.away, possessions: events.filter((e) => e.type === 'possessionStart').length, fga: rows.length, threes: rows.filter((r) => r.points === 3).length, fta, ftMade,
      turnovers: events.filter((e) => e.type === 'turnover').length, oreb: events.filter((e) => e.type === 'reboundSecured' && e.reboundType === 'offensive').length, fouls: events.filter((e) => e.type === 'foul').length,
      fgMade: rows.filter((r) => r.made).length, expectedFieldPoints: Number(expectedField.toFixed(1)), actualFieldPoints: actualField, steals: events.filter((e) => e.type === 'steal').length, blocks: events.filter((e) => e.type === 'shotBlocked').length,
    } })
  }
  // Players: minutes-weighted per-36 lines for regulars.
  const regulars = [...lines.entries()].filter(([, l]) => l.minutes >= seeds.length * 12)
  const per36 = (l: Line, key: keyof Line): number => (l.minutes === 0 ? 0 : (l[key] * 36) / l.minutes)
  const table = regulars.map(([id, l]) => ({ id, ratings: ratings.get(id), minutesPerGame: Number((l.minutes / seeds.length).toFixed(1)), ...Object.fromEntries((['fga', 'threes', 'rim', 'mid', 'fta', 'points', 'assists', 'turnovers', 'steals', 'blocks', 'rebounds', 'oreb', 'fouls'] as const).map((k) => [`${k}36`, Number(per36(l, k).toFixed(2))])) }))
  const spread = Object.fromEntries((['fga36', 'threes36', 'rim36', 'mid36', 'fta36', 'points36', 'assists36', 'turnovers36', 'steals36', 'blocks36', 'rebounds36', 'oreb36', 'fouls36'] as const).map((k) => [k, quantiles(table.map((row) => (row as unknown as Record<string, number>)[k]!))]))
  const col = (key: string): number[] => table.map((row) => (row as unknown as Record<string, number>)[key]!)
  const rate = (key: string): number[] => table.map((row) => (row.ratings as Record<string, number>)[key]!)
  const correlations = {
    'usage vs fga36': pearson(rate('usage'), col('fga36')), 'shooting vs threes36': pearson(rate('shooting'), col('threes36')), 'rimAttack vs rim36': pearson(rate('rimAttack'), col('rim36')), 'rimAttack vs fta36': pearson(rate('rimAttack'), col('fta36')),
    'creation vs assists36': pearson(rate('creation'), col('assists36')), 'vision vs assists36': pearson(rate('vision'), col('assists36')), 'ballSecurity vs turnovers36': pearson(rate('ballSecurity'), col('turnovers36')),
    'steal vs steals36': pearson(rate('steal'), col('steals36')), 'interior vs blocks36': pearson(rate('interior'), col('blocks36')), 'rebounding vs rebounds36': pearson(rate('rebounding'), col('rebounds36')), 'height vs rebounds36': pearson(rate('height'), col('rebounds36')),
  }
  // Extreme games: split the deviation from the mean of the set into volume, shot luck, free-throw luck and the rest.
  const mean = (k: string): number => games.reduce((a, g) => a + g.components[k]!, 0) / games.length
  const ppp = mean('points') / mean('possessions')
  const detail = games.map((g) => {
    const c = g.components
    const devPoints = c.points! - mean('points')
    const volume = (c.possessions! - mean('possessions')) * ppp
    const shotLuck = c.actualFieldPoints! - c.expectedFieldPoints! - (mean('actualFieldPoints') - mean('expectedFieldPoints'))
    const ftLuck = (c.ftMade! - (c.fta! * mean('ftMade')) / mean('fta'))
    const foulVolume = (c.fta! - mean('fta')) * (mean('ftMade') / mean('fta'))
    const turnoverVolume = -(c.turnovers! - mean('turnovers')) * ppp * 0.9
    const orebVolume = (c.oreb! - mean('oreb')) * ppp * 0.9
    return { seed: g.seed, ...c, devPoints: Number(devPoints.toFixed(1)), volumeEffect: Number(volume.toFixed(1)), shotLuck: Number(shotLuck.toFixed(1)), freeThrowLuck: Number(ftLuck.toFixed(1)), foulVolumeEffect: Number(foulVolume.toFixed(1)), turnoverEffect: Number(turnoverVolume.toFixed(1)), orebEffect: Number(orebVolume.toFixed(1)) }
  })
  const pick = (key: string, high: boolean) => [...detail].sort((a, b) => (high ? -1 : 1) * ((a as unknown as Record<string, number>)[key]! - (b as unknown as Record<string, number>)[key]!))[0]!
  const extremes = { mostPoints: pick('points', true), fewestPoints: pick('points', false), mostPossessions: pick('possessions', true), fewestPossessions: pick('possessions', false), mostThrees: pick('threes', true), mostFta: pick('fta', true) }
  const sd = (k: string): number => Math.sqrt(games.reduce((a, g) => a + (g.components[k]! - mean(k)) ** 2, 0) / games.length)
  const summary = Object.fromEntries(['points', 'possessions', 'fga', 'threes', 'fta', 'turnovers', 'oreb', 'fouls', 'fgMade'].map((k) => [k, { ...quantiles(games.map((g) => g.components[k]!)), sd: Number(sd(k).toFixed(1)) }]))
  mkdirSync('docs/match-next-bt4/audit', { recursive: true })
  const tag = process.env.BT4_TAG ?? 'run'
  writeFileSync(`docs/match-next-bt4/audit/players-${tag}.json`, JSON.stringify({ seeds, regularsOver12MinPerGame: regulars.length, table, spread, correlations }, null, 2))
  writeFileSync(`docs/match-next-bt4/audit/extremes-${tag}.json`, JSON.stringify({ seeds, gamesComplete: games.filter((g) => g.complete).length, summary, extremes, detail }, null, 2))
}, 12_000_000)
