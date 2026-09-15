import type { PlayerId, TeamId } from '@/domain/ids'
import type { Player } from '@/domain/player'

import type { MatchLineups, MatchSquads } from '../MatchEngine'

export interface RotationInstruction {
  readonly period: number
  readonly clockThresholdSeconds: number
  readonly playerOutId: PlayerId
  readonly playerInId: PlayerId
}

export interface TeamRotationPlan {
  readonly teamId: TeamId
  readonly instructions: readonly RotationInstruction[]
}

interface RotationPlanOptions {
  readonly teamId: TeamId
  readonly squad: readonly PlayerId[]
  readonly initialLineup: readonly PlayerId[]
  readonly players: Readonly<Record<PlayerId, Player>>
  /**
   * The team's configured bench priority (TeamLineup B1..B7 order), when one
   * exists. This is eligibility-neutral: it never adds or removes candidates,
   * it only breaks ties among an already-eligible pool. When a player has no
   * configured slot (or none is supplied), squad order is the deterministic
   * fallback — never a computed player-quality ranking (MG2C / MG1 BUG-4).
   */
  readonly benchPriorityOrder?: readonly PlayerId[]
}

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const
const FIRST_WINDOW = ['SG', 'PF'] as const
const SECOND_WINDOW = ['PG', 'SF', 'C'] as const

/** Builds the deterministic prototype rotation for up to five uniquely assigned backups. */
export function createDefaultRotationPlan(options: RotationPlanOptions): TeamRotationPlan {
  const starters = new Map(POSITIONS.map((position) => [position, options.initialLineup.find((playerId) => options.players[playerId]!.basketball.primaryPosition === position)]))
  const availableBench = options.squad.filter((playerId) => !options.initialLineup.includes(playerId))
  const backups = new Map<(typeof POSITIONS)[number], PlayerId>()

  for (const position of POSITIONS) {
    if (starters.get(position) === undefined) continue
    const samePosition = availableBench.filter((playerId) => !backupsHas(backups, playerId) && options.players[playerId]!.basketball.primaryPosition === position)
    const fallback = availableBench.filter((playerId) => !backupsHas(backups, playerId))
    const selected = preferredCandidate(samePosition.length > 0 ? samePosition : fallback, options.benchPriorityOrder)
    if (selected !== undefined) backups.set(position, selected)
  }

  return { teamId: options.teamId, instructions: [
    ...substitutionsFor(1, 240, FIRST_WINDOW, starters, backups, false),
    ...substitutionsFor(1, 120, SECOND_WINDOW, starters, backups, false),
    ...substitutionsFor(2, 480, SECOND_WINDOW, starters, backups, true),
    ...substitutionsFor(2, 360, FIRST_WINDOW, starters, backups, true),
    ...substitutionsFor(3, 240, FIRST_WINDOW, starters, backups, false),
    ...substitutionsFor(3, 120, SECOND_WINDOW, starters, backups, false),
    ...substitutionsFor(4, 480, SECOND_WINDOW, starters, backups, true),
    ...substitutionsFor(4, 360, FIRST_WINDOW, starters, backups, true),
  ] }
}

function substitutionsFor(
  period: number,
  clockThresholdSeconds: number,
  positions: readonly (typeof POSITIONS)[number][],
  starters: ReadonlyMap<(typeof POSITIONS)[number], PlayerId | undefined>,
  backups: ReadonlyMap<(typeof POSITIONS)[number], PlayerId>,
  returnStarter: boolean,
): readonly RotationInstruction[] {
  return positions.flatMap((position) => {
    const starter = starters.get(position)
    const backup = backups.get(position)
    if (starter === undefined || backup === undefined) return []
    return [{ period, clockThresholdSeconds, playerOutId: returnStarter ? backup : starter, playerInId: returnStarter ? starter : backup }]
  })
}

/**
 * Picks one candidate from an already-eligible pool without ranking player quality
 * (MG2C / MG1 BUG-4): when the team has a configured bench priority (TeamLineup
 * B1..B7), the pool member that appears earliest in that priority wins; any
 * candidate outside the configured priority (or when none is supplied) falls
 * back to the pool's own stable order, which is itself squad/roster order —
 * never a computed impact/overall score. Ties within the fallback break on
 * PlayerId for full determinism.
 */
function preferredCandidate(playerIds: readonly PlayerId[], benchPriorityOrder: readonly PlayerId[] | undefined): PlayerId | undefined {
  if (playerIds.length === 0) return undefined
  if (benchPriorityOrder !== undefined) {
    for (const playerId of benchPriorityOrder) {
      if (playerIds.includes(playerId)) return playerId
    }
  }
  return [...playerIds].sort((left, right) => left.localeCompare(right))[0]
}

function backupsHas(backups: ReadonlyMap<(typeof POSITIONS)[number], PlayerId>, playerId: PlayerId): boolean {
  return [...backups.values()].includes(playerId)
}

export type { MatchLineups, MatchSquads }
