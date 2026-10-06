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
 * - No producer may record an injury that drops a club below the playable minimum: see PLAYABLE_MINIMUM_SAFETY.
 */

/**
 * PLAYABLE_MINIMUM_SAFETY — the career-loop playable-minimum injury floor.
 *
 * BDM refuses to record an injury that would leave a club below `MINIMUM_MATCH_SQUAD_SIZE` available Players.
 * This prevents career-loop dead ends while BDM has no canonical emergency player / replacement / forfeit
 * mechanism: without it, a structurally valid club becomes unable to dress five, and the canonical result chain
 * (which re-derives TeamStrength from availability) fails the whole day.
 *
 * It is a product safety policy, not a Basketball Truth rule. The canonical replacement — emergency signing,
 * reserve/youth call-up, temporary replacement, postponement, forfeit, or a competition-specific rule — is explicit
 * future product work.
 */
export const PLAYABLE_MINIMUM_SAFETY_AVAILABLE_PLAYERS = MINIMUM_MATCH_SQUAD_SIZE

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
    // PLAYABLE_MINIMUM_SAFETY: never leave a club below the playable minimum (see above).
    if (available <= PLAYABLE_MINIMUM_SAFETY_AVAILABLE_PLAYERS) return false
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
