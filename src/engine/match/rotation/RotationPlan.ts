import type { Player } from '@/domain/player'
import type { PlayerId, TeamId } from '@/domain/ids'
import { calculatePlayerImpact } from '@/engine/team'

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
    const selected = bestPlayer(samePosition.length > 0 ? samePosition : fallback, options.players)
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

function bestPlayer(playerIds: readonly PlayerId[], players: Readonly<Record<PlayerId, Player>>): PlayerId | undefined {
  return [...playerIds].sort((left, right) => calculatePlayerImpact(players[right]!)-calculatePlayerImpact(players[left]!) || left.localeCompare(right))[0]
}

function backupsHas(backups: ReadonlyMap<(typeof POSITIONS)[number], PlayerId>, playerId: PlayerId): boolean {
  return [...backups.values()].includes(playerId)
}

export type { MatchLineups, MatchSquads }
