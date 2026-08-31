import type { PlayerId, TeamId } from '@/domain/ids'
import { isInjuryActive } from '@/domain/injury'
import { resolveAdvisoryResponsibility, medicalQuality } from '@/engine/staff'
import { getTeam, type GameWorld } from '@/domain/world'

export type MedicalRiskBand = 'low' | 'elevated' | 'high'

export interface MedicalRiskAssessment {
  readonly playerId: PlayerId
  readonly riskBand: MedicalRiskBand
  readonly riskScore: number
  readonly reasons: readonly string[]
  /** Present only when `riskAssessment` is genuinely `advisory` with a valid holder — never Staff-authored otherwise. */
  readonly quality?: number
}

const FATIGUE_HIGH_THRESHOLD = 70
const FATIGUE_ELEVATED_THRESHOLD = 45
const RECENT_INJURY_WINDOW_COUNT = 2

/**
 * Pure, non-persisted, non-mutating derived projection (docs/STAFF_SYSTEM_V2.md §17) — a UI-only
 * "risk warning" surface, never a domain-state effect. Reads ONLY canonical visible state already
 * in `world`: roster membership, `careerFatigueByPlayerId`, active injury state, and prior
 * `InjuryRecord` history. Never reads hidden Player truth (ratings/potential/development) — there
 * is none to read here in the first place, since fatigue/injury history are already public
 * canonical fields, not a Player Intelligence projection.
 *
 * `quality`/holder resolution is genuinely advisory-gated: a `vacant`, `userControlled` or
 * `organizational` `riskAssessment` responsibility never produces a Staff-authored `quality`
 * signal (the field is simply omitted) — only a real `advisory` holder resolved through
 * `resolveAdvisoryResponsibility` contributes one, and an overloaded holder's `quality` degrades
 * monotonically through the shared `calculateOverloadPenalty` (baked into `medicalQuality`).
 *
 * Deterministic ordering: results are sorted by `playerId` so callers/tests never depend on
 * object-iteration order.
 */
export function getMedicalRiskAssessments(world: GameWorld, teamId: TeamId): readonly MedicalRiskAssessment[] {
  const team = getTeam(world, teamId)
  const resolution = resolveAdvisoryResponsibility(world, teamId, 'riskAssessment')
  const seed = resolution === undefined ? undefined : `staff-decision-quality-v1:${resolution.responsibilityId}:${world.currentDate}`
  const quality = resolution === undefined || seed === undefined ? undefined : medicalQuality(resolution.context, seed)

  return [...team.rosterPlayerIds]
    .sort()
    .map((playerId) => assessPlayer(world, playerId, quality))
}

function assessPlayer(world: GameWorld, playerId: PlayerId, quality: number | undefined): MedicalRiskAssessment {
  const fatigue = world.careerFatigueByPlayerId[playerId] ?? 0
  const activeInjury = Object.values(world.injuriesById).find((injury) => injury.playerId === playerId && isInjuryActive(injury, world.currentDate))
  const priorInjuryCount = Object.values(world.injuriesById).filter((injury) => injury.playerId === playerId && injury.id !== activeInjury?.id).length

  const reasons: string[] = []
  let riskScore = 0

  if (activeInjury !== undefined) { reasons.push(`Active ${activeInjury.severity} injury`); riskScore += activeInjury.severity === 'serious' ? 45 : activeInjury.severity === 'moderate' ? 30 : 15 }
  if (fatigue >= FATIGUE_HIGH_THRESHOLD) { reasons.push('High fatigue'); riskScore += 30 }
  else if (fatigue >= FATIGUE_ELEVATED_THRESHOLD) { reasons.push('Elevated fatigue'); riskScore += 15 }
  if (priorInjuryCount >= RECENT_INJURY_WINDOW_COUNT) { reasons.push('Recurring injury history'); riskScore += 20 }

  const clampedScore = Math.max(0, Math.min(100, riskScore))
  const riskBand: MedicalRiskBand = clampedScore >= 60 ? 'high' : clampedScore >= 30 ? 'elevated' : 'low'
  return { playerId, riskBand, riskScore: clampedScore, reasons, ...(quality === undefined ? {} : { quality }) }
}
