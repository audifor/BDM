import type { MatchNextPlayerProfile, MatchNextTacticalPlan, MatchSetup } from '@/engine/match-next'

export interface ExperimentConfig { readonly description: string; readonly transform?: (setup: MatchSetup) => MatchSetup }

type Side = 'home' | 'away'
type Coach = NonNullable<MatchNextTacticalPlan['coach']>

const plan = (side: Side, patch: (plan: MatchNextTacticalPlan) => MatchNextTacticalPlan) => (setup: MatchSetup): MatchSetup =>
  ({ ...setup, tacticalPlans: { ...setup.tacticalPlans, [side]: patch(setup.tacticalPlans[side]) } })

export const compose = (...steps: ((setup: MatchSetup) => MatchSetup)[]) => (setup: MatchSetup): MatchSetup => steps.reduce((current, step) => step(current), setup)

/** BT5.21 coach cohorts (the identity a coach brings; adaptability and knowledge are his staff attributes). */
export const COACH_A: Coach = {
  offense: { tempo: 0.9, ballMovement: -0.35, ballScreen: 0.95, offBall: 0.2, interior: -0.2, isolation: 0.35, crash: 0.25 },
  defense: { pressure: 0.9, help: 0.65, coverage: 'blitz', dropDepth: 0.3 },
  adaptability: 40, tacticalKnowledge: 60,
}
export const COACH_B: Coach = {
  offense: { tempo: -0.85, ballMovement: 0.85, ballScreen: 0.2, offBall: 0.9, interior: 0.15, isolation: 0.05, crash: 0.6 },
  defense: { pressure: 0.15, help: 0.75, coverage: 'drop', dropDepth: 0.85 },
  adaptability: 35, tacticalKnowledge: 60,
}
export const COACH_C: Coach = {
  offense: { tempo: 0, ballMovement: 0, ballScreen: 0.5, offBall: 0.4, interior: 0, isolation: 0.25, crash: 0.4 },
  defense: { pressure: 0.5, help: 0.5, coverage: 'switch', dropDepth: 0.5 },
  adaptability: 90, tacticalKnowledge: 85,
}

export const withCoach = (side: Side, coach: Coach) => plan(side, (current) => ({ ...current, coach }))
const withMatchPlan = (side: Side, matchPlan: NonNullable<MatchNextTacticalPlan['matchPlan']>) => plan(side, (current) => ({ ...current, matchPlan }))

type Bucket = 'guard' | 'wing' | 'big'
const bucketOf = (player: MatchNextPlayerProfile): Bucket => player.primaryPosition === 'PG' || player.primaryPosition === 'SG' ? 'guard' : player.primaryPosition === 'SF' ? 'wing' : 'big'

/** Reshapes every player of a squad (all twelve, so substitutions keep the profile) by position bucket. */
const roster = (side: Side, shape: (player: MatchNextPlayerProfile, bucket: Bucket) => MatchNextPlayerProfile) => (setup: MatchSetup): MatchSetup => {
  const ids = new Set(side === 'home' ? setup.homeSquad : setup.awaySquad)
  return { ...setup, players: setup.players.map((player) => ids.has(player.playerId) ? shape(player, bucketOf(player)) : player) }
}

/** BT5.22 roster cohorts. Every rating that is not part of the identity is a common 62, so only the identity differs. */
const base = (player: MatchNextPlayerProfile): MatchNextPlayerProfile => ({
  ...player,
  offense: { usage: 62, rimAttack: 62, shooting: 62, creation: 62, ballSecurity: 62 },
  passing: { accuracy: 62, vision: 62, timing: 62 },
  defense: { pointOfAttack: 62, interior: 62, mobility: 62, steal: 62 },
  rebounding: { impact: 62 },
})

export const ROSTER_CREATION = (side: Side) => roster(side, (player, bucket) => {
  const p = base(player)
  if (bucket === 'guard') return { ...p, offense: { usage: 78, rimAttack: 74, shooting: 86, creation: 88, ballSecurity: 86 }, passing: { accuracy: 86, vision: 88, timing: 84 } }
  if (bucket === 'wing') return { ...p, offense: { ...p.offense, shooting: 84, creation: 72, ballSecurity: 74 }, passing: { accuracy: 74, vision: 72, timing: 72 } }
  return { ...p, offense: { ...p.offense, shooting: 78, rimAttack: 56, creation: 58 }, rebounding: { impact: 58 } }
})

export const ROSTER_INTERIOR = (side: Side) => roster(side, (player, bucket) => {
  const p = base(player)
  if (bucket === 'big') return { ...p, physical: { ...p.physical, heightCm: Math.max(p.physical.heightCm, 209), weightKg: Math.max(p.physical.weightKg, 112) }, offense: { usage: 74, rimAttack: 88, shooting: 44, creation: 56, ballSecurity: 60 }, rebounding: { impact: 90 }, defense: { ...p.defense, interior: 78 } }
  if (bucket === 'wing') return { ...p, offense: { ...p.offense, rimAttack: 76, shooting: 52 }, rebounding: { impact: 70 } }
  return { ...p, offense: { usage: 60, rimAttack: 60, shooting: 52, creation: 58, ballSecurity: 60 }, passing: { accuracy: 66, vision: 62, timing: 64 } }
})

export const ROSTER_DEFENSE = (side: Side) => roster(side, (player, bucket) => {
  const p = base(player)
  if (bucket === 'big') return { ...p, physical: { ...p.physical, heightCm: Math.max(p.physical.heightCm, 210) }, defense: { pointOfAttack: 66, interior: 92, mobility: 74, steal: 66 }, rebounding: { impact: 80 } }
  return { ...p, defense: { pointOfAttack: 90, interior: 66, mobility: 88, steal: 84 } }
})

const coverageCoach = (coverage: 'drop' | 'switch' | 'hedge' | 'blitz'): Coach => ({ ...COACH_C, defense: { ...COACH_C.defense, coverage }, tacticalKnowledge: 30, adaptability: 10 })

export const CONFIGS: Readonly<Record<string, ExperimentConfig>> = {
  neutral: { description: 'Default plans for both teams' },
  // Legacy knobs (BT5.0 baseline)
  legacyFast: { description: 'Home pace +2', transform: plan('home', (p) => ({ ...p, pace: 2 })) },
  legacySlow: { description: 'Home pace -2', transform: plan('home', (p) => ({ ...p, pace: -2 })) },
  legacyThree: { description: 'Home three +2 rim -1 mid -1', transform: plan('home', (p) => ({ ...p, shotProfile: { rim: -1, midRange: -1, threePoint: 2 } })) },
  legacyRim: { description: 'Home rim +2 three -2', transform: plan('home', (p) => ({ ...p, shotProfile: { rim: 2, midRange: 0, threePoint: -2 } })) },
  legacySwitch: { description: 'Home defense switches every ball screen', transform: plan('home', (p) => ({ ...p, defense: { ...p.defense, pickAndRollCoverage: 'switch' } })) },
  legacyBlitz: { description: 'Home defense blitzes every ball screen', transform: plan('home', (p) => ({ ...p, defense: { ...p.defense, pickAndRollCoverage: 'blitz' } })) },
  // TEST A: same roster, different coaches
  coachA: { description: 'Home: coach A (fast, aggressive, P&R heavy, pressure + blitz)', transform: withCoach('home', COACH_A) },
  coachB: { description: 'Home: coach B (controlled, movement, conservative, deep drop)', transform: withCoach('home', COACH_B) },
  coachC: { description: 'Home: coach C (adaptive, balanced, switch)', transform: withCoach('home', COACH_C) },
  // TEST B: same coach (C, balanced), different rosters
  rosterCreation: { description: 'Home: coach C + creation roster (elite handlers and shooters)', transform: compose(withCoach('home', COACH_C), ROSTER_CREATION('home')) },
  rosterInterior: { description: 'Home: coach C + interior roster (big finishers and rebounders)', transform: compose(withCoach('home', COACH_C), ROSTER_INTERIOR('home')) },
  rosterDefense: { description: 'Home: coach C + defense roster (point of attack and rim protection)', transform: compose(withCoach('home', COACH_C), ROSTER_DEFENSE('home')) },
  // BT5.23: coach x roster interaction (coach A needs handlers and a roller; coach B needs shooters and cutters)
  coachA_creation: { description: 'Home: coach A + creation roster (compatible)', transform: compose(withCoach('home', COACH_A), ROSTER_CREATION('home')) },
  coachA_interior: { description: 'Home: coach A + interior roster (incompatible: no handler)', transform: compose(withCoach('home', COACH_A), ROSTER_INTERIOR('home')) },
  coachB_creation: { description: 'Home: coach B + creation roster', transform: compose(withCoach('home', COACH_B), ROSTER_CREATION('home')) },
  coachB_interior: { description: 'Home: coach B + interior roster', transform: compose(withCoach('home', COACH_B), ROSTER_INTERIOR('home')) },
  // TEST C: same roster + coach C, different match plans
  planInside: { description: 'Home: coach C, match plan "go inside"', transform: compose(withCoach('home', COACH_C), withMatchPlan('home', { offense: { interior: 0.9, ballScreen: -0.2 } })) },
  planSpread: { description: 'Home: coach C, match plan "spread and move it"', transform: compose(withCoach('home', COACH_C), withMatchPlan('home', { offense: { interior: -0.8, ballMovement: 0.7, offBall: 0.3 } })) },
  planPush: { description: 'Home: coach C, match plan "push the pace"', transform: compose(withCoach('home', COACH_C), withMatchPlan('home', { offense: { tempo: 0.9, crash: -0.2 }, defense: { pressure: 0.3 } })) },
  // TEST D: same home team (neutral), different opponent
  oppCreation: { description: 'Away: creation roster (home unchanged)', transform: ROSTER_CREATION('away') },
  oppDefense: { description: 'Away: defense roster (home unchanged)', transform: ROSTER_DEFENSE('away') },
  oppCoachA: { description: 'Away: coach A (home unchanged)', transform: withCoach('away', COACH_A) },
  // BT5.26: adaptation (home defends with a deep drop against elite pull-up handlers)
  adaptHigh: { description: 'Home: deep-drop coach, adaptability 95 / knowledge 85, vs away creation roster', transform: compose(withCoach('home', { ...COACH_C, defense: { ...COACH_C.defense, coverage: 'drop', dropDepth: 0.9 }, adaptability: 95, tacticalKnowledge: 85 }), ROSTER_CREATION('away')) },
  adaptLow: { description: 'Home: same deep-drop coach, adaptability 10, vs away creation roster', transform: compose(withCoach('home', { ...COACH_C, defense: { ...COACH_C.defense, coverage: 'drop', dropDepth: 0.9 }, adaptability: 10, tacticalKnowledge: 85 }), ROSTER_CREATION('away')) },
  // BT5.24: familiarity
  familiarityLow: { description: 'Home: coach C with tactical familiarity 20', transform: compose(withCoach('home', COACH_C), plan('home', (p) => ({ ...p, familiarity: 20 }))) },
  familiarityHigh: { description: 'Home: coach C with tactical familiarity 95', transform: compose(withCoach('home', COACH_C), plan('home', (p) => ({ ...p, familiarity: 95 }))) },
  // BT5.19 coverage cohorts: the home DEFENSE uses one coverage (knowledge 30: not bent per matchup), everything else equal
  covDrop: { description: 'Home defense: drop', transform: withCoach('home', coverageCoach('drop')) },
  covSwitch: { description: 'Home defense: switch', transform: withCoach('home', coverageCoach('switch')) },
  covHedge: { description: 'Home defense: hedge', transform: withCoach('home', coverageCoach('hedge')) },
  covBlitz: { description: 'Home defense: blitz', transform: withCoach('home', coverageCoach('blitz')) },
  // BT5.19 help and pressure cohorts
  helpHigh: { description: 'Home defense: help 0.95', transform: withCoach('home', { ...COACH_C, defense: { ...COACH_C.defense, help: 0.95 }, adaptability: 10 }) },
  helpLow: { description: 'Home defense: help 0.05', transform: withCoach('home', { ...COACH_C, defense: { ...COACH_C.defense, help: 0.05 }, adaptability: 10 }) },
  pressureHigh: { description: 'Home defense: pressure 0.95', transform: withCoach('home', { ...COACH_C, defense: { ...COACH_C.defense, pressure: 0.95 }, adaptability: 10 }) },
  pressureLow: { description: 'Home defense: pressure 0.05', transform: withCoach('home', { ...COACH_C, defense: { ...COACH_C.defense, pressure: 0.05 }, adaptability: 10 }) },
}
