/**
 * WSR1 FAST vs BACKGROUND certification. For every held-out certification case, the FAST reference distribution (cert.jsonl, collected
 * by wsr1Collect) is compared with BACKGROUND on the same canonical setups over many seeds. Reports per cohort and pooled.
 *   node <bundle> <dataDir> [bgSeeds=40] [out.json]
 */
import { writeFileSync } from 'node:fs'
import { simulateBackgroundMatch, type BackgroundMatchResult } from '@/engine/world-sim/background/BackgroundMatchModel'
import { deriveBackgroundFeatures } from '@/engine/world-sim/background/BackgroundFeatures'
import { loadCorpus } from './wsr1Fit'
import { COHORTS, certificationCases } from './wsr1Cases'
import type { MatchRecord, TeamRecord } from './wsr1Collect'

/** Per team-game metrics (counts per 40 minutes, so formats compare), from either source. */
export interface TeamGameMetrics {
  pts: number; poss: number; fga: number; threeShare: number; rimShare: number; fgPct: number; threePct: number; fta: number; ftPct: number
  tov: number; oreb: number; dreb: number; ast: number; stl: number; blk: number; pf: number; win: number; margin: number
  topScorerShare: number; topFgaShare: number; starterMinutes: number; benchMinutes: number; maxMinutes: number
}
export const METRICS: readonly (keyof TeamGameMetrics)[] = ['pts', 'poss', 'fga', 'threeShare', 'rimShare', 'fgPct', 'threePct', 'fta', 'ftPct', 'tov', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'pf', 'win', 'margin', 'topScorerShare', 'topFgaShare', 'starterMinutes', 'benchMinutes', 'maxMinutes']

interface TeamTotals { pts: number; poss: number; fga: { rim: number; mid: number; three: number }; fgm: { rim: number; mid: number; three: number }; fta: number; ftm: number; tov: number; oreb: number; dreb: number; ast: number; stl: number; blk: number; pf: number }
interface PlayerLine { started: boolean; secs: number; pts: number; fga: number }

function teamMetrics(t: TeamTotals, opponentPts: number, lines: readonly PlayerLine[], per40: number): TeamGameMetrics {
  const fga = t.fga.rim + t.fga.mid + t.fga.three
  const fgm = t.fgm.rim + t.fgm.mid + t.fgm.three
  const starters = lines.filter((l) => l.started)
  const bench = lines.filter((l) => !l.started)
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
  return {
    pts: t.pts * per40, poss: t.poss * per40, fga: fga * per40, threeShare: fga === 0 ? 0 : t.fga.three / fga, rimShare: fga === 0 ? 0 : t.fga.rim / fga,
    fgPct: fga === 0 ? 0 : fgm / fga, threePct: t.fga.three === 0 ? 0 : t.fgm.three / t.fga.three, fta: t.fta * per40, ftPct: t.fta === 0 ? 0 : t.ftm / t.fta,
    tov: t.tov * per40, oreb: t.oreb * per40, dreb: t.dreb * per40, ast: t.ast * per40, stl: t.stl * per40, blk: t.blk * per40, pf: t.pf * per40,
    win: t.pts > opponentPts ? 1 : 0, margin: (t.pts - opponentPts) * per40,
    topScorerShare: t.pts === 0 ? 0 : Math.max(...lines.map((l) => l.pts)) / t.pts, topFgaShare: fga === 0 ? 0 : Math.max(...lines.map((l) => l.fga)) / fga,
    starterMinutes: sum(starters.map((l) => l.secs)) / 60 / Math.max(1, starters.length) * per40, benchMinutes: sum(bench.map((l) => l.secs)) / 60 * per40,
    maxMinutes: Math.max(...lines.map((l) => l.secs)) / 60 * per40,
  }
}

export function fastMetrics(record: MatchRecord, per40: number): [TeamGameMetrics, TeamGameMetrics] {
  const lines = (team: TeamRecord): PlayerLine[] => record.players.filter((p) => p.team === team.teamId).map((p) => ({ started: p.started, secs: p.secs, pts: p.pts, fga: p.fga.rim + p.fga.mid + p.fga.three }))
  return [teamMetrics(record.home, record.away.pts, lines(record.home), per40), teamMetrics(record.away, record.home.pts, lines(record.away), per40)]
}

export function backgroundMetrics(result: BackgroundMatchResult, per40: number): [TeamGameMetrics, TeamGameMetrics] {
  const byId = new Map(result.playerStats.map((line) => [line.playerId, line]))
  const side = (home: boolean): TeamGameMetrics => {
    const squad = home ? result.squads.home : result.squads.away
    const starters = new Set(home ? result.starters.home : result.starters.away)
    const lines = squad.map((id) => byId.get(id)!)
    const detail = home ? result.teamDetail.home : result.teamDetail.away
    const sum = (pick: (line: (typeof lines)[number]) => number) => lines.reduce((s, l) => s + pick(l), 0)
    const totals: TeamTotals = {
      pts: sum((l) => l.points), poss: detail.possessions,
      fga: { rim: detail.fieldGoalsByZone.rim.attempted, mid: detail.fieldGoalsByZone.mid.attempted, three: detail.fieldGoalsByZone.three.attempted },
      fgm: { rim: detail.fieldGoalsByZone.rim.made, mid: detail.fieldGoalsByZone.mid.made, three: detail.fieldGoalsByZone.three.made },
      fta: sum((l) => l.freeThrowsAttempted), ftm: sum((l) => l.freeThrowsMade), tov: sum((l) => l.turnovers), oreb: sum((l) => l.offensiveRebounds), dreb: sum((l) => l.defensiveRebounds),
      ast: sum((l) => l.assists), stl: sum((l) => l.steals), blk: sum((l) => l.blocks), pf: sum((l) => l.foulsCommitted),
    }
    return teamMetrics(totals, home ? result.score.away : result.score.home, lines.map((l) => ({ started: starters.has(l.playerId), secs: l.secondsPlayed, pts: l.points, fga: l.fieldGoalsAttempted })), per40)
  }
  return [side(true), side(false)]
}

export interface Summary { n: number; mean: number; sd: number }
export function summarize(values: readonly number[]): Summary {
  const n = values.length
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, n)
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1))
  return { n, mean, sd }
}

export interface Comparison { metric: string; fast: Summary; background: Summary; delta: number; relative: number; standardized: number; ok: boolean }
/**
 * A metric agrees when the mean difference is small both statistically (within 2.5 standard errors of the FAST mean, or within a
 * tenth of a FAST team-game standard deviation) and practically (within 10% relative, or 0.03 absolute for shares and percentages).
 */
export function compare(metric: string, fast: readonly number[], background: readonly number[]): Comparison {
  const f = summarize(fast)
  const b = summarize(background)
  const delta = b.mean - f.mean
  const se = Math.sqrt(f.sd ** 2 / Math.max(1, f.n) + b.sd ** 2 / Math.max(1, b.n))
  const standardized = f.sd === 0 ? 0 : delta / f.sd
  const relative = f.mean === 0 ? 0 : delta / Math.abs(f.mean)
  const share = Math.abs(f.mean) <= 1.0001 && Math.abs(b.mean) <= 1.0001
  const statistically = Math.abs(delta) <= 2.5 * se || Math.abs(standardized) <= 0.1
  const practically = share ? Math.abs(delta) <= 0.03 : Math.abs(relative) <= 0.1 || Math.abs(standardized) <= 0.2
  return { metric, fast: f, background: b, delta, relative, standardized, ok: statistically || practically }
}

function main(): void {
  const [dir = 'data', seedsArg = '40', out] = process.argv.slice(2)
  const bgSeeds = Number(seedsArg)
  const { records, setups } = loadCorpus(dir, 'cert')
  const cases = certificationCases()
  const fastByCohort = new Map<string, { home: TeamGameMetrics[]; away: TeamGameMetrics[] }>()
  const bgByCohort = new Map<string, { home: TeamGameMetrics[]; away: TeamGameMetrics[] }>()
  const bucket = (map: typeof fastByCohort, cohort: string) => { let b = map.get(cohort); if (!b) { b = { home: [], away: [] }; map.set(cohort, b) } return b }
  let bgMs = 0
  let bgCount = 0
  for (const item of cases) {
    const cohort = COHORTS.find((c) => item.id.startsWith(`cert-${c.name}-`))!.name
    const setup = setups.get(item.id)!
    const per40 = 40 / deriveBackgroundFeatures(setup).context.regulationMinutes
    for (const record of records.filter((r) => r.caseId === item.id)) {
      const [h, a] = fastMetrics(record, per40)
      bucket(fastByCohort, cohort).home.push(h); bucket(fastByCohort, cohort).away.push(a)
    }
    for (let s = 0; s < bgSeeds; s += 1) {
      const t0 = performance.now()
      const result = simulateBackgroundMatch({ ...setup, matchSeed: 5_000_000 + s })
      bgMs += performance.now() - t0; bgCount += 1
      const [h, a] = backgroundMetrics(result, per40)
      bucket(bgByCohort, cohort).home.push(h); bucket(bgByCohort, cohort).away.push(a)
    }
  }
  const report: Record<string, Comparison[]> = {}
  const pooledFast = [...fastByCohort.values()].flatMap((b) => [...b.home, ...b.away])
  const pooledBg = [...bgByCohort.values()].flatMap((b) => [...b.home, ...b.away])
  report.pooled = METRICS.filter((m) => m !== 'win' && m !== 'margin').map((m) => compare(m, pooledFast.map((x) => x[m]), pooledBg.map((x) => x[m])))
  for (const [cohort, fast] of fastByCohort) {
    const bg = bgByCohort.get(cohort)!
    report[cohort] = [
      ...METRICS.filter((m) => m !== 'win' && m !== 'margin').map((m) => compare(`home.${m}`, fast.home.map((x) => x[m]), bg.home.map((x) => x[m]))),
      ...METRICS.filter((m) => m !== 'win' && m !== 'margin').map((m) => compare(`away.${m}`, fast.away.map((x) => x[m]), bg.away.map((x) => x[m]))),
      compare('home.win', fast.home.map((x) => x.win), bg.home.map((x) => x.win)),
      compare('home.margin', fast.home.map((x) => x.margin), bg.home.map((x) => x.margin)),
    ]
  }
  // Identity: across cases, does BACKGROUND rank matchups like FAST (mean margin), and players like FAST (per-36 production)?
  const caseMargins: { fast: number; bg: number }[] = []
  const playerRows: { fast: Record<string, number>; bg: Record<string, number> }[] = []
  for (const item of cases) {
    const setup = setups.get(item.id)!
    const fast = records.filter((r) => r.caseId === item.id)
    const bgResults = Array.from({ length: bgSeeds }, (_, s) => simulateBackgroundMatch({ ...setup, matchSeed: 5_000_000 + s }))
    caseMargins.push({ fast: fast.reduce((s, r) => s + r.home.pts - r.away.pts, 0) / fast.length, bg: bgResults.reduce((s, r) => s + r.score.home - r.score.away, 0) / bgResults.length })
    for (const playerId of [...setup.homeSquad, ...setup.awaySquad]) {
      const fastLines = fast.map((r) => r.players.find((p) => p.id === playerId)!)
      const fastMinutes = fastLines.reduce((s, p) => s + p.secs, 0) / 60
      if (fastMinutes / fast.length < 12) continue
      const bgLines = bgResults.map((r) => r.playerStats.find((l) => l.playerId === playerId)!)
      const bgMinutes = bgLines.reduce((s, l) => s + l.secondsPlayed, 0) / 60
      const per36 = (total: number, minutes: number) => minutes <= 0 ? 0 : total / minutes * 36
      playerRows.push({
        fast: { minutes: fastMinutes / fast.length, pts: per36(fastLines.reduce((s, p) => s + p.pts, 0), fastMinutes), reb: per36(fastLines.reduce((s, p) => s + p.oreb + p.dreb, 0), fastMinutes), ast: per36(fastLines.reduce((s, p) => s + p.ast, 0), fastMinutes), fga: per36(fastLines.reduce((s, p) => s + p.fga.rim + p.fga.mid + p.fga.three, 0), fastMinutes), threes: per36(fastLines.reduce((s, p) => s + p.fga.three, 0), fastMinutes), tov: per36(fastLines.reduce((s, p) => s + p.tov, 0), fastMinutes), blk: per36(fastLines.reduce((s, p) => s + p.blk, 0), fastMinutes) },
        bg: { minutes: bgMinutes / bgResults.length, pts: per36(bgLines.reduce((s, l) => s + l.points, 0), bgMinutes), reb: per36(bgLines.reduce((s, l) => s + l.rebounds, 0), bgMinutes), ast: per36(bgLines.reduce((s, l) => s + l.assists, 0), bgMinutes), fga: per36(bgLines.reduce((s, l) => s + l.fieldGoalsAttempted, 0), bgMinutes), threes: per36(bgLines.reduce((s, l) => s + l.threePointAttempted, 0), bgMinutes), tov: per36(bgLines.reduce((s, l) => s + l.turnovers, 0), bgMinutes), blk: per36(bgLines.reduce((s, l) => s + l.blocks, 0), bgMinutes) },
      })
    }
  }
  const correlation = (xs: readonly number[], ys: readonly number[]): number => {
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length
    const my = ys.reduce((a, b) => a + b, 0) / ys.length
    let c = 0, vx = 0, vy = 0
    xs.forEach((x, i) => { c += (x - mx) * (ys[i]! - my); vx += (x - mx) ** 2; vy += (ys[i]! - my) ** 2 })
    return c / Math.sqrt(vx * vy)
  }
  const signAgreement = caseMargins.filter((m) => Math.abs(m.fast) >= 5).filter((m) => Math.sign(m.fast) === Math.sign(m.bg)).length / Math.max(1, caseMargins.filter((m) => Math.abs(m.fast) >= 5).length)
  const identity = {
    caseMarginCorrelation: correlation(caseMargins.map((m) => m.fast), caseMargins.map((m) => m.bg)),
    caseMarginSlope: (() => { const mx = caseMargins.reduce((s, m) => s + m.fast, 0) / caseMargins.length; const my = caseMargins.reduce((s, m) => s + m.bg, 0) / caseMargins.length; let c = 0, v = 0; caseMargins.forEach((m) => { c += (m.fast - mx) * (m.bg - my); v += (m.fast - mx) ** 2 }); return c / v })(),
    favouriteAgreementWhenFastMarginAtLeast5: signAgreement,
    players: playerRows.length,
    playerCorrelation: Object.fromEntries(['minutes', 'pts', 'reb', 'ast', 'fga', 'threes', 'tov', 'blk'].map((key) => [key, correlation(playerRows.map((r) => r.fast[key]!), playerRows.map((r) => r.bg[key]!))])),
  }
  console.log('\n== identity', JSON.stringify(identity, (_, v) => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v))
  const fmt = (v: number) => Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3)
  let failures = 0
  let checks = 0
  for (const [name, rows] of Object.entries(report)) {
    const bad = rows.filter((r) => !r.ok)
    failures += bad.length; checks += rows.length
    console.log(`\n== ${name}: ${rows.length - bad.length}/${rows.length} agree`)
    for (const r of name === 'pooled' ? rows : bad) console.log(`${r.ok ? '  ' : '!!'} ${r.metric.padEnd(22)} FAST ${fmt(r.fast.mean).padStart(7)} ±${fmt(r.fast.sd).padStart(6)}  BG ${fmt(r.background.mean).padStart(7)} ±${fmt(r.background.sd).padStart(6)}  d=${fmt(r.delta)} (${(100 * r.relative).toFixed(1)}%, ${r.standardized.toFixed(2)} sd)`)
  }
  console.log(`\nAGREEMENT ${checks - failures}/${checks} · BACKGROUND ${(bgMs / bgCount).toFixed(3)} ms per match over ${bgCount}`)
  if (out !== undefined) writeFileSync(out, JSON.stringify({ report, identity, bgMsPerMatch: bgMs / bgCount, fastMatches: records.length, bgMatches: bgCount }, null, 1))
}

if (process.argv[1]?.includes('certify')) main()
