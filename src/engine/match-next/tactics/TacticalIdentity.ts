import type { TeamId } from '@/domain/ids'
import type { MatchNextTacticalPlan } from '../setup'
import type { MatchPlayerState, MatchState, ScreenCoverage } from '../state'

/**
 * BT5: a team's tactical identity in a handful of dimensions. Each one changes WHAT the players try (which actions are sought, who
 * starts them, which risks are accepted, how the defense covers and helps); none of them changes how well anything is done, so the
 * statistics come out of the decisions, never out of a multiplier.
 *
 * Merged from the brief's list (redundant pairs are one axis):
 *  - tempo = pace intent + transition appetite + early offense + quick initiation (they are one decision: attack before the defense is set);
 *  - ballMovement = ball movement + half-court patience (moving the ball IS waiting for a better look); its negative end is drive pressure;
 *  - interior = interior emphasis vs perimeter emphasis (one axis: where the offense wants the ball to end up);
 *  - crash = offensive rebounding commitment vs transition defense priority (the players who crash are the ones who do not get back);
 *  - pressure = point-of-attack pressure + passing-lane aggression (how close the defense plays to the ball and its lanes);
 *  - help = help aggression + rim protection priority (how far defenders leave their man to protect the rim);
 *  - coverage + dropDepth = ball-screen coverage (switch tendency, drop depth, hedge/blitz tendency are its values).
 */
export interface OffensiveIdentity {
  /** -1 controlled (walk it up, full set) .. +1 fast (push every rebound, attack before the defense sets). */
  readonly tempo: number
  /** -1 attack first (drive, isolate, first good look) .. +1 move it (swing, reverse, wait for the open man). */
  readonly ballMovement: number
  /** 0..1 how much the offense is built on the ball screen. */
  readonly ballScreen: number
  /** 0..1 cuts, off-ball screens and relocation. */
  readonly offBall: number
  /** -1 perimeter (five out, threes off the catch) .. +1 interior (a man in the post, touches and rim attacks). */
  readonly interior: number
  /** 0..1 how much the offense hunts a mismatch and clears out for it. */
  readonly isolation: number
  /** 0..1 how many players go to the offensive glass instead of getting back. */
  readonly crash: number
}

export interface DefensiveIdentity {
  /** 0..1 how close the defense plays to the ball and its passing lanes (more steals and denials, more blow-bys and backdoors). */
  readonly pressure: number
  /** 0..1 how far defenders leave their man to protect the rim (protects the paint, concedes kick-outs). */
  readonly help: number
  /** Base ball-screen coverage. */
  readonly coverage: ScreenCoverage
  /** 0..1 depth of the big in a drop (0 = at the level of the screen, 1 = in the paint). */
  readonly dropDepth: number
}

export interface TacticalIdentity { readonly offense: OffensiveIdentity; readonly defense: DefensiveIdentity }

export const NEUTRAL_IDENTITY: TacticalIdentity = Object.freeze({
  offense: Object.freeze({ tempo: 0, ballMovement: 0, ballScreen: 0.5, offBall: 0.35, interior: 0, isolation: 0.25, crash: 0.4 }),
  defense: Object.freeze({ pressure: 0.5, help: 0.5, coverage: 'drop' as ScreenCoverage, dropDepth: 0.5 }),
})

/** The coach as a tactical authority: what he wants and how he adjusts. */
export interface CoachProfile {
  readonly identity: TacticalIdentity
  /** 0..100: how much he bends his plan toward what the players can do, and how readily he changes it during a game. */
  readonly adaptability: number
  /** 0..100: how well he reads matchups (scouting-level information only) and how fast he recognizes a pattern. */
  readonly tacticalKnowledge: number
}

const OFFENSE_KEYS = ['tempo', 'ballMovement', 'ballScreen', 'offBall', 'interior', 'isolation', 'crash'] as const
const BIPOLAR: ReadonlySet<string> = new Set(['tempo', 'ballMovement', 'interior'])

/**
 * Coach preference (authority 1). A plan that carries an explicit coach identity uses it; a legacy plan (pace / shot profile /
 * interior-perimeter levels) is read as the identity it describes, so every existing save keeps a coherent coach.
 */
export function coachProfileFor(plan: MatchNextTacticalPlan): CoachProfile {
  const legacy = legacyIdentity(plan)
  const coach = plan.coach
  const offense = { ...legacy.offense, ...(coach?.offense ?? {}) }
  const defense = { ...legacy.defense, ...(coach?.defense ?? {}) }
  return { identity: { offense: clampOffense(offense), defense: clampDefense(defense) }, adaptability: clamp(coach?.adaptability ?? 50, 0, 100), tacticalKnowledge: clamp(coach?.tacticalKnowledge ?? 50, 0, 100) }
}

function legacyIdentity(plan: MatchNextTacticalPlan): TacticalIdentity {
  const n = NEUTRAL_IDENTITY
  const coverage = plan.defense.pickAndRollCoverage
  return {
    offense: {
      ...n.offense,
      tempo: clamp(plan.pace / 2, -1, 1),
      // A plan that wants rim shots over threes wants the ball inside; the shot profile itself is no longer a shot-value multiplier (BT5.11).
      interior: clamp((plan.shotProfile.rim + 0.5 * plan.shotProfile.midRange - plan.shotProfile.threePoint) / 4, -1, 1),
    },
    defense: {
      ...n.defense,
      pressure: clamp(0.5 + plan.defense.perimeter * 0.2, 0, 1),
      help: clamp(0.5 + plan.defense.interior * 0.2, 0, 1),
      coverage: coverage === 'switch' || coverage === 'hedge' || coverage === 'blitz' || coverage === 'drop' ? coverage : 'drop',
      dropDepth: clamp(0.5 + plan.defense.interior * 0.15, 0, 1),
    },
  }
}

/** Match plan (authority 3): what the staff decides to try in THIS game, on top of the coach's usual identity. */
export function matchPlanDelta(plan: MatchNextTacticalPlan): { readonly offense: Partial<OffensiveIdentity>; readonly defense: Partial<DefensiveIdentity> } {
  return { offense: plan.matchPlan?.offense ?? {}, defense: plan.matchPlan?.defense ?? {} }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Roster affordance (authority 2): what the five on the floor allow.

export interface RosterAffordance {
  /** Quality of the best ball handler / creator. */
  readonly handler: number
  /** Second creator: a team with two can initiate from either side. */
  readonly secondHandler: number
  /** Best roll threat (rim attack, size, hands) and best pop threat among the non-handlers. */
  readonly roller: number
  readonly popper: number
  /** Spacing: how well the four best shooters punish a sagging defender. */
  readonly shooting: number
  readonly passing: number
  /** Best interior target: size, finishing and strength near the rim. */
  readonly post: number
  readonly cutting: number
  readonly isolation: number
  readonly rebounding: number
  readonly speed: number
  readonly pointOfAttack: number
  readonly rimProtection: number
  /** Whether every defender can stay in front of every attacker (mobility of the slowest, size spread). */
  readonly switchability: number
  readonly hands: number
}

export function rosterAffordance(players: readonly MatchPlayerState[]): RosterAffordance {
  const scale = (value: number, low = 40, high = 85): number => clamp((value - low) / (high - low), 0, 1)
  const sorted = (score: (player: MatchPlayerState) => number): number[] => players.map(score).sort((a, b) => b - a)
  const mean = (values: readonly number[]): number => values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
  const creators = sorted(creatorScore)
  const mobility = players.map((player) => player.defensiveMobility)
  const heights = players.map((player) => player.heightCm)
  return {
    handler: scale(creators[0] ?? 0),
    secondHandler: scale(creators[1] ?? 0),
    roller: scale(sorted(rollerScore)[1] ?? sorted(rollerScore)[0] ?? 0),
    popper: scale(Math.max(...players.filter((player) => player.heightCm >= 200).map((player) => player.offense.shooting), 0)),
    shooting: scale(mean(sorted((player) => player.offense.shooting).slice(0, 4))),
    passing: scale(mean(players.map((player) => player.passing.vision))),
    post: scale(sorted(postScore)[0] ?? 0),
    cutting: scale(mean(sorted((player) => player.offense.rimAttack * 0.6 + player.kinematics.maxSpeedMps * 4).slice(0, 3)) - 10),
    isolation: scale(sorted((player) => (player.offense.creation + player.offense.rimAttack) / 2)[0] ?? 0),
    rebounding: scale(mean(sorted((player) => player.reboundingImpact).slice(0, 3))),
    speed: clamp((mean(players.map((player) => player.kinematics.maxSpeedMps)) - 6.6) / 1.6, 0, 1),
    pointOfAttack: scale(mean(sorted((player) => player.defense.pointOfAttack).slice(0, 3))),
    rimProtection: scale(sorted((player) => player.defense.interior + (player.heightCm - 200) * 0.6)[0] ?? 0),
    switchability: clamp(scale(Math.min(...mobility), 35, 75) - Math.max(0, (Math.max(...heights) - Math.min(...heights) - 15) / 40), 0, 1),
    hands: scale(mean(players.map((player) => player.defense.steal ?? 50))),
  }
}

export function creatorScore(player: MatchPlayerState): number {
  return 0.4 * player.offense.creation + 0.25 * player.offense.ballSecurity + 0.2 * player.passing.vision + 0.15 * player.offense.rimAttack
}

export function rollerScore(player: MatchPlayerState): number {
  return (player.offense.rimAttack + player.reboundingImpact + (player.heightCm - 170) * 0.6) / 3
}

export function postScore(player: MatchPlayerState): number {
  return 0.45 * player.offense.rimAttack + 0.2 * player.reboundingImpact + 0.15 * player.offense.shooting + (player.heightCm - 190) * 0.55 + (player.weightKg - 90) * 0.2
}

/** Where the roster would take each dimension if nobody told it anything: the style the players suggest. */
export function rosterNaturalIdentity(roster: RosterAffordance): OffensiveIdentity {
  return {
    tempo: clamp((roster.speed - 0.5) * 1.2 + (roster.handler - 0.5) * 0.4, -1, 1),
    ballMovement: clamp((roster.passing - 0.5) * 1.4 - (roster.isolation - 0.5) * 0.6, -1, 1),
    ballScreen: clamp(0.25 + 0.4 * roster.handler + 0.35 * Math.max(roster.roller, roster.popper), 0, 1),
    offBall: clamp(0.15 + 0.4 * roster.cutting + 0.3 * roster.shooting, 0, 1),
    interior: clamp((roster.post - roster.shooting) * 1.3, -1, 1),
    isolation: clamp(0.1 + 0.6 * Math.max(0, roster.isolation - 0.45), 0, 1),
    crash: clamp(0.2 + 0.6 * roster.rebounding, 0, 1),
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Context (authority 4): the score, the clock, fouls and fatigue.

export interface TacticalContext {
  readonly scoreMargin: number
  readonly secondsLeftInGame: number
  readonly late: boolean
  readonly lineupFatigue: number
  readonly tempo: number
  readonly ballMovement: number
  readonly pressure: number
  readonly crash: number
  readonly reason: string
}

export function tacticalContext(state: MatchState, teamId: TeamId): TacticalContext {
  const home = teamId === state.homeTeamId
  const margin = home ? state.score.home - state.score.away : state.score.away - state.score.home
  const finalPeriod = state.period >= state.clockRules.periodCount
  const secondsLeftInGame = finalPeriod ? state.gameClockTenths / 10 : (state.clockRules.periodCount - state.period) * state.clockRules.periodSeconds + state.gameClockTenths / 10
  const late = finalPeriod && secondsLeftInGame <= 240
  const lineup = state.players.filter((player) => player.active && player.teamId === teamId)
  const lineupFatigue = lineup.length === 0 ? 0 : lineup.reduce((sum, player) => sum + player.fatigue, 0) / lineup.length
  let tempo = 0
  let ballMovement = 0
  let pressure = 0
  let crash = 0
  const reasons: string[] = []
  if (late && margin > 0) {
    // Protecting a lead: use the clock (no early attack, the ball moves until a good look), and do not foul.
    const weight = clamp(margin / 10, 0.3, 1) * clamp((240 - secondsLeftInGame) / 150 + 0.4, 0, 1)
    tempo -= 0.9 * weight; ballMovement += 0.4 * weight; pressure -= 0.25 * weight; crash -= 0.3 * weight
    reasons.push(`protect a ${margin}-point lead`)
  } else if (late && margin < 0) {
    // Chasing: every second matters; push, attack early, pressure the ball, go to the glass.
    const weight = clamp(-margin / 8, 0.35, 1) * clamp((240 - secondsLeftInGame) / 150 + 0.4, 0, 1)
    tempo += 0.9 * weight; ballMovement -= 0.3 * weight; pressure += 0.35 * weight; crash += 0.25 * weight
    reasons.push(`chase a ${-margin}-point deficit`)
  }
  if (lineupFatigue > 35) {
    const tired = clamp((lineupFatigue - 35) / 30, 0, 1)
    tempo -= 0.35 * tired; pressure -= 0.2 * tired
    reasons.push('tired lineup')
  }
  return { scoreMargin: margin, secondsLeftInGame, late, lineupFatigue, tempo, ballMovement, pressure, crash, reason: reasons.join('; ') || 'neutral' }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Tactical intent: coach + roster + match plan + context (+ in-game adjustment). Derived on demand, never stored.

export interface TacticalIntent {
  readonly teamId: TeamId
  readonly offense: OffensiveIdentity
  readonly defense: DefensiveIdentity
  readonly roster: RosterAffordance
  /** 0..1 how well the team knows its system (tactical familiarity): low familiarity executes later and less reliably. */
  readonly familiarity: number
  readonly coach: CoachProfile
  readonly layers: {
    readonly coach: TacticalIdentity
    readonly plan: { readonly offense: Partial<OffensiveIdentity>; readonly defense: Partial<DefensiveIdentity> }
    readonly rosterNatural: OffensiveIdentity
    readonly bend: number
    readonly context: TacticalContext
    readonly adjustment: { readonly coverage?: ScreenCoverage; readonly offense?: Partial<OffensiveIdentity>; readonly reason?: string } | null
  }
}

/**
 * The defensive geometry knobs (BT2 levels: perimeter = how tight on the ball and its lanes, interior = how deep the gap and help) from
 * the intent's pressure and help, so every guard position reads the same identity.
 */
export function defensiveShape(state: MatchState, teamId: TeamId): { readonly interior: number; readonly perimeter: number } {
  const intent = tacticalIntent(state, teamId)
  return { interior: (intent.defense.help - 0.5) * 5, perimeter: (intent.defense.pressure - 0.5) * 5 }
}

export function planFor(state: MatchState, teamId: TeamId): MatchNextTacticalPlan {
  return teamId === state.homeTeamId ? state.tacticalPlans.home : state.tacticalPlans.away
}

/**
 * The intent is a pure function of a few inputs (plan, lineup, score, the clock only late in the game, fatigue only once it matters,
 * the in-game adjustment); it is recomputed many times per tick, so it is memoized on exactly those inputs (never on anything else, so
 * a cached value is always the value the function would compute).
 */
const intentCache = new WeakMap<object, Map<string, TacticalIntent>>()

/**
 * ME-LOCK1: the memo key itself (filter, fatigue mean, string join) cost more than the intent once it is cached, and the intent is read
 * ~26 times per tick. Every input of the key is reached through these references, so while they are the same objects the key, and
 * therefore the intent, is the same: the last answer per team is reused without rebuilding the key.
 */
interface LastIntent {
  readonly players: MatchState['players']; readonly score: MatchState['score']; readonly period: number; readonly gameClockTenths: number
  readonly tactics: MatchState['tactics']; readonly tacticalPlans: MatchState['tacticalPlans']; readonly homeTeamId: TeamId; readonly clockRules: MatchState['clockRules']; readonly intent: TacticalIntent
}
const lastIntentByTeam = new Map<TeamId, LastIntent>()

export function tacticalIntent(state: MatchState, teamId: TeamId): TacticalIntent {
  const last = lastIntentByTeam.get(teamId)
  if (last !== undefined && last.players === state.players && last.score === state.score && last.period === state.period && last.gameClockTenths === state.gameClockTenths
    && last.tactics === state.tactics && last.tacticalPlans === state.tacticalPlans && last.homeTeamId === state.homeTeamId && last.clockRules === state.clockRules) return last.intent
  const intent = memoizedTacticalIntent(state, teamId)
  lastIntentByTeam.set(teamId, { players: state.players, score: state.score, period: state.period, gameClockTenths: state.gameClockTenths, tactics: state.tactics, tacticalPlans: state.tacticalPlans, homeTeamId: state.homeTeamId, clockRules: state.clockRules, intent })
  return intent
}

/**
 * ME-LOCK1.2: the parts of the last key built per team. When every part is equal the key string is equal, so it is reused instead of
 * rebuilt (filter, join, template) for every new players array. The lookup below is unchanged: same Map, same key, same eviction.
 */
interface IntentKeyParts {
  readonly lineupIds: readonly string[]; readonly scoreHome: number; readonly scoreAway: number; readonly period: number
  readonly clockPart: number | 'x'; readonly fatiguePart: number | 'low'; readonly adjustmentPart: number | 'none'; readonly key: string
}
const lastKeyByTeam = new Map<TeamId, IntentKeyParts>()

function intentKey(state: MatchState, teamId: TeamId): string {
  // The lineup in players order and its mean fatigue, summed in the same order as `lineup.reduce` did.
  const last = lastKeyByTeam.get(teamId)
  let sameLineup = last !== undefined
  let count = 0
  let fatigueSum = 0
  for (const player of state.players) {
    if (!player.active || player.teamId !== teamId) continue
    if (sameLineup && last!.lineupIds[count] !== player.playerId) sameLineup = false
    fatigueSum += player.fatigue
    count += 1
  }
  if (sameLineup && last!.lineupIds.length !== count) sameLineup = false
  const fatigue = count === 0 ? 0 : fatigueSum / count
  const finalPeriod = state.period >= state.clockRules.periodCount
  const late = finalPeriod && state.gameClockTenths <= 2400
  const memory = teamId === state.homeTeamId ? state.tactics?.home : state.tactics?.away
  const clockPart = late ? state.gameClockTenths : 'x'
  const fatiguePart = fatigue > 35 ? fatigue : 'low'
  const adjustmentPart = memory?.adjustment?.atT ?? 'none'
  // Numbers print to distinct strings exactly when they differ (0 and -0 print alike and compare equal), so equal parts mean an equal key.
  if (sameLineup && last!.scoreHome === state.score.home && last!.scoreAway === state.score.away && last!.period === state.period
    && last!.clockPart === clockPart && last!.fatiguePart === fatiguePart && last!.adjustmentPart === adjustmentPart) return last!.key
  const lineupIds = state.players.filter((player) => player.active && player.teamId === teamId).map((player) => player.playerId)
  const key = `${teamId}|${lineupIds.join(',')}|${state.score.home}:${state.score.away}|${state.period}|${clockPart}|${fatiguePart}|${adjustmentPart}`
  lastKeyByTeam.set(teamId, { lineupIds, scoreHome: state.score.home, scoreAway: state.score.away, period: state.period, clockPart, fatiguePart, adjustmentPart, key })
  return key
}

function memoizedTacticalIntent(state: MatchState, teamId: TeamId): TacticalIntent {
  const key = intentKey(state, teamId)
  let byState = intentCache.get(state.tacticalPlans)
  if (byState === undefined) { byState = new Map(); intentCache.set(state.tacticalPlans, byState) }
  const cached = byState.get(key)
  if (cached !== undefined) return cached
  if (byState.size > 4000) byState.clear()
  const intent = computeTacticalIntent(state, teamId)
  byState.set(key, intent)
  return intent
}

function computeTacticalIntent(state: MatchState, teamId: TeamId): TacticalIntent {
  const plan = planFor(state, teamId)
  const coach = coachProfileFor(plan)
  const lineup = state.players.filter((player) => player.active && player.teamId === teamId)
  const roster = rosterAffordance(lineup)
  const natural = rosterNaturalIdentity(roster)
  const delta = matchPlanDelta(plan)
  const context = tacticalContext(state, teamId)
  const memory = teamId === state.homeTeamId ? state.tactics?.home : state.tactics?.away
  const adjustment = memory?.adjustment ?? null
  // A coach who adapts bends what he wants toward what his players can do; a rigid one asks for his system whatever the roster.
  const bend = 0.12 + 0.38 * (coach.adaptability / 100)
  const offense: Record<string, number> = {}
  for (const key of OFFENSE_KEYS) {
    const wanted = coach.identity.offense[key] + (delta.offense[key] ?? 0) + (adjustment?.offense?.[key] ?? 0)
    const value = wanted + bend * (natural[key] - wanted) + ((context as unknown as Record<string, number>)[key] ?? 0)
    offense[key] = BIPOLAR.has(key) ? clamp(value, -1, 1) : clamp(value, 0, 1)
  }
  const defense: DefensiveIdentity = {
    pressure: clamp(coach.identity.defense.pressure + (delta.defense.pressure ?? 0) + context.pressure, 0, 1),
    help: clamp(coach.identity.defense.help + (delta.defense.help ?? 0), 0, 1),
    coverage: adjustment?.coverage ?? delta.defense.coverage ?? coach.identity.defense.coverage,
    dropDepth: clamp(coach.identity.defense.dropDepth + (delta.defense.dropDepth ?? 0), 0, 1),
  }
  return {
    teamId, offense: offense as unknown as OffensiveIdentity, defense, roster, familiarity: clamp((plan.familiarity ?? 75) / 100, 0, 1), coach,
    layers: { coach: coach.identity, plan: delta, rosterNatural: natural, bend, context, adjustment },
  }
}

/**
 * BT5.28: everything needed to answer "why did they do that": each authority's layer and the final intent, plus what is being run
 * and covered right now.
 */
export function explainTacticalIntent(state: MatchState, teamId: TeamId): Record<string, unknown> {
  const intent = tacticalIntent(state, teamId)
  const flow = state.offenseFlow?.teamId === teamId ? state.offenseFlow : null
  return {
    coachPreference: intent.layers.coach,
    coach: { adaptability: intent.coach.adaptability, tacticalKnowledge: intent.coach.tacticalKnowledge, bendTowardRoster: round(intent.layers.bend) },
    rosterModifier: { natural: roundAll(intent.layers.rosterNatural), affordance: roundAll(intent.roster) },
    matchPlanPreference: intent.layers.plan,
    contextModifier: intent.layers.context,
    inGameAdjustment: intent.layers.adjustment,
    finalIntent: { offense: roundAll(intent.offense), defense: { ...intent.defense, pressure: round(intent.defense.pressure), help: round(intent.defense.help), dropDepth: round(intent.defense.dropDepth) } },
    familiarity: intent.familiarity,
    selectedPlay: flow?.call ?? null,
    selectedCoverage: state.screen !== null && state.screen.teamId !== teamId ? { coverage: state.screen.coverage, reason: state.screen.coverageReason ?? null } : null,
  }
}

function clampOffense(value: OffensiveIdentity): OffensiveIdentity {
  const out: Record<string, number> = {}
  for (const key of OFFENSE_KEYS) out[key] = BIPOLAR.has(key) ? clamp(value[key], -1, 1) : clamp(value[key], 0, 1)
  return out as unknown as OffensiveIdentity
}

function clampDefense(value: DefensiveIdentity): DefensiveIdentity {
  return { pressure: clamp(value.pressure, 0, 1), help: clamp(value.help, 0, 1), coverage: value.coverage, dropDepth: clamp(value.dropDepth, 0, 1) }
}

function roundAll<T extends object>(value: T): Record<string, number> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === 'number' ? round(item) : item]))
}

function round(value: number): number { return Math.round(value * 1000) / 1000 }

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
