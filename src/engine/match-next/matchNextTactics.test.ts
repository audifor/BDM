/**
 * BT5 tactical identity: the three authorities (coach, roster, match plan) plus context, the roles, the calls, the coverage choice and
 * the in-game adjustment. Synthetic lineups for the rules; one short real match for determinism and Live = Instant.
 */
import { describe, expect, it } from 'vitest'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { createCourtGeometry } from '@/domain/court'
import { gameIdFromString, playerIdFromString, teamIdFromString, type PlayerId } from '@/domain/ids'
import type { BasketballPosition } from '@/domain/primitives'
import { createMatchState, type MatchNextPlayerProfile, type MatchNextTacticalPlan, type MatchSetup, type MatchState } from './index'
import { coachProfileFor, explainTacticalIntent, tacticalIntent } from './tactics/TacticalIdentity'
import { lineupRoles } from './tactics/OffensiveRoles'
import { familyWeights, inboundReceiverOrder, selectInitiator, spacingFor } from './tactics/PlayCalling'
import { chooseCoverage } from './tactics/Coverage'
import { initialTacticsState, reconcileTacticalMemory } from './tactics/MatchMemory'
import { withTuning } from './tuning'

type Ratings = Partial<{ usage: number; rimAttack: number; shooting: number; creation: number; ballSecurity: number; vision: number; pointOfAttack: number; interior: number; mobility: number; rebound: number; height: number; weight: number }>

const POSITIONS: readonly BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C']
const NEUTRAL_PLAN: MatchNextTacticalPlan = { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } }

function profile(id: PlayerId, teamId: MatchSetup['homeTeamId'], index: number, r: Ratings = {}): MatchNextPlayerProfile {
  const big = index >= 3
  return {
    playerId: id, teamId, primaryPosition: POSITIONS[index]!,
    physical: { heightCm: r.height ?? (big ? 206 : 193), weightKg: r.weight ?? (big ? 108 : 88), wingspanCm: 205, standingReachCm: 255 },
    kinematics: { maxSpeedMps: 7.4, accelerationMps2: 3, brakingMps2: 3.8 },
    offense: { usage: r.usage ?? 60, rimAttack: r.rimAttack ?? 60, shooting: r.shooting ?? 60, creation: r.creation ?? 60, ballSecurity: r.ballSecurity ?? 60 },
    passing: { accuracy: 60, vision: r.vision ?? 60, timing: 60 },
    defense: { pointOfAttack: r.pointOfAttack ?? 60, interior: r.interior ?? 60, mobility: r.mobility ?? 60, steal: 60 },
    rebounding: { impact: r.rebound ?? 60 },
  }
}

function setupWith(home: readonly Ratings[], options: { homePlan?: MatchNextTacticalPlan; awayPlan?: MatchNextTacticalPlan; away?: readonly Ratings[] } = {}): MatchSetup {
  const homeTeamId = teamIdFromString('t5-home')
  const awayTeamId = teamIdFromString('t5-away')
  const homeIds = POSITIONS.map((_, index) => playerIdFromString(`t5-h${index}`))
  const awayIds = POSITIONS.map((_, index) => playerIdFromString(`t5-a${index}`))
  return {
    gameId: gameIdFromString('t5-game'), homeTeamId, awayTeamId, court: createCourtGeometry('FIBA'),
    clockRules: { periodCount: 4, periodSeconds: 600, overtimeSeconds: 300, shotClockSeconds: 24 },
    homeSquad: homeIds, awaySquad: awayIds, initialLineups: { home: homeIds, away: awayIds },
    players: [...homeIds.map((id, index) => profile(id, homeTeamId, index, home[index])), ...awayIds.map((id, index) => profile(id, awayTeamId, index, options.away?.[index]))],
    tacticalPlans: { home: options.homePlan ?? NEUTRAL_PLAN, away: options.awayPlan ?? NEUTRAL_PLAN },
    defensiveMatchupOverrides: { home: [], away: [] },
    matchSeed: 5005,
  }
}

const state = (setup: MatchSetup): MatchState => createMatchState(setup)
const HOME = teamIdFromString('t5-home')
const AWAY = teamIdFromString('t5-away')

const ELITE_PNR: readonly Ratings[] = [{ creation: 90, ballSecurity: 88, vision: 85, shooting: 80 }, { shooting: 80 }, { shooting: 78 }, { shooting: 70 }, { rimAttack: 88, rebound: 85, height: 211, shooting: 40 }]
/** Poor ball-screen personnel (no handler, no roller: two stretch bigs) but shooters and passers: the roster for a movement offense. */
const POOR_PNR: readonly Ratings[] = [{ creation: 45, ballSecurity: 45, vision: 72, shooting: 80 }, { creation: 48, vision: 70, shooting: 80 }, { creation: 46, vision: 70, shooting: 78 }, { shooting: 75, rimAttack: 45, rebound: 45 }, { shooting: 72, rimAttack: 45, rebound: 45 }]
const PNR_COACH: MatchNextTacticalPlan = { ...NEUTRAL_PLAN, coach: { offense: { ballScreen: 0.95 }, adaptability: 30 } }

describe('BT5 tactical identity', () => {
  it('reads a legacy plan as the identity it describes, and an explicit coach identity over it', () => {
    const legacy = coachProfileFor({ pace: 2, shotProfile: { rim: 2, midRange: 0, threePoint: -2 }, defense: { interior: 1, perimeter: -1, pickAndRollCoverage: 'switch' } })
    expect(legacy.identity.offense.tempo).toBe(1)
    expect(legacy.identity.offense.interior).toBe(1)
    expect(legacy.identity.defense.coverage).toBe('switch')
    expect(legacy.identity.defense.pressure).toBeCloseTo(0.3)
    expect(legacy.identity.defense.help).toBeCloseTo(0.7)
    const explicit = coachProfileFor({ ...NEUTRAL_PLAN, coach: { offense: { tempo: -0.6 }, defense: { coverage: 'blitz' }, adaptability: 80 } })
    expect(explicit.identity.offense.tempo).toBe(-0.6)
    expect(explicit.identity.defense.coverage).toBe('blitz')
    expect(explicit.adaptability).toBe(80)
  })

  it('is derived, deterministic and JSON-safe: the same state gives the same intent and the explanation of every layer', () => {
    const s = state(setupWith(ELITE_PNR, { homePlan: PNR_COACH }))
    expect(tacticalIntent(s, HOME)).toEqual(tacticalIntent(structuredClone(s), HOME))
    const explained = explainTacticalIntent(s, HOME)
    expect(Object.keys(explained)).toEqual(expect.arrayContaining(['coachPreference', 'rosterModifier', 'matchPlanPreference', 'contextModifier', 'finalIntent', 'selectedPlay', 'selectedCoverage']))
    expect(JSON.parse(JSON.stringify(explained))).toEqual(explained)
  })

  it('a roster that cannot run the coach\'s ball screen runs less of it (coach x roster friction)', () => {
    const good = state(setupWith(ELITE_PNR, { homePlan: PNR_COACH }))
    const poor = state(setupWith(POOR_PNR, { homePlan: PNR_COACH }))
    const share = (s: MatchState): number => {
      const intent = tacticalIntent(s, HOME)
      const weights = familyWeights(intent, lineupRoles(s, HOME, intent))
      return weights.BALL_SCREEN / Object.values(weights).reduce((a, b) => a + b, 0)
    }
    expect(share(good)).toBeGreaterThan(share(poor) + 0.04)
  })

  it('an adaptable coach bends his identity toward the roster more than a rigid one', () => {
    const rigid = state(setupWith(POOR_PNR, { homePlan: { ...NEUTRAL_PLAN, coach: { offense: { ballScreen: 0.95 }, adaptability: 0 } } }))
    const adaptive = state(setupWith(POOR_PNR, { homePlan: { ...NEUTRAL_PLAN, coach: { offense: { ballScreen: 0.95 }, adaptability: 100 } } }))
    expect(tacticalIntent(rigid, HOME).offense.ballScreen).toBeGreaterThan(tacticalIntent(adaptive, HOME).offense.ballScreen + 0.1)
  })

  it('the match plan moves the intent on top of the coach', () => {
    const base = state(setupWith(ELITE_PNR))
    const inside = state(setupWith(ELITE_PNR, { homePlan: { ...NEUTRAL_PLAN, matchPlan: { offense: { interior: 0.8 } } } }))
    expect(tacticalIntent(inside, HOME).offense.interior).toBeGreaterThan(tacticalIntent(base, HOME).offense.interior + 0.4)
  })

  it('spacing: a non-shooting big plays in the post (4-out-1-in); five shooters with a perimeter identity play five out', () => {
    expect(spacingFor(state(setupWith(ELITE_PNR)), HOME).spacing).toBe('4OUT1IN')
    const shooters = state(setupWith([{ creation: 80 }, { shooting: 80 }, { shooting: 80 }, { shooting: 78, height: 206 }, { shooting: 76, height: 208 }], { homePlan: { ...NEUTRAL_PLAN, shotProfile: { rim: 0, midRange: 0, threePoint: 2 } } }))
    expect(spacingFor(shooters, HOME).spacing).toBe('5OUT')
  })

  it('roles come from the lineup, a player can carry several, and they change with the lineup', () => {
    const s = state(setupWith(ELITE_PNR))
    const roles = lineupRoles(s, HOME, tacticalIntent(s, HOME))
    expect(roles.primaryCreatorId).toBe(playerIdFromString('t5-h0'))
    expect(roles.interiorTargetId).toBe(playerIdFromString('t5-h4'))
    expect(roles.byPlayer['t5-h4']).toEqual(expect.arrayContaining(['INTERIOR_TARGET', 'ROLLER', 'OFFENSIVE_REBOUNDER']))
    const swapped = state(setupWith([{ creation: 50 }, { creation: 88, ballSecurity: 85, vision: 84 }, {}, {}, {}]))
    expect(lineupRoles(swapped, HOME, tacticalIntent(swapped, HOME)).primaryCreatorId).toBe(playerIdFromString('t5-h1'))
  })

  it('initiator: the creator starts most possessions, but a heavy recent load hands some to the second creator (no round robin)', () => {
    const s = state(setupWith([{ creation: 80, ballSecurity: 80, vision: 80 }, { creation: 76, ballSecurity: 76, vision: 76 }, {}, {}, {}]))
    const roles = lineupRoles(s, HOME, tacticalIntent(s, HOME))
    const primary = playerIdFromString('t5-h0')
    const fresh = Array.from({ length: 20 }, (_, i) => selectInitiator(s, HOME, 'BALL_SCREEN', roles, [], `salt-${i}`)?.playerId)
    const loaded = Array.from({ length: 20 }, (_, i) => selectInitiator(s, HOME, 'BALL_SCREEN', roles, [primary, primary, primary, primary], `salt-${i}`)?.playerId)
    expect(fresh.filter((id) => id === primary).length).toBeGreaterThan(12)
    expect(loaded.filter((id) => id === primary).length).toBeLessThan(fresh.filter((id) => id === primary).length)
    // Audit switch (off by default since BT5: a throw-in to the creator cost transition interceptions, see the report).
    expect(withTuning({ inboundToCreator: 1 }, () => inboundReceiverOrder(s, HOME, playerIdFromString('t5-h4'))[0])).toBe(primary)
  })

  it('coverage: a coach who knows his matchups does not switch a slow big onto an elite handler; one who does not, does', () => {
    const away = [{}, {}, {}, {}, { mobility: 35 }] as const
    const handler = { creation: 90 }
    const knowing = state(setupWith([handler, {}, {}, {}, {}], { away, awayPlan: { ...NEUTRAL_PLAN, coach: { defense: { coverage: 'switch' }, tacticalKnowledge: 80 } } }))
    const naive = state(setupWith([handler, {}, {}, {}, {}], { away, awayPlan: { ...NEUTRAL_PLAN, coach: { defense: { coverage: 'switch' }, tacticalKnowledge: 20 } } }))
    const pick = (s: MatchState) => chooseCoverage(s, AWAY, s.players[0]!, s.players[4]!, s.players[5]!, s.players[9]!)
    expect(pick(knowing).coverage).toBe('drop')
    expect(pick(naive).coverage).toBe('switch')
    const shooter = state(setupWith([{ shooting: 90 }, {}, {}, {}, {}], { awayPlan: { ...NEUTRAL_PLAN, coach: { defense: { coverage: 'drop' }, tacticalKnowledge: 20 } } }))
    const nonShooter = state(setupWith([{ shooting: 40 }, {}, {}, {}, {}], { awayPlan: { ...NEUTRAL_PLAN, coach: { defense: { coverage: 'drop' }, tacticalKnowledge: 20 } } }))
    expect(pick(shooter).dropDepth).toBeLessThan(pick(nonShooter).dropDepth)
  })

  it('context: trailing late pushes the tempo and the pressure, leading late slows it down', () => {
    const s = state(setupWith(ELITE_PNR))
    const late = { ...s, period: 4, gameClockTenths: 900 }
    const trailing = tacticalIntent({ ...late, score: { home: 80, away: 86 } }, HOME)
    const leading = tacticalIntent({ ...late, score: { home: 95, away: 80 } }, HOME)
    const early = tacticalIntent({ ...s, score: { home: 20, away: 26 } }, HOME)
    expect(trailing.offense.tempo).toBeGreaterThan(early.offense.tempo + 0.3)
    expect(trailing.defense.pressure).toBeGreaterThan(early.defense.pressure)
    expect(leading.offense.tempo).toBeLessThan(early.offense.tempo - 0.3)
  })

  it('in-game adjustment: a coverage that keeps conceding is changed by an adaptable coach, never after one possession, never by a stubborn one', () => {
    const run = (adaptability: number, n: number): MatchState => {
      const s = state(setupWith(ELITE_PNR, { homePlan: { ...NEUTRAL_PLAN, coach: { defense: { coverage: 'drop' }, adaptability, tacticalKnowledge: 80 } } }))
      const tactics = initialTacticsState()
      const seeded: MatchState = {
        ...s, t: 4000, autonomousActions: true,
        tactics: { ...tactics, home: { ...tactics.home, defense: { drop: { n, points: n * 1.9 } }, allDefense: { n: n + 20, points: n * 1.9 + 18 } }, open: [{ possessionId: 'p-x', offenseTeamId: AWAY, family: null, coverages: ['drop'], points: 2 }], processedSequence: s.events.at(-1)!.sequence },
      }
      const end = { sequence: seeded.nextEventSequence, t: seeded.t, period: 1, gameClockTenths: seeded.gameClockTenths, type: 'possessionEnd' as const, possessionId: 'p-x', teamId: AWAY }
      return reconcileTacticalMemory({ ...seeded, events: [...seeded.events, end], nextEventSequence: seeded.nextEventSequence + 1 })
    }
    const adapted = run(90, 9)
    expect(adapted.tactics?.home.adjustment?.coverage).toBeDefined()
    expect(adapted.tactics?.home.adjustment?.coverage).not.toBe('drop')
    expect(adapted.events.some((event) => event.type === 'tacticalAdjustment')).toBe(true)
    expect(run(90, 1).tactics?.home.adjustment).toBeNull()
    expect(run(5, 9).tactics?.home.adjustment).toBeNull()
  })
})

describe('BT5 tactical identity in a real match', () => {
  const short = (setup: MatchSetup): MatchSetup => ({ ...setup, clockRules: { ...setup.clockRules, periodCount: 1, periodSeconds: 150 } })
  const coached = (): MatchSetup => short(setupWith(ELITE_PNR, {
    away: POOR_PNR,
    homePlan: { ...NEUTRAL_PLAN, coach: { offense: { tempo: 0.9, ballScreen: 0.95 }, defense: { pressure: 0.9, coverage: 'blitz' } } },
    awayPlan: { ...NEUTRAL_PLAN, coach: { offense: { tempo: -0.8, ballMovement: 0.8, offBall: 0.9 }, defense: { coverage: 'drop', dropDepth: 0.9 } } },
  }))

  it('is deterministic and Live and Instant share the same authority', () => {
    const port = createMatchEnginePort('match-next')
    const instantA = port.runInstant({ ...coached(), autonomousActions: true })
    const instantB = port.runInstant({ ...coached(), autonomousActions: true })
    expect(instantA).toEqual(instantB)
    const live = port.createLiveSession({ ...coached(), autonomousActions: true })
    while (!live.matchState.isComplete && live.matchState.t < 20000) live.advanceOneStep()
    expect(live.result()).toEqual(instantA)
    const calls = live.matchState.events.filter((event) => event.type === 'playCalled')
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((event) => event.playFamily !== undefined && event.tacticalReason !== undefined)).toBe(true)
  }, 120_000)
})
