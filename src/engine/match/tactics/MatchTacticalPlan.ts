import type { PlayerId } from '@/domain/ids'

export type TacticalLevel = -2 | -1 | 0 | 1 | 2

export interface MatchTacticalPlan {
  readonly pace: TacticalLevel
  readonly shotProfile: { readonly rim: TacticalLevel; readonly midRange: TacticalLevel; readonly threePoint: TacticalLevel }
  readonly defense: { readonly interior: TacticalLevel; readonly perimeter: TacticalLevel }
  readonly featuredPlayerId?: PlayerId
}

export const TACTICAL_DEFENSE_OPTIONS = [
  { label: 'Individual', interior: 0, perimeter: 0 },
  { label: 'Proteger pintura', interior: 2, perimeter: -1 },
  { label: 'Presión perimetral', interior: -1, perimeter: 2 },
] as const

export function createDefaultTacticalPlan(): MatchTacticalPlan { return { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } } }

export function validateTacticalPlan(plan: MatchTacticalPlan, squad: readonly PlayerId[]): void {
  for (const level of [plan.pace, plan.shotProfile.rim, plan.shotProfile.midRange, plan.shotProfile.threePoint, plan.defense.interior, plan.defense.perimeter]) {
    if (!Number.isInteger(level) || level < -2 || level > 2) throw new Error('Tactical levels must be integers from -2 to 2')
  }
  const validDefense = TACTICAL_DEFENSE_OPTIONS.some(({ interior, perimeter }) => plan.defense.interior === interior && plan.defense.perimeter === perimeter)
  if (!validDefense) throw new Error('Tactical defense must use a supported Alpha preset')
  if (plan.featuredPlayerId !== undefined && !squad.includes(plan.featuredPlayerId)) throw new Error('Featured Player must belong to the team squad')
}
