import type { PlayerId } from '@/domain/ids'
import type { ShotZone } from '../ShotResolution'
import type { MatchTacticalPlan, TacticalLevel } from './MatchTacticalPlan'

export function applyPaceToPossessionDuration(duration: number, pace: TacticalLevel): number { return clamp(duration - pace * 2, 6, 30) }
export function tacticalShotFactor(level: TacticalLevel): number { return 1 + level * 0.20 }
export function applyShotProfile(weights: Readonly<Record<ShotZone, number>>, plan: MatchTacticalPlan): Readonly<Record<ShotZone, number>> { return { rim: weights.rim * tacticalShotFactor(plan.shotProfile.rim), midRange: weights.midRange * tacticalShotFactor(plan.shotProfile.midRange), threePoint: weights.threePoint * tacticalShotFactor(plan.shotProfile.threePoint) } }
export function tacticalUsageWeight(playerId: PlayerId, naturalWeight: number, activeLineup: readonly PlayerId[], plan: MatchTacticalPlan): number { return plan.featuredPlayerId === playerId && activeLineup.includes(playerId) ? naturalWeight * 1.25 : naturalWeight }
export function calculateTacticalDefenseModifier(plan: MatchTacticalPlan, zone: ShotZone): number {
  if (plan.defense.interior === 2) return zone === 'rim' ? 6 : -3
  if (plan.defense.perimeter === 2) return zone === 'rim' ? -3 : zone === 'midRange' ? 4 : 6
  return 0
}
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)) }
