import type { Player } from '@/domain/player'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { TeamRotationIntent } from '@/domain/tactics'
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

/** Compiles a validated per-period allocation into substitutions consumed by the existing runner. */
export function createRotationPlanFromMinutes(options: RotationPlanOptions & { readonly minutesByPeriod: NonNullable<TeamRotationIntent['minutesByPeriod']>; readonly periodMinutes: readonly number[] }): TeamRotationPlan | undefined {
  const { squad, minutesByPeriod, periodMinutes } = options
  if (periodMinutes.length === 0 || periodMinutes.some((minutes) => !Number.isInteger(minutes) || minutes <= 0)) return undefined
  if (Object.keys(minutesByPeriod).some((playerId) => !squad.includes(playerId as PlayerId))) return undefined
  for (const [periodIndex, length] of periodMinutes.entries()) {
    const total = squad.reduce((sum, playerId) => {
      const minutes = minutesByPeriod[playerId]?.[periodIndex] ?? 0
      return Number.isInteger(minutes) && minutes >= 0 && minutes <= length ? sum + minutes : Number.NaN
    }, 0)
    if (total !== length * 5) return undefined
  }

  const instructions: RotationInstruction[] = []
  let active = [...options.initialLineup]
  for (const [periodIndex, length] of periodMinutes.entries()) {
    const remaining = new Map(squad.map((playerId) => [playerId, minutesByPeriod[playerId]?.[periodIndex] ?? 0]))
    for (let elapsed = 0; elapsed < length; elapsed += 1) {
      const next = [...squad]
        .sort((left, right) => (remaining.get(right)! - remaining.get(left)!) || Number(active.includes(right)) - Number(active.includes(left)) || left.localeCompare(right))
        .slice(0, 5)
      const outgoing = active.filter((playerId) => !next.includes(playerId))
      const incoming = next.filter((playerId) => !active.includes(playerId))
      const clockThresholdSeconds = (length - elapsed) * 60
      for (let index = 0; index < outgoing.length; index += 1) {
        instructions.push({ period: periodIndex + 1, clockThresholdSeconds, playerOutId: outgoing[index]!, playerInId: incoming[index]! })
      }
      active = next
      for (const playerId of next) remaining.set(playerId, remaining.get(playerId)! - 1)
    }
  }
  return { teamId: options.teamId, instructions }
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
