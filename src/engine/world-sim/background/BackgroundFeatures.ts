import type { PlayerId, TeamId } from '@/domain/ids'
import { lineupRoles, tacticalIntent, type MatchSetup, type OffensiveRole } from '@/engine/match-next'
import { createInitialMatchState } from '@/engine/match-next/state'
import { resolveFoulRules } from '@/engine/match-next/rules/FoulRules'
import { freeThrowProbability } from '@/engine/match-next/rules/FreeThrows'
import type { PlayerFeature, RateFeature, ShotFeature } from './BackgroundModelParams'

/**
 * WSR1 BACKGROUND inputs. Everything here is derived from the canonical MatchSetup that FAST also consumes (availability, the coach's
 * rotation plan, Player profiles, tactical plans, competition rules), never from a separate team rating. The tactical identity is the
 * canonical one: the Match Next intent authority, which already bends the coach's wishes toward what the roster affords.
 *
 * The same functions feed the FAST reference collector, the calibration and the BACKGROUND model, so the three can never disagree on
 * what a feature means.
 */
export interface BackgroundPlayerInput {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly started: boolean
  /** Planned minutes from the canonical rotation plan (regulation). */
  readonly expectedMinutes: number
  readonly usage: number
  readonly rimAttack: number
  readonly shooting: number
  readonly creation: number
  readonly ballSecurity: number
  readonly passing: number
  readonly passingVision: number
  readonly pointOfAttack: number
  readonly interiorDefense: number
  readonly mobility: number
  readonly steal: number
  readonly rebounding: number
  readonly heightCm: number
  /** Match-session fatigue at tip-off (from career fatigue, as FAST does). */
  readonly initialFatigue: number
  readonly preMatchCareerFatigue: number
  /** The canonical free-throw make probability (rules/FreeThrows) at tip-off fatigue. */
  readonly freeThrow: number
  /** Canonical offensive roles in the starting five (Match Next OffensiveRoles); none for the bench. */
  readonly roles: readonly OffensiveRole[]
}

export interface BackgroundTeamFeatures {
  readonly teamId: TeamId
  readonly home: boolean
  readonly players: readonly BackgroundPlayerInput[]
  /** Minutes-weighted means over the planned rotation (ratings 0-100, height in cm). */
  readonly shooting: number
  readonly rimAttack: number
  readonly creation: number
  readonly ballSecurity: number
  readonly passing: number
  readonly rebounding: number
  readonly heightCm: number
  readonly pointOfAttack: number
  readonly interiorDefense: number
  readonly mobility: number
  readonly steal: number
  readonly usage: number
  /** Mean of the offensive and defensive ratings of the bench (non-starters with planned minutes) minus the starters'. */
  readonly benchGap: number
  /** Planned bench share of the minutes. */
  readonly benchMinutesShare: number
  /** The best creator's creation minus the rotation mean: how much one player carries the offense. */
  readonly starCreation: number
  readonly fatigue: number
  /** Canonical tactical intent (coach identity bent toward the roster). */
  readonly tempo: number
  readonly ballMovement: number
  readonly ballScreen: number
  readonly offBall: number
  readonly interior: number
  readonly isolation: number
  readonly crash: number
  readonly pressure: number
  readonly help: number
  readonly dropDepth: number
  readonly familiarity: number
}

export interface BackgroundMatchContext {
  readonly periodCount: number
  readonly periodMinutes: number
  readonly overtimeMinutes: number
  readonly regulationMinutes: number
  readonly shotClockSeconds: number
  readonly personalFoulLimit: number
}

export interface BackgroundMatchFeatures {
  readonly context: BackgroundMatchContext
  readonly home: BackgroundTeamFeatures
  readonly away: BackgroundTeamFeatures
}

export function deriveBackgroundFeatures(setup: MatchSetup): BackgroundMatchFeatures {
  const state = createInitialMatchState(setup)
  const rules = setup.clockRules
  const context: BackgroundMatchContext = {
    periodCount: rules.periodCount,
    periodMinutes: rules.periodSeconds / 60,
    overtimeMinutes: rules.overtimeSeconds / 60,
    regulationMinutes: rules.periodCount * rules.periodSeconds / 60,
    shotClockSeconds: rules.shotClockSeconds,
    personalFoulLimit: resolveFoulRules(rules).personalFoulLimit,
  }
  const team = (side: 'home' | 'away'): BackgroundTeamFeatures => {
    const teamId = side === 'home' ? setup.homeTeamId : setup.awayTeamId
    const squad = side === 'home' ? setup.homeSquad : setup.awaySquad
    const starters = new Set(side === 'home' ? setup.initialLineups.home : setup.initialLineups.away)
    const plan = setup.coachingPlans?.[side]
    const matchPlayers = new Map(state.players.map((player) => [player.playerId, player]))
    const profiles = new Map(setup.players.map((profile) => [profile.playerId, profile]))
    const planned = plannedMinutes(squad, starters, plan?.expectedMinutesByPlayerId, context.regulationMinutes)
    const intent = tacticalIntent(state, teamId)
    const startingRoles = lineupRoles(state, teamId, intent).byPlayer
    const players = squad.map((playerId): BackgroundPlayerInput => {
      const profile = profiles.get(playerId)!
      const matchPlayer = matchPlayers.get(playerId)!
      return {
        playerId, teamId, started: starters.has(playerId), expectedMinutes: planned.get(playerId) ?? 0,
        usage: profile.offense.usage, rimAttack: profile.offense.rimAttack, shooting: profile.offense.shooting, creation: profile.offense.creation,
        ballSecurity: profile.offense.ballSecurity, passing: (matchPlayer.passing.accuracy + matchPlayer.passing.vision) / 2, passingVision: matchPlayer.passing.vision,
        pointOfAttack: profile.defense.pointOfAttack, interiorDefense: profile.defense.interior, mobility: profile.defense.mobility, steal: profile.defense.steal ?? 50,
        rebounding: profile.rebounding.impact, heightCm: profile.physical.heightCm,
        initialFatigue: matchPlayer.initialFatigue, preMatchCareerFatigue: matchPlayer.preMatchCareerFatigue, freeThrow: freeThrowProbability(matchPlayer),
        roles: starters.has(playerId) ? startingRoles[playerId] ?? [] : [],
      }
    })
    const total = players.reduce((sum, player) => sum + player.expectedMinutes, 0)
    const mean = (pick: (player: BackgroundPlayerInput) => number, pool: readonly BackgroundPlayerInput[] = players): number => {
      const weight = pool.reduce((sum, player) => sum + player.expectedMinutes, 0)
      return weight === 0 ? 0 : pool.reduce((sum, player) => sum + pick(player) * player.expectedMinutes, 0) / weight
    }
    const overall = (player: BackgroundPlayerInput): number => (player.shooting + player.rimAttack + player.creation + player.ballSecurity + player.passing
      + player.pointOfAttack + player.interiorDefense + player.mobility + player.rebounding) / 9
    const bench = players.filter((player) => !player.started && player.expectedMinutes > 0)
    const starting = players.filter((player) => player.started)
    const creation = mean((player) => player.creation)
    return {
      teamId, home: side === 'home', players,
      shooting: mean((p) => p.shooting), rimAttack: mean((p) => p.rimAttack), creation, ballSecurity: mean((p) => p.ballSecurity), passing: mean((p) => p.passing),
      rebounding: mean((p) => p.rebounding), heightCm: mean((p) => p.heightCm), pointOfAttack: mean((p) => p.pointOfAttack), interiorDefense: mean((p) => p.interiorDefense),
      mobility: mean((p) => p.mobility), steal: mean((p) => p.steal), usage: mean((p) => p.usage),
      benchGap: bench.length === 0 ? 0 : mean(overall, bench) - mean(overall, starting),
      benchMinutesShare: total === 0 ? 0 : bench.reduce((sum, player) => sum + player.expectedMinutes, 0) / total,
      starCreation: Math.max(...players.filter((player) => player.expectedMinutes > 0).map((player) => player.creation)) - creation,
      fatigue: mean((p) => p.initialFatigue),
      tempo: intent.offense.tempo, ballMovement: intent.offense.ballMovement, ballScreen: intent.offense.ballScreen, offBall: intent.offense.offBall,
      interior: intent.offense.interior, isolation: intent.offense.isolation, crash: intent.offense.crash,
      pressure: intent.defense.pressure, help: intent.defense.help, dropDepth: intent.defense.dropDepth, familiarity: intent.familiarity,
    }
  }
  return { context, home: team('home'), away: team('away') }
}

/**
 * Planned regulation minutes: the canonical rotation plan's expected minutes, rescaled to exactly five players x game length. Without
 * a plan (test setups), the starters share the game with the first bench players, as a coach would.
 */
function plannedMinutes(squad: readonly PlayerId[], starters: ReadonlySet<PlayerId>, expected: Readonly<Partial<Record<PlayerId, number>>> | undefined, regulationMinutes: number): Map<PlayerId, number> {
  const raw = new Map<PlayerId, number>()
  for (const playerId of squad) {
    const planned = expected?.[playerId]
    raw.set(playerId, planned !== undefined ? Math.max(0, planned) : starters.has(playerId) ? 0.8 : 0.2)
  }
  const sum = [...raw.values()].reduce((total, value) => total + value, 0)
  const target = 5 * regulationMinutes
  return new Map([...raw].map(([playerId, value]) => [playerId, sum === 0 ? 0 : value * target / sum]))
}

/** Ratings are centred on 60 and scaled by 10; heights on 195 cm by 10 cm; intents are used as they are (-1..1 or 0..1). */
const rating = (value: number): number => (value - 60) / 10
const height = (value: number): number => (value - 195) / 10

/** The team-rate features of `offense` attacking `defense` (the same vector feeds every team rate). */
export function rateFeatureVector(offense: BackgroundTeamFeatures, defense: BackgroundTeamFeatures, context: BackgroundMatchContext): Record<RateFeature, number> {
  return {
    o_shoot: rating(offense.shooting), o_rim: rating(offense.rimAttack), o_create: rating(offense.creation), o_secure: rating(offense.ballSecurity),
    o_pass: rating(offense.passing), o_reb: rating(offense.rebounding), o_height: height(offense.heightCm), o_usage: rating(offense.usage),
    o_star: offense.starCreation / 10, o_bench: offense.benchGap / 10, o_fatigue: offense.fatigue / 10,
    d_poa: rating(defense.pointOfAttack), d_int: rating(defense.interiorDefense), d_mob: rating(defense.mobility), d_steal: rating(defense.steal),
    d_reb: rating(defense.rebounding), d_height: height(defense.heightCm), d_bench: defense.benchGap / 10,
    o_tempo: offense.tempo, o_ballMovement: offense.ballMovement, o_ballScreen: offense.ballScreen, o_offBall: offense.offBall, o_interior: offense.interior,
    o_isolation: offense.isolation, o_crash: offense.crash, o_familiarity: offense.familiarity,
    d_tempo: defense.tempo, d_pressure: defense.pressure, d_help: defense.help, d_dropDepth: defense.dropDepth, d_familiarity: defense.familiarity,
    home: offense.home ? 1 : 0, shotClock: (context.shotClockSeconds - 24) / 6,
    o_planBench: offense.benchMinutesShare * 10, periodLength: (context.periodMinutes - 10) / 10,
  }
}

/** A player's allocation features, centred on his team's minutes-weighted mean (so they say who takes the team's events, not how many). */
export function playerFeatureVector(player: BackgroundPlayerInput, team: BackgroundTeamFeatures): Record<PlayerFeature, number> {
  return {
    usage: (player.usage - team.usage) / 10, rimAttack: (player.rimAttack - team.rimAttack) / 10, shooting: (player.shooting - team.shooting) / 10,
    creation: (player.creation - team.creation) / 10, ballSecurity: (player.ballSecurity - team.ballSecurity) / 10, passing: (player.passing - team.passing) / 10,
    pointOfAttack: (player.pointOfAttack - team.pointOfAttack) / 10, interiorDefense: (player.interiorDefense - team.interiorDefense) / 10,
    mobility: (player.mobility - team.mobility) / 10, steal: (player.steal - team.steal) / 10, rebounding: (player.rebounding - team.rebounding) / 10,
    height: (player.heightCm - team.heightCm) / 10,
    creatorGap: (creatorScore(player) - Math.max(...team.players.filter((other) => other.expectedMinutes > 0).map(creatorScore))) / 10,
  }
}

/** Match Next's creator score (tactics/TacticalIdentity), on BACKGROUND inputs: who the offense runs through. */
function creatorScore(player: BackgroundPlayerInput): number {
  return 0.4 * player.creation + 0.25 * player.ballSecurity + 0.2 * player.passingVision + 0.15 * player.rimAttack
}

const role = (player: BackgroundPlayerInput, name: OffensiveRole): number => player.roles.includes(name) ? 1 : 0

/** A shooter's features for zone choice and make probability: his own skills, his team's intent, the opposing defense. */
export function shotFeatureVector(player: BackgroundPlayerInput, team: BackgroundTeamFeatures, defense: BackgroundTeamFeatures): Record<ShotFeature, number> {
  return {
    p_level: rating((player.shooting + player.rimAttack + player.creation + player.usage) / 4), p_shootTilt: (player.shooting - player.rimAttack) / 10,
    p_createTilt: (player.creation - (player.shooting + player.rimAttack + player.creation + player.usage) / 4) / 10,
    p_height: height(player.heightCm), p_fatigue: player.initialFatigue / 10, p_starter: player.started ? 1 : 0,
    r_primary: role(player, 'PRIMARY_CREATOR'), r_secondary: role(player, 'SECONDARY_CREATOR'), r_spacer: role(player, 'SPACER'), r_movement: role(player, 'MOVEMENT_SHOOTER'),
    r_cutter: role(player, 'CUTTER'), r_screener: role(player, 'SCREENER'), r_roller: role(player, 'ROLLER'), r_popper: role(player, 'POPPER'), r_interior: role(player, 'INTERIOR_TARGET'),
    t_interior: team.interior, t_ballMovement: team.ballMovement, t_tempo: team.tempo, t_offBall: team.offBall, t_ballScreen: team.ballScreen, t_isolation: team.isolation,
    d_int: rating(defense.interiorDefense), d_poa: rating(defense.pointOfAttack), d_mob: rating(defense.mobility), d_height: height(defense.heightCm),
    d_help: defense.help, d_dropDepth: defense.dropDepth, d_pressure: defense.pressure, home: team.home ? 1 : 0,
  }
}
