import type { Player } from '@/domain/player'
import { getPlayer, type GameWorld } from '@/domain/world'
import type { MatchEvent } from '@/engine/match'

export interface MatchViewerPlayerToken {
  readonly player: Player
  readonly visualSlot: number
}

const POSITION_SLOTS = {
  PG: 0,
  SG: 1,
  SF: 2,
  PF: 3,
  C: 4,
} as const

/** Resolves the transient MatchSimulation lineup from the canonical GameWorld. */
export function resolveMatchLineup(world: GameWorld, playerIds: readonly Player['id'][]): readonly Player[] {
  return playerIds.map((playerId) => getPlayer(world, playerId))
}

/** Assigns presentation-only court slots, with deterministic fallback for duplicate positions. */
export function createMatchViewerTokens(world: GameWorld, playerIds: readonly Player['id'][]): readonly MatchViewerPlayerToken[] {
  const occupiedSlots = new Set<number>()

  return resolveMatchLineup(world, playerIds).map((player) => {
    const preferredSlot = POSITION_SLOTS[player.basketball.primaryPosition]
    const visualSlot = occupiedSlots.has(preferredSlot)
      ? [0, 1, 2, 3, 4].find((slot) => !occupiedSlots.has(slot))!
      : preferredSlot

    occupiedSlots.add(visualSlot)
    return { player, visualSlot }
  })
}

export function formatMatchEvent(event: MatchEvent, world: GameWorld): string {
  if (event.type === 'shotMade') return `${getPlayer(world, event.playerId).lastName} scores ${event.points}`
  if (event.type === 'shotMissed') return `${getPlayer(world, event.playerId).lastName} misses`
  if (event.type === 'turnover') return `${getPlayer(world, event.playerId).lastName} turnover`
  if (event.type === 'gameEnd') return 'FINAL'
  return event.type === 'periodStart' ? `${formatPeriod(event.period)} START` : `${formatPeriod(event.period)} END`
}

export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

export function formatPeriod(period: number): string {
  if (period <= 4) return `Q${period}`
  return period === 5 ? 'OT' : `${period - 4}OT`
}
