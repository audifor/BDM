/**
 * WSR1 calibration (development time only): fits the BACKGROUND model to the FAST reference corpus and writes the versioned parameter
 * module src/engine/world-sim/background/backgroundModelV1.ts. Every coefficient comes from FAST data:
 *   - team rates: weighted ridge regression of FAST per-team-game rates on the shared feature vector;
 *   - player shares: multinomial maximum likelihood (Newton) of who took each team event, weights minutes x exp(beta . z);
 *   - make slopes, action rates, fatigue: weighted least squares on FAST player-games.
 *   node <bundle> <dataDir> [out]
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import type { MatchSetup } from '@/engine/match-next'
import { deriveBackgroundFeatures, playerFeatureVector, rateFeatureVector, shotFeatureVector, type BackgroundMatchFeatures, type BackgroundTeamFeatures } from '@/engine/world-sim/background/BackgroundFeatures'
import { ACTION_RATES, RATE_FEATURES, SHOT_FEATURES, type AllocationKind, type BackgroundModelParams, type LinearRate, type PlayerFeature, type ShotEquation, type TeamRate } from '@/engine/world-sim/background/BackgroundModelParams'
import type { MatchRecord, PlayerRecord, TeamRecord } from './wsr1Collect'

export function loadCorpus(dir: string, which: 'cal' | 'cal2' | 'cert'): { records: MatchRecord[]; setups: Map<string, MatchSetup> } {
  const records = readFileSync(`${dir}/${which}.jsonl`, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as MatchRecord)
  const setups = new Map<string, MatchSetup>()
  for (const file of readdirSync(dir).filter((name) => name.startsWith(`${which}-setups-shard`))) {
    for (const [id, setup] of Object.entries(JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')) as Record<string, MatchSetup>)) setups.set(id, setup)
  }
  return { records, setups }
}

// ---------- linear algebra ----------
function solve(a: number[][], b: number[]): number[] {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]!])
  for (let col = 0; col < n; col += 1) {
    let pivot = col
    for (let row = col + 1; row < n; row += 1) if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row
    ;[m[col], m[pivot]] = [m[pivot]!, m[col]!]
    const p = m[col]![col]!
    if (Math.abs(p) < 1e-12) continue
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue
      const f = m[row]![col]! / p
      if (f !== 0) for (let k = col; k <= n; k += 1) m[row]![k]! -= f * m[col]![k]!
    }
  }
  return m.map((row, i) => Math.abs(row[i]!) < 1e-12 ? 0 : row[n]! / row[i]!)
}

/**
 * Weighted ridge regression on standardised features (each centred and scaled to unit sd, so the penalty treats a rating and an intent
 * alike), mapped back to raw units. Intercept unpenalised. Returns [intercept, ...coefficients] and the weighted residual sd.
 */
function ridge(rawRows: readonly number[][], y: readonly number[], w: readonly number[], lambda: number): { beta: number[]; sd: number } {
  const p = rawRows[0]!.length
  const means = Array.from({ length: p }, (_, j) => rawRows.reduce((s, row) => s + row[j]!, 0) / rawRows.length)
  const sds = Array.from({ length: p }, (_, j) => Math.sqrt(rawRows.reduce((s, row) => s + (row[j]! - means[j]!) ** 2, 0) / rawRows.length) || 1)
  const rows = rawRows.map((row) => row.map((value, j) => (value - means[j]!) / sds[j]!))
  const fitted = ridgeStandard(rows, y, w, lambda)
  const slopes = fitted.beta.slice(1).map((value, j) => value / sds[j]!)
  const intercept = fitted.beta[0]! - slopes.reduce((s, value, j) => s + value * means[j]!, 0)
  return { beta: [intercept, ...slopes], sd: fitted.sd }
}

function ridgeStandard(rows: readonly number[][], y: readonly number[], w: readonly number[], lambda: number): { beta: number[]; sd: number } {
  const k = rows[0]!.length + 1
  const xtx = Array.from({ length: k }, () => new Array<number>(k).fill(0))
  const xty = new Array<number>(k).fill(0)
  rows.forEach((row, i) => {
    const x = [1, ...row]
    for (let a = 0; a < k; a += 1) { xty[a]! += w[i]! * x[a]! * y[i]!; for (let b = 0; b < k; b += 1) xtx[a]![b]! += w[i]! * x[a]! * x[b]! }
  })
  const totalWeight = w.reduce((s, v) => s + v, 0)
  for (let a = 1; a < k; a += 1) xtx[a]![a]! += lambda * totalWeight / rows.length
  const beta = solve(xtx, xty)
  let sse = 0
  rows.forEach((row, i) => { const pred = beta[0]! + row.reduce((s, v, j) => s + v * beta[j + 1]!, 0); sse += w[i]! * (y[i]! - pred) ** 2 })
  return { beta, sd: Math.sqrt(sse / totalWeight) }
}

function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1))))]!
}

// ---------- team rates ----------
interface TeamGame { x: Record<string, number>; o: TeamRecord; d: TeamRecord; minutes: number; benchShare: number }

function teamGames(records: readonly MatchRecord[], features: Map<string, BackgroundMatchFeatures>, foulTroubleMinutesPerFoul = 0): TeamGame[] {
  const rows: TeamGame[] = []
  for (const record of records) {
    const f = features.get(record.caseId)!
    const minutes = f.context.regulationMinutes + Math.max(0, record.periods - f.context.periodCount) * f.context.overtimeMinutes
    const bench = (team: BackgroundTeamFeatures): number => {
      const starters = new Set(team.players.filter((p) => p.started).map((p) => p.playerId as string))
      const mine = record.players.filter((p) => p.team === team.teamId)
      const total = mine.reduce((s, p) => s + p.secs, 0)
      const per40 = 40 / f.context.regulationMinutes
      const transfer = mine.filter((p) => starters.has(p.id)).reduce((s, p) => s + Math.min(p.secs, foulTroubleMinutesPerFoul * Math.max(0, p.pf - (f.context.personalFoulLimit - 3)) / per40 * 60), 0)
      return total === 0 ? 0 : Math.max(0, mine.filter((p) => !starters.has(p.id)).reduce((s, p) => s + p.secs, 0) - transfer) / total
    }
    rows.push({ x: rateFeatureVector(f.home, f.away, f.context), o: record.home, d: record.away, minutes, benchShare: bench(f.home) })
    rows.push({ x: rateFeatureVector(f.away, f.home, f.context), o: record.away, d: record.home, minutes, benchShare: bench(f.away) })
  }
  return rows
}

const fga = (t: TeamRecord): number => t.fga.rim + t.fga.mid + t.fga.three
const fgm = (t: TeamRecord): number => t.fgm.rim + t.fgm.mid + t.fgm.three

const TARGETS: Readonly<Record<TeamRate, (g: TeamGame) => { y: number; w: number } | null>> = {
  pace: (g) => ({ y: g.o.poss / g.minutes, w: 1 }),
  turnover: (g) => ({ y: g.o.tov / g.o.poss, w: g.o.poss }),
  freeThrowTrip: (g) => ({ y: (g.o.ftTrips - g.o.andOnes) / g.o.poss, w: g.o.poss }),
  offensiveRebound: (g) => { const misses = fga(g.o) - fgm(g.o); return misses === 0 ? null : { y: g.o.oreb / misses, w: misses } },
  assist: (g) => fgm(g.o) === 0 ? null : { y: g.o.ast / fgm(g.o), w: fgm(g.o) },
  andOne: (g) => fgm(g.o) === 0 ? null : { y: g.o.andOnes / fgm(g.o), w: fgm(g.o) },
  stealShare: (g) => g.o.tov - g.o.offFouls <= 0 ? null : { y: Math.min(1, g.d.stl / (g.o.tov - g.o.offFouls)), w: g.o.tov - g.o.offFouls },
  block: (g) => { const misses2 = g.o.fga.rim + g.o.fga.mid - g.o.fgm.rim - g.o.fgm.mid; return misses2 <= 0 ? null : { y: g.d.blk / misses2, w: misses2 } },
  nonShootingFoul: (g) => ({ y: Math.max(0, g.d.pf - g.d.offFouls - g.o.ftTrips) / g.o.poss, w: g.o.poss }),
  benchShare: (g) => ({ y: g.benchShare, w: 1 }),
}

function fitRates(games: readonly TeamGame[]): Record<TeamRate, LinearRate> {
  const out = {} as Record<TeamRate, LinearRate>
  for (const [rate, target] of Object.entries(TARGETS) as [TeamRate, (g: TeamGame) => { y: number; w: number } | null][]) {
    const rows: number[][] = []
    const y: number[] = []
    const w: number[] = []
    for (const g of games) { const t = target(g); if (t === null) continue; rows.push(RATE_FEATURES.map((name) => g.x[name]!)); y.push(t.y); w.push(t.w) }
    const fit = ridge(rows, y, w, 0.5)
    const coefficients: Record<string, number> = {}
    RATE_FEATURES.forEach((name, j) => { const value = fit.beta[j + 1]!; if (Math.abs(value) > 1e-6) coefficients[name] = round(value, 6) })
    const lo = quantile(y, 0.005)
    const hi = quantile(y, 0.995)
    const span = hi - lo
    const probability = rate !== 'pace'
    out[rate] = { intercept: round(fit.beta[0]!, 6), coefficients, min: round(Math.max(0, lo - 0.25 * span), 5), max: round(probability ? Math.min(1, hi + 0.25 * span) : hi + 0.25 * span, 5), residualSd: round(fit.sd, 6) }
  }
  return out
}

// ---------- player allocations ----------
const ALLOCATION_FEATURES: Readonly<Record<AllocationKind, readonly PlayerFeature[]>> = {
  fieldGoal: ['usage', 'creation', 'shooting', 'rimAttack', 'height', 'creatorGap'],
  freeThrowTrip: ['usage', 'rimAttack', 'creation', 'height', 'creatorGap'],
  offensiveRebound: ['rebounding', 'height', 'rimAttack'],
  defensiveRebound: ['rebounding', 'height', 'interiorDefense'],
  assist: ['passing', 'creation', 'usage', 'creatorGap'],
  turnover: ['usage', 'ballSecurity', 'creation', 'creatorGap'],
  steal: ['steal', 'pointOfAttack', 'mobility'],
  block: ['interiorDefense', 'height', 'rebounding', 'mobility'],
  foul: ['interiorDefense', 'pointOfAttack', 'height', 'mobility'],
}
const COUNT: Readonly<Record<AllocationKind, (p: PlayerRecord) => number>> = {
  fieldGoal: (p) => p.fga.rim + p.fga.mid + p.fga.three, freeThrowTrip: (p) => p.fta,
  offensiveRebound: (p) => p.oreb, defensiveRebound: (p) => p.dreb, assist: (p) => p.ast, turnover: (p) => p.tov, steal: (p) => p.stl, block: (p) => p.blk, foul: (p) => p.pf,
}

interface PlayerGame { p: PlayerRecord; z: Record<PlayerFeature, number>; minutes: number; started: boolean; team: BackgroundTeamFeatures }
function teamPlayerGames(records: readonly MatchRecord[], features: Map<string, BackgroundMatchFeatures>): PlayerGame[][] {
  const groups: PlayerGame[][] = []
  for (const record of records) {
    const f = features.get(record.caseId)!
    for (const team of [f.home, f.away]) {
      const byId = new Map(team.players.map((player) => [player.playerId as string, player]))
      groups.push(record.players.filter((p) => p.team === team.teamId && p.secs > 0).map((p) => ({ p, z: playerFeatureVector(byId.get(p.id)!, team), minutes: p.secs / 60, started: p.started, team })))
    }
  }
  return groups
}

/** Multinomial MLE of betas: p_i proportional to minutes_i * exp(beta . z_i). Newton steps with a small ridge. */
function fitAllocation(groups: readonly PlayerGame[][], names: readonly PlayerFeature[], count: (p: PlayerRecord) => number): Record<string, number> {
  const k = names.length
  let beta = new Array<number>(k).fill(0)
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const grad = new Array<number>(k).fill(0)
    const hess = Array.from({ length: k }, () => new Array<number>(k).fill(0))
    for (const group of groups) {
      const total = group.reduce((s, g) => s + count(g.p), 0)
      if (total === 0) continue
      const weights = group.map((g) => g.minutes * Math.exp(names.reduce((s, name, j) => s + beta[j]! * g.z[name], 0)))
      const sum = weights.reduce((s, v) => s + v, 0)
      const mean = names.map((name) => group.reduce((s, g, i) => s + weights[i]! * g.z[name], 0) / sum)
      group.forEach((g, i) => {
        const c = count(g.p)
        const pi = weights[i]! / sum
        names.forEach((name, a) => {
          grad[a]! += c * g.z[name] - total * pi * g.z[name]
          names.forEach((other, b) => { hess[a]![b]! += total * pi * (g.z[name] - mean[a]!) * (g.z[other] - mean[b]!) })
        })
      })
    }
    for (let a = 0; a < k; a += 1) { hess[a]![a]! += 1; grad[a]! -= beta[a]! }
    const step = solve(hess, grad)
    beta = beta.map((value, a) => value + step[a]!)
    if (step.every((value) => Math.abs(value) < 1e-6)) break
  }
  return Object.fromEntries(names.map((name, j) => [name, round(beta[j]!, 5)]))
}

// ---------- player-level least squares ----------
function slope(xs: readonly number[], ys: readonly number[], ws: readonly number[]): number {
  let num = 0
  let den = 0
  xs.forEach((x, i) => { num += ws[i]! * x * ys[i]!; den += ws[i]! * x * x })
  return den === 0 ? 0 : num / den
}

export function fit(dir: string): BackgroundModelParams {
  // Calibration = the identity cases plus the strength-gap cases (when collected).
  const base = loadCorpus(dir, 'cal')
  const extra = existsSync(`${dir}/cal2.jsonl`) ? loadCorpus(dir, 'cal2') : { records: [], setups: new Map<string, MatchSetup>() }
  const records = [...base.records, ...extra.records]
  const setups = new Map([...base.setups, ...extra.setups])
  const features = new Map([...setups].map(([id, setup]) => [id, deriveBackgroundFeatures(setup)]))
  const firstPass = teamGames(records, features)
  const groups = teamPlayerGames(records, features)
  const allocations = Object.fromEntries((Object.keys(ALLOCATION_FEATURES) as AllocationKind[]).map((kind) => [kind, { betas: fitAllocation(groups, ALLOCATION_FEATURES[kind], COUNT[kind]) }])) as BackgroundModelParams['allocations']

  // Shots bottom-up: zone choice (multinomial logit, mid-range reference) and make probability (logistic) per shooter.
  const shotObs: { x: number[]; fga: { rim: number; mid: number; three: number }; fgm: { rim: number; mid: number; three: number } }[] = []
  for (const record of records) {
    const f = features.get(record.caseId)!
    for (const [team, defense] of [[f.home, f.away], [f.away, f.home]] as const) {
      const byId = new Map(team.players.map((player) => [player.playerId as string, player]))
      for (const p of record.players) {
        if (p.team !== team.teamId || p.fga.rim + p.fga.mid + p.fga.three === 0) continue
        const x = shotFeatureVector(byId.get(p.id)!, team, defense)
        shotObs.push({ x: SHOT_FEATURES.map((name) => x[name]), fga: p.fga, fgm: p.fgm })
      }
    }
  }
  const choice = fitZoneChoice(shotObs)
  const shotMake = {
    rim: fitLogistic(shotObs.map((o) => ({ x: o.x, made: o.fgm.rim, attempts: o.fga.rim }))),
    mid: fitLogistic(shotObs.map((o) => ({ x: o.x, made: o.fgm.mid, attempts: o.fga.mid }))),
    three: fitLogistic(shotObs.map((o) => ({ x: o.x, made: o.fgm.three, attempts: o.fga.three }))),
  }

  // Free throws per non-and-one trip, offensive fouls among turnovers.
  const tripFta = records.reduce((s, r) => s + r.home.fta + r.away.fta - r.home.andOnes - r.away.andOnes, 0)
  const trips = records.reduce((s, r) => s + r.home.ftTrips + r.away.ftTrips - r.home.andOnes - r.away.andOnes, 0)
  const meanTrip = tripFta / trips
  const three = Math.max(0, Math.min(1, meanTrip - 2))
  const one = Math.max(0, Math.min(1, 2 - meanTrip))
  const tripSize = { one: round(one, 5), two: round(1 - one - three, 5), three: round(three, 5) }
  const offensiveFoulShare = round(records.reduce((s, r) => s + r.home.offFouls + r.away.offFouls, 0) / records.reduce((s, r) => s + r.home.tov + r.away.tov, 0), 5)

  // Minutes: how FAST realises the plan (regulation games). Mean = plan^k renormalised (k by least squares); noise sd linear in the plan.
  const teamsMinutes: { plan: number[]; actual: number[]; fouls: number[]; starter: boolean[]; threshold: number; length: number; period: number; target: number; per40: number }[] = []
  const otShares: { expected: number[]; extra: number[] }[] = []
  for (const record of records) {
    const f = features.get(record.caseId)!
    for (const team of [f.home, f.away]) {
      const byId = new Map(record.players.map((p) => [p.id, p]))
      if (record.periods === f.context.periodCount) {
        teamsMinutes.push({ plan: team.players.map((p) => p.expectedMinutes), actual: team.players.map((p) => byId.get(p.playerId)!.secs / 60), fouls: team.players.map((p) => byId.get(p.playerId)!.pf), starter: team.players.map((p) => p.started), threshold: f.context.personalFoulLimit - 3, length: f.context.regulationMinutes, period: f.context.periodMinutes, target: 5 * f.context.regulationMinutes, per40: 40 / f.context.regulationMinutes })
      } else {
        otShares.push({ expected: team.players.map((p) => p.expectedMinutes), extra: team.players.map((p) => Math.max(0, byId.get(p.playerId)!.secs / 60 - p.expectedMinutes)) })
      }
    }
  }
  // Mean minutes within each group (starters, bench) follow the plan; the bench share itself is a fitted team rate.
  const groupMean = (team: (typeof teamsMinutes)[number]): number[] => team.plan.map((plan, i) => {
    const groupPlan = team.plan.reduce((s, other, j) => s + (team.starter[j] === team.starter[i] ? other : 0), 0)
    const groupActual = team.actual.reduce((s, value, j) => s + (team.starter[j] === team.starter[i] ? value : 0), 0)
    return groupPlan === 0 ? 0 : plan / groupPlan * groupActual
  })
  // Foul trouble: minutes (per 40) lost per foul above (limit - 3), by least squares on the residual of players with planned minutes.
  const ftX: number[] = []; const ftY: number[] = []
  for (const team of teamsMinutes) groupMean(team).forEach((mean, i) => {
    if (team.plan[i]! <= 0) return
    const excess = Math.max(0, team.fouls[i]! - team.threshold)
    if (excess > 0) { ftX.push(excess); ftY.push((mean - team.actual[i]!) * team.per40) }
  })
  const foulTroubleMinutesPerFoul = round(Math.max(0, slope(ftX, ftY, ftX.map(() => 1))), 3)
  // |residual| x sqrt(pi/2) estimates the sd of what is left; fit it linearly on the plan (per 40 minutes).
  const sdRows: number[][] = []
  const sdY: number[] = []
  for (const team of teamsMinutes) groupMean(team).forEach((mean, i) => {
    if (team.plan[i]! <= 0) return
    const trouble = foulTroubleMinutesPerFoul * Math.max(0, team.fouls[i]! - team.threshold)
    sdRows.push([team.plan[i]! * team.per40]); sdY.push(Math.abs((team.actual[i]! - mean) * team.per40 + trouble) * Math.sqrt(Math.PI / 2))
  })
  const sdFit = ridgeStandard(sdRows, sdY, sdY.map(() => 1), 0)
  let overtimeExponent = 1
  let bestError = Number.POSITIVE_INFINITY
  for (const k of [0.5, 1, 1.5, 2, 2.5, 3, 4]) {
    let error = 0
    for (const share of otShares) {
      const weights = share.expected.map((e) => e > 0 ? Math.pow(e, k) : 0)
      const ws = weights.reduce((s, v) => s + v, 0)
      const xs = share.extra.reduce((s, v) => s + v, 0)
      if (ws === 0 || xs === 0) continue
      share.extra.forEach((extra, i) => { error += (extra / xs - weights[i]! / ws) ** 2 })
    }
    if (error < bestError) { bestError = error; overtimeExponent = k }
  }

  // Action rates per court minute and session fatigue, on FAST player-games.
  const playerRows = groups.flat()
  const actionRates = {} as Record<(typeof ACTION_RATES)[number], BackgroundModelParams['actionRates'][keyof BackgroundModelParams['actionRates']]>
  const actionFeatures: readonly PlayerFeature[] = ['usage', 'rimAttack', 'shooting', 'creation', 'passing', 'pointOfAttack', 'mobility', 'height', 'rebounding']
  for (const key of ACTION_RATES) {
    const rows = playerRows.map((g) => [...actionFeatures.map((name) => g.z[name]), g.started ? 1 : 0])
    const y = playerRows.map((g) => g.p.counts[key] / g.minutes)
    const fitAction = ridge(rows, y, playerRows.map((g) => g.minutes), 0.5)
    const coefficients: Record<string, number> = {}
    actionFeatures.forEach((name, j) => { coefficients[name] = round(fitAction.beta[j + 1]!, 5) })
    coefficients.started = round(fitAction.beta[actionFeatures.length + 1]!, 5)
    actionRates[key] = { intercept: round(fitAction.beta[0]!, 5), coefficients }
  }
  const interceptionShareOfSteals = round(playerRows.reduce((s, g) => s + g.p.counts.intercept, 0) / Math.max(1, playerRows.reduce((s, g) => s + g.p.stl, 0)), 5)
  const shotActionsPerAttempt = round(playerRows.reduce((s, g) => s + g.p.counts.shootAction, 0) / Math.max(1, playerRows.reduce((s, g) => s + g.p.fga.rim + g.p.fga.mid + g.p.fga.three, 0)), 5)
  // Fatigue: delta = a x court minutes + b x bench minutes + c x event load (no intercept).
  const fatigueRows: number[][] = []
  const fatigueY: number[] = []
  for (const record of records) {
    const f = features.get(record.caseId)!
    const gameMinutes = f.context.regulationMinutes + Math.max(0, record.periods - f.context.periodCount) * f.context.overtimeMinutes
    for (const p of record.players) if (p.secs > 0) { fatigueRows.push([p.secs / 60, gameMinutes - p.secs / 60, p.eventLoad]); fatigueY.push(p.fatigueAfter - p.fatigueBefore) }
  }
  const xtx = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  const xty = [0, 0, 0]
  fatigueRows.forEach((row, i) => { for (let a = 0; a < 3; a += 1) { xty[a]! += row[a]! * fatigueY[i]!; for (let b = 0; b < 3; b += 1) xtx[a]![b]! += row[a]! * row[b]! } })
  const [perCourtMinute, perBenchMinute, perEventLoad] = solve(xtx, xty) as [number, number, number]

  return {
    version: 'bg-v1',
    provenance: {
      reference: 'Match Next FAST (exact lock 4da33d1), WSR1 calibration cases (scripts/world-sim/wsr1Cases.ts calibrationCases + strengthCalibrationCases)',
      matches: records.length, teamGames: firstPass.length, playerGames: playerRows.length, fittedAt: '2026-10-05',
      method: 'weighted ridge (team rates), multinomial MLE (player shares), weighted least squares (make slopes, action rates, fatigue)',
    },
    rates: fitRates(teamGames(records, features, foulTroubleMinutesPerFoul)), allocations, shotChoice: choice, shotMake, tripSize, offensiveFoulShare,
    minutes: { sdIntercept: round(sdFit.beta[0]!, 4), sdSlope: round(sdFit.beta[1]!, 5), foulTroubleMinutesPerFoul, overtimeExponent },
    actionRates, interceptionShareOfSteals, shotActionsPerAttempt,
    fatigue: { perCourtMinute: round(perCourtMinute, 6), perBenchMinute: round(perBenchMinute, 6), perEventLoad: round(perEventLoad, 6) },
  }
}

/** Standardisation of feature columns (centre, unit sd), so one ridge penalty fits every feature alike. */
function standardise(rows: readonly number[][]): { means: number[]; sds: number[]; rows: number[][] } {
  const p = rows[0]!.length
  const means = Array.from({ length: p }, (_, j) => rows.reduce((s, row) => s + row[j]!, 0) / rows.length)
  const sds = Array.from({ length: p }, (_, j) => Math.sqrt(rows.reduce((s, row) => s + (row[j]! - means[j]!) ** 2, 0) / rows.length) || 1)
  return { means, sds, rows: rows.map((row) => row.map((value, j) => (value - means[j]!) / sds[j]!)) }
}

function toEquation(beta: readonly number[], means: readonly number[], sds: readonly number[]): ShotEquation {
  const slopes = beta.slice(1).map((value, j) => value / sds[j]!)
  const coefficients: Record<string, number> = {}
  SHOT_FEATURES.forEach((name, j) => { if (Math.abs(slopes[j]!) > 1e-6) coefficients[name] = round(slopes[j]!, 6) })
  return { intercept: round(beta[0]! - slopes.reduce((s, value, j) => s + value * means[j]!, 0), 6), coefficients }
}

/** Multinomial logit of a shooter's zone (classes mid, rim, three; mid is the reference), Newton with a small ridge, on counts. */
function fitZoneChoice(obs: readonly { x: number[]; fga: { rim: number; mid: number; three: number } }[]): { rim: ShotEquation; three: ShotEquation } {
  const { means, sds, rows } = standardise(obs.map((o) => o.x))
  const k = rows[0]!.length + 1
  let theta = new Array<number>(2 * k).fill(0)
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const grad = new Array<number>(2 * k).fill(0)
    const hess = Array.from({ length: 2 * k }, () => new Array<number>(2 * k).fill(0))
    rows.forEach((row, i) => {
      const x = [1, ...row]
      const counts = [obs[i]!.fga.rim, obs[i]!.fga.three]
      const n = obs[i]!.fga.rim + obs[i]!.fga.mid + obs[i]!.fga.three
      const u = [0, 1].map((c) => x.reduce((s, v, j) => s + v * theta[c * k + j]!, 0))
      const e = u.map(Math.exp)
      const total = 1 + e[0]! + e[1]!
      const prob = [e[0]! / total, e[1]! / total]
      for (let c = 0; c < 2; c += 1) for (let a = 0; a < k; a += 1) {
        grad[c * k + a]! += (counts[c]! - n * prob[c]!) * x[a]!
        for (let d = 0; d < 2; d += 1) for (let b = 0; b < k; b += 1) hess[c * k + a]![d * k + b]! += n * ((c === d ? prob[c]! : 0) - prob[c]! * prob[d]!) * x[a]! * x[b]!
      }
    })
    for (let a = 0; a < 2 * k; a += 1) if (a % k !== 0) { hess[a]![a]! += 1; grad[a]! -= theta[a]! }
    const step = solve(hess, grad)
    theta = theta.map((value, a) => value + step[a]!)
    if (step.every((value) => Math.abs(value) < 1e-7)) break
  }
  return { rim: toEquation(theta.slice(0, k), means, sds), three: toEquation(theta.slice(k), means, sds) }
}

/** Logistic regression of makes on attempts (binomial counts), Newton with a small ridge. */
function fitLogistic(obs: readonly { x: number[]; made: number; attempts: number }[]): ShotEquation {
  const used = obs.filter((o) => o.attempts > 0)
  const { means, sds, rows } = standardise(used.map((o) => o.x))
  const k = rows[0]!.length + 1
  let beta = new Array<number>(k).fill(0)
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const grad = new Array<number>(k).fill(0)
    const hess = Array.from({ length: k }, () => new Array<number>(k).fill(0))
    rows.forEach((row, i) => {
      const x = [1, ...row]
      const p = 1 / (1 + Math.exp(-x.reduce((s, v, j) => s + v * beta[j]!, 0)))
      const o = used[i]!
      for (let a = 0; a < k; a += 1) {
        grad[a]! += (o.made - o.attempts * p) * x[a]!
        for (let b = 0; b < k; b += 1) hess[a]![b]! += o.attempts * p * (1 - p) * x[a]! * x[b]!
      }
    })
    for (let a = 1; a < k; a += 1) { hess[a]![a]! += 1; grad[a]! -= beta[a]! }
    const step = solve(hess, grad)
    beta = beta.map((value, a) => value + step[a]!)
    if (step.every((value) => Math.abs(value) < 1e-7)) break
  }
  return toEquation(beta, means, sds)
}

function round(value: number, digits: number): number { const f = 10 ** digits; return Math.round(value * f) / f }

function main(): void {
  const [dir = 'data', out = 'src/engine/world-sim/background/backgroundModelV1.ts'] = process.argv.slice(2)
  const params = fit(dir)
  writeFileSync(out, `/**
 * WSR1 BACKGROUND model, version ${params.version}. GENERATED by scripts/world-sim/wsr1Fit.ts from the FAST reference corpus; do not edit by
 * hand. Changing these values changes the simulated world's long-run statistics: bump the version instead (saves record which model
 * produced each BACKGROUND result).
 *
 * Provenance: ${params.provenance.reference}.
 * ${params.provenance.matches} FAST matches, ${params.provenance.teamGames} team-games, ${params.provenance.playerGames} player-games. Method: ${params.provenance.method}.
 */
import type { BackgroundModelParams } from './BackgroundModelParams'

export const BACKGROUND_MODEL_V1: BackgroundModelParams = ${JSON.stringify(params, null, 2)}
`)
  console.log(`wrote ${out} from ${params.provenance.matches} matches`)
}

if (process.argv[1]?.includes('fit')) main()
