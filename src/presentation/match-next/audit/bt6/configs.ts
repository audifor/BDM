import { COACH_C, ROSTER_CREATION, ROSTER_DEFENSE, compose, withCoach, type ExperimentConfig } from '../bt5/configs'

/** BT6 controlled defensive experiments (the BT5 configs remain available by name). The home DEFENSE changes; the away offense is the default. */
const rigid = (defense: Partial<typeof COACH_C.defense>) => withCoach('home', { ...COACH_C, defense: { ...COACH_C.defense, ...defense }, adaptability: 10 })

export const BT6_CONFIGS: Readonly<Record<string, ExperimentConfig>> = {
  pressureMid: { description: 'Home defense: pressure 0.5', transform: rigid({ pressure: 0.5 }) },
  // Pressure with elite point-of-attack defenders vs with the default ones: containment must decide whether pressure pays.
  pressureHighDef: { description: 'Home: defense roster, pressure 0.95', transform: compose(rigid({ pressure: 0.95 }), ROSTER_DEFENSE('home')) },
  pressureLowDef: { description: 'Home: defense roster, pressure 0.05', transform: compose(rigid({ pressure: 0.05 }), ROSTER_DEFENSE('home')) },
  // Pressure against elite handlers (creation roster on the away side): ball security and creation must punish it.
  pressureHighVsCreation: { description: 'Home pressure 0.95 vs away creation roster', transform: compose(rigid({ pressure: 0.95 }), ROSTER_CREATION('away')) },
  pressureLowVsCreation: { description: 'Home pressure 0.05 vs away creation roster', transform: compose(rigid({ pressure: 0.05 }), ROSTER_CREATION('away')) },
  helpMid: { description: 'Home defense: help 0.5', transform: rigid({ help: 0.5 }) },
  // BT6.1.25: player quality on both ends (the home OFFENSE is the creation roster; the away defense is elite or default).
  creationVsDefense: { description: 'Home creation roster vs away defense roster', transform: compose(ROSTER_CREATION('home'), ROSTER_DEFENSE('away')) },
}
