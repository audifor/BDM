import type { GameDate } from '@/domain/date'
import { isInjuryActive, type InjuryRecord } from '@/domain/injury'
import type { TeamId } from '@/domain/ids'
import { getAvailableRosterPlayers, type GameWorld } from '@/domain/world'
import { MINIMUM_MATCH_SQUAD_SIZE } from '@/engine/match'

/**
 * MX0.2: the canonical rules an injury producer must honor before recording an injury, in one place.
 *
 * - A Player cannot carry two injuries whose recovery windows overlap (`validateInjury` enforces this). A Game
 *   may be resolved while the world clock is on an earlier date, so injury windows are not necessarily produced
 *   in chronological order; the producer must check the same overlap in both directions instead of only
 *   "is the Player injured on the Game date".
 * - BDM already refuses to let an injury drop a club below five available Players (`applyPostMatchInjuries`);
 *   Training must honor the same playable-minimum rule, or an otherwise valid club becomes unable to dress five
 *   and the canonical result-application chain (which re-derives TeamStrength from availability) fails the day.
 */
export function overlapsRecordedInjury(world: GameWorld, candidate: InjuryRecord): boolean {
  return Object.values(world.injuriesById).some((existing) => existing.playerId === candidate.playerId
    && existing.id !== candidate.id
    && (isInjuryActive(existing, candidate.injuredOn) || isInjuryActive(candidate, existing.injuredOn)))
}

/** The subset of `candidates` that may be recorded without breaking the overlap rule or the playable minimum. */
export function selectRecordableInjuries(
  world: GameWorld,
  candidates: readonly InjuryRecord[],
  teamIdForInjury: (injury: InjuryRecord) => TeamId | undefined,
  onDate: GameDate,
): readonly InjuryRecord[] {
  // Order-preserving and deterministic: the first candidate for a Player wins, later overlapping ones are dropped.
  const kept: InjuryRecord[] = []
  for (const candidate of candidates) {
    if (overlapsRecordedInjury(world, candidate)) continue
    if (kept.some((other) => other.playerId === candidate.playerId
      && (isInjuryActive(other, candidate.injuredOn) || isInjuryActive(candidate, other.injuredOn)))) continue
    kept.push(candidate)
  }
  const remaining = new Map<TeamId, number>()
  return kept.filter((injury) => {
    const teamId = teamIdForInjury(injury)
    if (teamId === undefined) return true
    const available = remaining.get(teamId) ?? getAvailableRosterPlayers(world, teamId, onDate).length
    if (available <= MINIMUM_MATCH_SQUAD_SIZE) return false
    remaining.set(teamId, available - 1)
    return true
  })
}

/** Whether every candidate may be recorded without breaking the overlap rule or the playable minimum. */
export function canRecordInjuries(
  world: GameWorld,
  candidates: readonly InjuryRecord[],
  teamIdForInjury: (injury: InjuryRecord) => TeamId | undefined,
  onDate: GameDate,
): boolean {
  return selectRecordableInjuries(world, candidates, teamIdForInjury, onDate).length === candidates.length
}
