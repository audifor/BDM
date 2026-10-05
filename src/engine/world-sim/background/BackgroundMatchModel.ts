import type { PlayerId, TeamId } from '@/domain/ids'
import type { PlayerGameStatsSnapshot } from '@/domain/stats/MatchStatLog'
import { hashStringToSeed } from '@/engine/random'
import type { MatchSetup } from '@/engine/match-next'
import { deriveBackgroundFeatures, playerFeatureVector, rateFeatureVector, shotFeatureVector, type BackgroundMatchContext, type BackgroundPlayerInput, type BackgroundTeamFeatures } from './BackgroundFeatures'
import { ACTION_RATES, type ActionRate, type AllocationKind, type BackgroundModelParams, type LinearRate, type ShotEquation, type TeamRate } from './BackgroundModelParams'
import { BACKGROUND_MODEL_V1 } from './backgroundModelV1'

/**
 * WSR1 BACKGROUND match resolution (World Simulation, not MatchEngine basketball authority).
 *
 * The match is resolved at the level of possession outcomes, never of space, time or decisions:
 *   canonical setup -> team features (players, planned rotation, canonical tactical intent)
 *   -> rates of each offense against the other defense (fitted on FAST) -> possessions realised as outcome counts
 *   -> every event credited to a player through fitted skill shares x minutes -> box score, minutes, fouls, load.
 * Team totals are sums of player lines by construction. Deterministic for (model version, setup, seed).
 */
export const BACKGROUND_ENGINE = 'background' as const

export interface BackgroundTeamStats {
  readonly possessions: number
  readonly fieldGoalsByZone: { readonly rim: { readonly made: number; readonly attempted: number }; readonly mid: { readonly made: number; readonly attempted: number }; readonly three: { readonly made: number; readonly attempted: number } }
  readonly freeThrowTrips: number
}

export interface BackgroundPlayerLoad {
  readonly playerId: PlayerId
  readonly minutes: number
  readonly preMatchCareerFatigue: number
  readonly matchFatigueBefore: number
  readonly matchFatigueAfter: number
  /** Expected FAST event load (the weighted actions behind session fatigue). */
  readonly eventLoad: number
  /** Expected counts of the actions FAST rewards with development stimulus. */
  readonly actions: Readonly<Record<ActionRate | 'shot3' | 'shot2' | 'rebounds' | 'offensiveRebounds' | 'defensiveRebounds' | 'interceptions', number>>
}

export interface BackgroundMatchResult {
  readonly engine: typeof BACKGROUND_ENGINE
  readonly modelVersion: string
  readonly gameId: MatchSetup['gameId']
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly matchSeed: number
  readonly score: { readonly home: number; readonly away: number }
  readonly periods: number
  readonly starters: { readonly home: readonly PlayerId[]; readonly away: readonly PlayerId[] }
  readonly squads: { readonly home: readonly PlayerId[]; readonly away: readonly PlayerId[] }
  readonly playerStats: readonly PlayerGameStatsSnapshot[]
  readonly teamDetail: { readonly home: BackgroundTeamStats; readonly away: BackgroundTeamStats }
  readonly playerLoad: readonly BackgroundPlayerLoad[]
}

/**
 * Regulation minutes as FAST realises the coach's plan: the bench plays the fitted share of the team's minutes; within the starters and
 * within the bench, minutes follow the plan, with game noise; five players x regulation exactly, never past the full game.
 */
export function realizeMinutes(expected: readonly number[], starter: readonly boolean[], regulationMinutes: number, benchShare: number, params: BackgroundModelParams['minutes'], random: () => number): number[] {
  const target = 5 * regulationMinutes
  const per40 = 40 / regulationMinutes
  const plannedBench = expected.reduce((sum, plan, index) => sum + (starter[index] ? 0 : plan), 0)
  const plannedStarters = expected.reduce((sum, plan, index) => sum + (starter[index] ? plan : 0), 0)
  const bench = plannedBench > 0 ? benchShare : 0
  const raw = expected.map((plan, index) => {
    if (plan <= 0) return 0
    const groupTotal = starter[index] ? plannedStarters : plannedBench
    const mean = groupTotal <= 0 ? 0 : plan / groupTotal * target * (starter[index] ? 1 - bench : bench)
    const sd = (params.sdIntercept + params.sdSlope * plan * per40) / per40
    return Math.max(0, mean + sd * normal(random))
  })
  // Each group gets exactly its share (the noise moves minutes inside the group, not between starters and bench).
  const groupRaw = (isStarter: boolean) => raw.reduce((sum, value, index) => sum + (starter[index] === isStarter ? value : 0), 0)
  const starterRaw = groupRaw(true)
  const benchRaw = groupRaw(false)
  const benchTarget = benchRaw > 0 ? bench * target : 0
  const starterTarget = target - benchTarget
  const minutes = raw.map((value, index) => {
    const total = starter[index] ? starterRaw : benchRaw
    return total <= 0 ? 0 : Math.min(regulationMinutes, value * (starter[index] ? starterTarget : benchTarget) / total)
  })
  // A player cannot exceed the full game; give any excess to the others in proportion.
  for (let pass = 0; pass < 4; pass += 1) {
    const sum = minutes.reduce((total, value) => total + value, 0)
    const free = minutes.map((value, index) => value < regulationMinutes && raw[index]! > 0 ? value : 0)
    const freeSum = free.reduce((total, value) => total + value, 0)
    if (Math.abs(sum - target) < 1e-9 || freeSum === 0) break
    for (let index = 0; index < minutes.length; index += 1) if (free[index]! > 0) minutes[index] = Math.min(regulationMinutes, minutes[index]! + (target - sum) * free[index]! / freeSum)
  }
  return minutes
}

/** Deterministic uniform stream for one BACKGROUND match (mulberry32 on a seed tied to the model version). */
export function stream(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b_79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000
  }
}

function normal(random: () => number): number {
  const u = Math.max(1e-12, random())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random())
}

function linear(equation: ShotEquation, features: Readonly<Record<string, number>>): number {
  let value = equation.intercept
  for (const key in equation.coefficients) value += equation.coefficients[key as keyof typeof equation.coefficients]! * (features[key] ?? 0)
  return value
}

function logistic(value: number): number { return 1 / (1 + Math.exp(-value)) }

function predict(rate: LinearRate, features: Readonly<Record<string, number>>): number {
  let value = rate.intercept
  for (const key in rate.coefficients) value += rate.coefficients[key as keyof typeof rate.coefficients]! * (features[key] ?? 0)
  return Math.max(rate.min, Math.min(rate.max, value))
}

interface Sampler { readonly ids: readonly number[]; readonly cumulative: readonly number[] }
/** A categorical sampler over player indexes, excluding nobody; `pick` can exclude one index (an assister is not the shooter). */
function sampler(weights: readonly number[]): Sampler {
  const ids: number[] = []
  const cumulative: number[] = []
  let total = 0
  weights.forEach((weight, index) => { if (weight > 0) { total += weight; ids.push(index); cumulative.push(total) } })
  return { ids, cumulative }
}
function pick(s: Sampler, random: () => number, exclude = -1): number {
  const total = s.cumulative[s.cumulative.length - 1] ?? 0
  if (total <= 0) return s.ids[0] ?? 0
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const roll = random() * total
    let lo = 0
    let hi = s.cumulative.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (s.cumulative[mid]! > roll) hi = mid; else lo = mid + 1 }
    const chosen = s.ids[lo]!
    if (chosen !== exclude || s.ids.length === 1) return chosen
  }
  return s.ids.find((id) => id !== exclude) ?? s.ids[0]!
}

type Line = { -readonly [K in keyof PlayerGameStatsSnapshot]: PlayerGameStatsSnapshot[K] } & { rimA: number; rimM: number; midA: number; midM: number; tripsDrawn: number }
const emptyLine = (playerId: PlayerId): Line => ({ playerId, secondsPlayed: 0, points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0, twoPointMade: 0, twoPointAttempted: 0, threePointMade: 0, threePointAttempted: 0, freeThrowsMade: 0, freeThrowsAttempted: 0, offensiveRebounds: 0, defensiveRebounds: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, foulsCommitted: 0, plusMinus: 0, rimA: 0, rimM: 0, midA: 0, midM: 0, tripsDrawn: 0 })

interface TeamRun {
  readonly features: BackgroundTeamFeatures
  readonly players: readonly BackgroundPlayerInput[]
  readonly lines: Line[]
  /** Realised regulation minutes per player (index-aligned with players). */
  minutes: number[]
  readonly samplers: Record<AllocationKind, Sampler>
  /** Per player: probability of each zone, and of making a shot from it (against this defense). */
  readonly zone: readonly { readonly rim: number; readonly three: number }[]
  readonly make: readonly { readonly rim: number; readonly mid: number; readonly three: number }[]
  readonly rates: Record<TeamRate, number>
  points: number
  possessions: number
  trips: number
  fouls: number[]
}

export function simulateBackgroundMatch(setup: MatchSetup, params: BackgroundModelParams = BACKGROUND_MODEL_V1): BackgroundMatchResult {
  const features = deriveBackgroundFeatures(setup)
  const random = stream(hashStringToSeed(`world-sim-background-${params.version}:${setup.matchSeed}:${setup.gameId}`))
  const context = features.context
  const home = prepareTeam(features.home, features.away, context, params, random)
  const away = prepareTeam(features.away, features.home, context, params, random)
  // Pace: both teams' tendencies set the game's possessions per minute (one realised pace for the game, as FAST alternates possessions).
  const pace = (home.rates.pace + away.rates.pace) / 2
  const paceNoise = 1 + normal(random) * params.rates.pace.residualSd / Math.max(1e-6, params.rates.pace.intercept)

  const playPeriod = (minutes: number): void => {
    const expected = pace * paceNoise * minutes
    const base = Math.max(1, Math.floor(expected))
    const homeFirst = random() < 0.5
    const extra = expected - base > random() ? 1 : 0
    const homePossessions = base + (extra === 1 && homeFirst ? 1 : 0)
    const awayPossessions = base + (extra === 1 && !homeFirst ? 1 : 0)
    // Interleave possessions so neither team's run of events clusters (order affects only which random numbers each consumes).
    for (let index = 0; index < Math.max(homePossessions, awayPossessions); index += 1) {
      if (index < homePossessions) playPossession(home, away, params, context, random)
      if (index < awayPossessions) playPossession(away, home, params, context, random)
    }
  }
  playPeriod(context.regulationMinutes)
  let periods = context.periodCount
  const overtimeMinutes: number[] = []
  while (home.points === away.points) {
    periods += 1
    if (periods - context.periodCount > 6) {
      // Six overtimes without a winner: one more possession each until someone leads (keeps the competition contract: no ties).
      playPossession(random() < 0.5 ? home : away, random() < 0.5 ? away : home, params, context, random)
      continue
    }
    overtimeMinutes.push(context.overtimeMinutes)
    playPeriod(context.overtimeMinutes)
  }
  const totalOvertime = overtimeMinutes.reduce((sum, value) => sum + value, 0)
  const margin = home.points - away.points
  const homeStats = finishTeam(home, totalOvertime, margin, context, params)
  const awayStats = finishTeam(away, totalOvertime, -margin, context, params)
  return {
    engine: BACKGROUND_ENGINE, modelVersion: params.version, gameId: setup.gameId, homeTeamId: setup.homeTeamId, awayTeamId: setup.awayTeamId, matchSeed: setup.matchSeed,
    score: { home: home.points, away: away.points }, periods,
    starters: { home: [...setup.initialLineups.home], away: [...setup.initialLineups.away] },
    squads: { home: [...setup.homeSquad], away: [...setup.awaySquad] },
    playerStats: [...homeStats.lines, ...awayStats.lines],
    teamDetail: { home: homeStats.detail, away: awayStats.detail },
    playerLoad: [...homeStats.load, ...awayStats.load],
  }
}

function prepareTeam(team: BackgroundTeamFeatures, opponent: BackgroundTeamFeatures, context: BackgroundMatchContext, params: BackgroundModelParams, random: () => number): TeamRun {
  const players = team.players
  const vector = rateFeatureVector(team, opponent, context)
  const rates = {} as Record<TeamRate, number>
  for (const key of Object.keys(params.rates) as TeamRate[]) rates[key] = predict(params.rates[key], vector)
  const benchShare = Math.max(params.rates.benchShare.min, Math.min(params.rates.benchShare.max, rates.benchShare + normal(random) * params.rates.benchShare.residualSd))
  const minutes = realizeMinutes(players.map((player) => player.expectedMinutes), players.map((player) => player.started), context.regulationMinutes, benchShare, params.minutes, random)
  const vectors = players.map((player) => playerFeatureVector(player, team))
  const allocation = (kind: AllocationKind): Sampler => {
    const betas = params.allocations[kind].betas
    return sampler(players.map((_, index) => {
      if (minutes[index]! <= 0) return 0
      let exponent = 0
      for (const key in betas) exponent += betas[key as keyof typeof betas]! * vectors[index]![key as keyof (typeof vectors)[number]]
      return minutes[index]! * Math.exp(exponent)
    }))
  }
  const samplers = {
    fieldGoal: allocation('fieldGoal'), freeThrowTrip: allocation('freeThrowTrip'),
    offensiveRebound: allocation('offensiveRebound'), defensiveRebound: allocation('defensiveRebound'), assist: allocation('assist'), turnover: allocation('turnover'),
    steal: allocation('steal'), block: allocation('block'), foul: allocation('foul'),
  }
  // Each player's shot profile and accuracy against this defense (bottom-up: the team's profile is its shooters').
  const shotVectors = players.map((player) => shotFeatureVector(player, team, opponent))
  const zone = shotVectors.map((x) => {
    const rim = Math.exp(linear(params.shotChoice.rim, x))
    const three = Math.exp(linear(params.shotChoice.three, x))
    const total = 1 + rim + three
    return { rim: rim / total, three: three / total }
  })
  const make = shotVectors.map((x) => ({ rim: logistic(linear(params.shotMake.rim, x)), mid: logistic(linear(params.shotMake.mid, x)), three: logistic(linear(params.shotMake.three, x)) }))
  // Each team-game draws its own deviation from the fitted means of its most variable rates (FAST games differ in more than luck per shot).
  for (const key of ['turnover', 'offensiveRebound'] as const) {
    const rate = params.rates[key]
    rates[key] = Math.max(rate.min, Math.min(rate.max, rates[key] + normal(random) * rate.residualSd * 0.5))
  }
  return {
    features: team, players, lines: players.map((player) => emptyLine(player.playerId)), minutes, samplers,
    zone, make,
    rates, points: 0, possessions: 0, trips: 0, fouls: players.map(() => 0),
  }
}

/** Credits a foul to a defender, moving it to a team-mate when the foul limit would be passed (no fouled-out player fouls again). */
function creditFoul(team: TeamRun, random: () => number, limit: number): void {
  let index = pick(team.samplers.foul, random)
  if (team.fouls[index]! >= limit) {
    const open = team.players.map((_, i) => i).filter((i) => team.fouls[i]! < limit && team.minutes[i]! > 0)
    if (open.length > 0) index = open[Math.floor(random() * open.length)]!
  }
  team.fouls[index]! += 1
  team.lines[index]!.foulsCommitted += 1
}

function shootFreeThrows(team: TeamRun, shooter: number, count: number, random: () => number): void {
  const line = team.lines[shooter]!
  const probability = team.players[shooter]!.freeThrow
  for (let index = 0; index < count; index += 1) {
    line.freeThrowsAttempted += 1
    if (random() < probability) { line.freeThrowsMade += 1; line.points += 1; team.points += 1 }
  }
}

function playPossession(offense: TeamRun, defense: TeamRun, params: BackgroundModelParams, context: BackgroundMatchContext, random: () => number): void {
  offense.possessions += 1
  const r = offense.rates
  if (random() < r.nonShootingFoul) creditFoul(defense, random, context.personalFoulLimit)
  const roll = random()
  if (roll < r.turnover) {
    const loser = pick(offense.samplers.turnover, random)
    offense.lines[loser]!.turnovers += 1
    // An offensive foul by a player already at the limit cannot happen (he would have fouled out): it is an ordinary turnover.
    if (random() < params.offensiveFoulShare && offense.fouls[loser]! < context.personalFoulLimit) {
      offense.fouls[loser]! += 1
      offense.lines[loser]!.foulsCommitted += 1
    } else if (random() < r.stealShare) {
      defense.lines[pick(defense.samplers.steal, random)]!.steals += 1
    }
    return
  }
  if (roll < r.turnover + r.freeThrowTrip) {
    const shooter = pick(offense.samplers.freeThrowTrip, random)
    creditFoul(defense, random, context.personalFoulLimit)
    const size = random()
    offense.trips += 1
    offense.lines[shooter]!.tripsDrawn += 1
    shootFreeThrows(offense, shooter, size < params.tripSize.one ? 1 : size < params.tripSize.one + params.tripSize.two ? 2 : 3, random)
    return
  }
  // A shot, and another after each offensive rebound.
  for (let chain = 0; chain < 6; chain += 1) {
    const shooter = pick(offense.samplers.fieldGoal, random)
    const line = offense.lines[shooter]!
    const z = random()
    const profile = offense.zone[shooter]!
    const zone = z < profile.rim ? 'rim' : z < profile.rim + profile.three ? 'three' : 'mid'
    const made = random() < offense.make[shooter]![zone]
    line.fieldGoalsAttempted += 1
    if (zone === 'three') line.threePointAttempted += 1; else line.twoPointAttempted += 1
    if (zone === 'rim') line.rimA += 1
    if (zone === 'mid') line.midA += 1
    if (made) {
      const points = zone === 'three' ? 3 : 2
      line.fieldGoalsMade += 1
      if (zone === 'three') line.threePointMade += 1; else line.twoPointMade += 1
      if (zone === 'rim') line.rimM += 1
      if (zone === 'mid') line.midM += 1
      line.points += points
      offense.points += points
      if (random() < r.assist) offense.lines[pick(offense.samplers.assist, random, shooter)]!.assists += 1
      if (random() < r.andOne) {
        creditFoul(defense, random, context.personalFoulLimit)
        offense.trips += 1
        shootFreeThrows(offense, shooter, 1, random)
      }
      return
    }
    if (zone !== 'three' && random() < r.block) defense.lines[pick(defense.samplers.block, random)]!.blocks += 1
    if (random() < r.offensiveRebound) {
      const rebounder = offense.lines[pick(offense.samplers.offensiveRebound, random)]!
      rebounder.offensiveRebounds += 1
      rebounder.rebounds += 1
      continue
    }
    const rebounder = defense.lines[pick(defense.samplers.defensiveRebound, random)]!
    rebounder.defensiveRebounds += 1
    rebounder.rebounds += 1
    return
  }
}

interface FinishedTeam { readonly lines: PlayerGameStatsSnapshot[]; readonly detail: BackgroundTeamStats; readonly load: BackgroundPlayerLoad[] }

function finishTeam(team: TeamRun, overtimeMinutes: number, margin: number, context: BackgroundMatchContext, params: BackgroundModelParams): FinishedTeam {
  applyFoulTrouble(team, context, params)
  // Overtime minutes go mostly to the players the coach trusts most (planned minutes ^ exponent).
  const otWeights = team.players.map((player, index) => team.minutes[index]! > 0 ? Math.pow(player.expectedMinutes, params.minutes.overtimeExponent) : 0)
  const otTotal = otWeights.reduce((sum, value) => sum + value, 0)
  const minutes = team.minutes.map((value, index) => value + (otTotal === 0 ? 0 : 5 * overtimeMinutes * otWeights[index]! / otTotal))
  const seconds = wholeSeconds(minutes, Math.round(5 * (context.regulationMinutes + overtimeMinutes) * 60))
  const plusMinus = wholeShares(minutes, 5 * margin)
  const gameMinutes = context.regulationMinutes + overtimeMinutes
  const lines: PlayerGameStatsSnapshot[] = []
  const load: BackgroundPlayerLoad[] = []
  const rim = { made: 0, attempted: 0 }
  const mid = { made: 0, attempted: 0 }
  const three = { made: 0, attempted: 0 }
  team.players.forEach((player, index) => {
    const line = team.lines[index]!
    rim.made += line.rimM; rim.attempted += line.rimA; mid.made += line.midM; mid.attempted += line.midA; three.made += line.threePointMade; three.attempted += line.threePointAttempted
    const { rimA: _ra, rimM: _rm, midA: _ma, midM: _mm, tripsDrawn: _td, ...stats } = line
    lines.push({ ...stats, secondsPlayed: seconds[index]!, plusMinus: plusMinus[index]! })
    const played = seconds[index]! / 60
    const actions = {} as Record<ActionRate, number>
    for (const key of ACTION_RATES) {
      const rate = params.actionRates[key]
      let perMinute = rate.intercept + (rate.coefficients.started ?? 0) * (player.started ? 1 : 0)
      const vector = playerFeatureVector(player, team.features)
      for (const feature in rate.coefficients) if (feature !== 'started') perMinute += rate.coefficients[feature as keyof typeof rate.coefficients]! * vector[feature as keyof typeof vector]
      actions[key] = Math.max(0, perMinute) * played
    }
    const interceptions = line.steals * params.interceptionShareOfSteals
    const counts = { ...actions, shot3: line.threePointAttempted, shot2: line.twoPointAttempted, rebounds: line.rebounds, offensiveRebounds: line.offensiveRebounds, defensiveRebounds: line.defensiveRebounds, interceptions }
    // The same per-event loads as Match Next's matchEventFatigueIncrement, applied to expected counts.
    const eventLoad = actions.drive * 0.16 + actions.screen * 0.12 + line.fieldGoalsAttempted * params.shotActionsPerAttempt * 0.06 + actions.passAction * 0.035
      + line.fieldGoalsAttempted * 0.035 + line.rebounds * 0.08 + (interceptions + actions.looseRecovered) * 0.06 + actions.defResp * 0.015
    const before = player.initialFatigue
    const after = played <= 0 ? before : Math.max(0, Math.min(100, before + params.fatigue.perCourtMinute * played + params.fatigue.perBenchMinute * (gameMinutes - played) + params.fatigue.perEventLoad * eventLoad))
    load.push({ playerId: player.playerId, minutes: played, preMatchCareerFatigue: player.preMatchCareerFatigue, matchFatigueBefore: before, matchFatigueAfter: after, eventLoad, actions: counts })
  })
  return { lines, detail: { possessions: team.possessions, fieldGoalsByZone: { rim, mid, three }, freeThrowTrips: team.trips }, load }
}

/**
 * Foul trouble (fitted on FAST): a player loses minutes for every foul above (limit - 3); the minutes go to team-mates who are not in
 * foul trouble, in proportion to their minutes and never past the full game.
 */
function applyFoulTrouble(team: TeamRun, context: BackgroundMatchContext, params: BackgroundModelParams): void {
  const per40 = 40 / context.regulationMinutes
  const threshold = context.personalFoulLimit - 3
  let moved = 0
  const troubled = team.minutes.map((_, index) => team.fouls[index]! > threshold)
  team.minutes = team.minutes.map((minutes, index) => {
    if (!troubled[index]) return minutes
    const loss = Math.min(minutes, params.minutes.foulTroubleMinutesPerFoul * (team.fouls[index]! - threshold) / per40)
    moved += loss
    return minutes - loss
  })
  for (let pass = 0; pass < 4 && moved > 1e-9; pass += 1) {
    const room = team.minutes.map((minutes, index) => !troubled[index] && minutes > 0 ? Math.max(0, context.regulationMinutes - minutes) : 0)
    const weights = team.minutes.map((minutes, index) => room[index]! > 0 ? minutes : 0)
    const total = weights.reduce((sum, value) => sum + value, 0)
    if (total <= 0) break
    let given = 0
    team.minutes = team.minutes.map((minutes, index) => { const add = Math.min(room[index]!, moved * weights[index]! / total); given += add; return minutes + add })
    moved -= given
  }
  if (moved > 1e-9) team.minutes = team.minutes.map((minutes, index) => troubled[index] ? minutes + moved * minutes / Math.max(1e-9, team.minutes.filter((_, i) => troubled[i]).reduce((a, b) => a + b, 0)) : minutes)
}

/** Integer seconds per player by largest remainder, summing to the team's court time exactly. */
function wholeSeconds(minutes: readonly number[], total: number): number[] {
  return wholeShares(minutes, total, (value) => value * 60)
}

/** Integer shares of `total` proportional to `weights` (largest remainder; sign of total kept). */
function wholeShares(weights: readonly number[], total: number, scale: (value: number) => number = (value) => value): number[] {
  const scaled = weights.map(scale)
  const sum = scaled.reduce((acc, value) => acc + value, 0)
  if (sum <= 0) return weights.map(() => 0)
  const sign = total < 0 ? -1 : 1
  const exact = scaled.map((value) => Math.abs(total) * value / sum)
  const floors = exact.map(Math.floor)
  let missing = Math.abs(total) - floors.reduce((acc, value) => acc + value, 0)
  const order = exact.map((value, index) => ({ index, remainder: value - floors[index]! })).sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const item of order) { if (missing <= 0) break; floors[item.index]! += 1; missing -= 1 }
  return floors.map((value) => value === 0 ? 0 : value * sign)
}
