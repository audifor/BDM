import type { GameDate } from '@/domain/date'
import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'

/** Calendar-only age; it changes on the birthday and never mutates Player data. */
export function calculateAge(dateOfBirth: GameDate, onDate: GameDate): number {
  const birthYear = Number(dateOfBirth.slice(0, 4)); const onYear = Number(onDate.slice(0, 4))
  return onYear - birthYear - (onDate.slice(5) < dateOfBirth.slice(5) ? 1 : 0)
}

export function getPlayerAge(world: GameWorld, playerId: PlayerId): number {
  const player = world.players[playerId]
  if (player === undefined) throw new Error(`Player does not exist: ${playerId}`)
  return calculateAge(player.bio.dateOfBirth, world.currentDate)
}
