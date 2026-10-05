import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import type { MatchNextEvent, MatchSetup, MatchState } from '@/engine/match-next'
import { runFingerprintGame } from '../bt5/fingerprint'

/**
 * BT6.30-31 player identity and role distribution, over a seed cohort (default config). Diagnostics only: nothing is optimized against them.
 * BT2_AUDIT=1 BT6_PLAYER_SEEDS=12 BT6_TAG=x npx vitest run .../bt6/players.test.ts -> docs/match-next-bt6/audit/players-<tag>.json
 */
interface Row { seed: number; team: string; player: string; minutes: number; ratings: Record<string, number>; fga: number; threes: number; rim: number; fta: number; tov: number; ast: number; reb: number; stl: number; blk: number; initiations: number; points: number }

function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0; let sxx = 0; let syy = 0
  for (let i = 0; i < n; i += 1) { sxy += (xs[i]! - mx) * (ys[i]! - my); sxx += (xs[i]! - mx) ** 2; syy += (ys[i]! - my) ** 2 }
  return sxx === 0 || syy === 0 ? 0 : Number((sxy / Math.sqrt(sxx * syy)).toFixed(2))
}

it.skipIf(process.env.BT2_AUDIT === undefined)('BT6 player identity', () => {
  const seeds = [31337, 424242, 7, 1, 99, 2024, 11, 12, 3, 5, 21, 42].slice(0, Number(process.env.BT6_PLAYER_SEEDS ?? 12))
  const rows: Row[] = []
  for (const seed of seeds) {
    const byPlayer = new Map<string, Row>()
    let lastSetup: MatchSetup | null = null
    let lastInitPossession: string | null = null
    const get = (s: MatchState, id: unknown): Row | undefined => {
      const key = String(id)
      if (!byPlayer.has(key)) {
        const p = lastSetup?.players.find((x) => String(x.playerId) === key)
        const state = s.players.find((x) => String(x.playerId) === key)
        if (p === undefined || state === undefined) return undefined
        byPlayer.set(key, { seed, team: String(state.teamId), player: key, minutes: 0, ratings: { usage: p.offense.usage, shooting: p.offense.shooting, rimAttack: p.offense.rimAttack, creation: p.offense.creation, ballSecurity: p.offense.ballSecurity, vision: p.passing?.vision ?? 50, rebounding: p.rebounding.impact, steal: p.defense.steal ?? 50, interior: p.defense.interior, heightCm: p.physical.heightCm }, fga: 0, threes: 0, rim: 0, fta: 0, tov: 0, ast: 0, reb: 0, stl: 0, blk: 0, initiations: 0, points: 0 })
      }
      return byPlayer.get(key)
    }
    runFingerprintGame(seed, undefined, { observe: (s: MatchState, events: readonly MatchNextEvent[], setup: MatchSetup) => {
      lastSetup = setup
      if (s.clock.gameRunning) for (const p of s.players) if (p.active) { const r = get(s, p.playerId); if (r) r.minutes += 0.1 / 60 }
      for (const e of events) {
        if (e.type === 'shotReleased') { const r = get(s, e.shooterPlayerId); if (r) { r.fga += 1; if (e.points === 3) r.threes += 1; if (e.shotZone === 'RESTRICTED' || e.shotZone === 'RIM') r.rim += 1 } }
        else if (e.type === 'shotMade') { const r = get(s, e.shooterPlayerId ?? e.playerId); if (r) r.points += e.points ?? 0 }
        else if (e.type === 'freeThrowMade' || e.type === 'freeThrowMissed') { const r = get(s, e.playerId); if (r) { r.fta += 1; if (e.type === 'freeThrowMade') r.points += 1 } }
        else if (e.type === 'turnover') { const r = get(s, e.playerId); if (r) r.tov += 1 }
        else if (e.type === 'assist') { const r = get(s, e.assistPlayerId); if (r) r.ast += 1 }
        else if (e.type === 'reboundSecured') { const r = get(s, e.playerId); if (r) r.reb += 1 }
        else if (e.type === 'steal') { const r = get(s, e.playerId); if (r) r.stl += 1 }
        else if (e.type === 'shotBlocked') { const r = get(s, e.playerId); if (r) r.blk += 1 }
        else if (e.type === 'playCalled' && e.possessionId !== undefined && e.possessionId !== lastInitPossession) { lastInitPossession = e.possessionId; const r = get(s, e.playerId); if (r) r.initiations += 1 }
      }
    } })
    rows.push(...byPlayer.values())
  }
  const played = rows.filter((r) => r.minutes >= 10)
  const per36 = (r: Row, v: number): number => v / Math.max(1, r.minutes) * 36
  const col = (f: (r: Row) => number): number[] => played.map(f)
  const usage = (r: Row): number => r.fga + 0.44 * r.fta + r.tov
  const correlations = {
    'creation vs usage/36': pearson(col((r) => r.ratings.creation!), col((r) => per36(r, usage(r)))),
    'usage rating vs usage/36': pearson(col((r) => r.ratings.usage!), col((r) => per36(r, usage(r)))),
    'creation vs assists/36': pearson(col((r) => r.ratings.creation!), col((r) => per36(r, r.ast))),
    'vision vs assists/36': pearson(col((r) => r.ratings.vision!), col((r) => per36(r, r.ast))),
    'creation vs initiations/36': pearson(col((r) => r.ratings.creation!), col((r) => per36(r, r.initiations))),
    'shooting vs 3PA share': pearson(col((r) => r.ratings.shooting!), col((r) => r.threes / Math.max(1, r.fga))),
    'shooting vs 3PA/36': pearson(col((r) => r.ratings.shooting!), col((r) => per36(r, r.threes))),
    'rimAttack vs rim attempts/36': pearson(col((r) => r.ratings.rimAttack!), col((r) => per36(r, r.rim))),
    'rimAttack vs FTA/36': pearson(col((r) => r.ratings.rimAttack!), col((r) => per36(r, r.fta))),
    'rebounding vs rebounds/36': pearson(col((r) => r.ratings.rebounding!), col((r) => per36(r, r.reb))),
    'steal vs steals/36': pearson(col((r) => r.ratings.steal!), col((r) => per36(r, r.stl))),
    'interior D vs blocks/36': pearson(col((r) => r.ratings.interior!), col((r) => per36(r, r.blk))),
    'ballSecurity vs TOV per usage': pearson(col((r) => r.ratings.ballSecurity!), col((r) => r.tov / Math.max(1, usage(r)))),
  }
  // Role distribution per team-game: the top player's share of the team's FGA, usage, initiations and assists.
  const teamGames = new Map<string, Row[]>()
  for (const r of rows) { const k = `${r.seed}|${r.team}`; teamGames.set(k, [...(teamGames.get(k) ?? []), r]) }
  const topShare = (f: (r: Row) => number): { mean: number; max: number } => {
    const shares = [...teamGames.values()].map((g) => { const total = g.reduce((a, r) => a + f(r), 0); return total === 0 ? 0 : Math.max(...g.map(f)) / total })
    return { mean: Number((shares.reduce((a, b) => a + b, 0) / shares.length).toFixed(3)), max: Number(Math.max(...shares).toFixed(3)) }
  }
  const roles = { topFgaShare: topShare((r) => r.fga), topUsageShare: topShare(usage), topInitiationShare: topShare((r) => r.initiations), topAssistShare: topShare((r) => r.ast), topPointsShare: topShare((r) => r.points) }
  mkdirSync('docs/match-next-bt6/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt6/audit/players-${process.env.BT6_TAG ?? 'run'}.json`, JSON.stringify({ seeds, playerGames: played.length, correlations, roles }, null, 2))
}, 60_000_000)
