import type { BasketballPosition } from '@/domain/primitives'
import { BASKETBALL_POSITIONS } from '@/domain/primitives'
import type { PlayerId, TeamId } from '@/domain/ids'

/** Bench slots B1 (highest priority) through B7. */
export const BENCH_SLOTS = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'] as const
export type BenchSlot = typeof BENCH_SLOTS[number]

/** Canonical starter + bench slot identifiers, in display order. */
export type LineupSlot = BasketballPosition | BenchSlot
export const LINEUP_SLOTS: readonly LineupSlot[] = [...BASKETBALL_POSITIONS, ...BENCH_SLOTS]

/**
 * The single canonical persisted match-squad lineup for a team: which real roster
 * player (if any) occupies each starting position and each bench slot. A player not
 * present in either map is unassigned/has no match role. Domain/save-state authority
 * for starters+bench across Plantilla and Tactics — never a UI-local or localStorage
 * concept.
 */
export interface TeamLineup {
  readonly teamId: TeamId
  readonly starters: Readonly<Partial<Record<BasketballPosition, PlayerId>>>
  readonly bench: Readonly<Partial<Record<BenchSlot, PlayerId>>>
}

export function createDefaultTeamLineup(teamId: TeamId): TeamLineup {
  return { teamId, starters: {}, bench: {} }
}

function isBenchSlot(slot: LineupSlot): slot is BenchSlot {
  return (BENCH_SLOTS as readonly string[]).includes(slot)
}

/** Removes `playerId` from whichever slot (if any) it currently occupies. */
export function clearPlayerFromLineup(lineup: TeamLineup, playerId: PlayerId): TeamLineup {
  const starters = Object.fromEntries(Object.entries(lineup.starters).filter(([, id]) => id !== playerId)) as TeamLineup['starters']
  const bench = Object.fromEntries(Object.entries(lineup.bench).filter(([, id]) => id !== playerId)) as TeamLineup['bench']
  return { ...lineup, starters, bench }
}

export function clearLineupSlot(lineup: TeamLineup, slot: LineupSlot): TeamLineup {
  if (isBenchSlot(slot)) {
    const bench = { ...lineup.bench }
    delete bench[slot]
    return { ...lineup, bench }
  }
  const starters = { ...lineup.starters }
  delete starters[slot]
  return { ...lineup, starters }
}

/**
 * Assigns `playerId` to `slot`, deterministically resolving conflicts:
 * - the player is first removed from any slot it previously held;
 * - whichever player previously held `slot` (if any) becomes unassigned.
 * Invariants preserved: at most one player per slot, at most one slot per player.
 */
export function assignLineupSlot(lineup: TeamLineup, slot: LineupSlot, playerId: PlayerId): TeamLineup {
  const vacated = clearPlayerFromLineup(lineup, playerId)
  if (isBenchSlot(slot)) {
    return { ...vacated, bench: { ...vacated.bench, [slot]: playerId } }
  }
  return { ...vacated, starters: { ...vacated.starters, [slot]: playerId } }
}

/** The canonical slot currently occupied by `playerId`, if any. */
export function getLineupSlotForPlayer(lineup: TeamLineup, playerId: PlayerId): LineupSlot | undefined {
  for (const position of BASKETBALL_POSITIONS) {
    if (lineup.starters[position] === playerId) return position
  }
  for (const slot of BENCH_SLOTS) {
    if (lineup.bench[slot] === playerId) return slot
  }
  return undefined
}

/** All occupied slot -> player assignments, in canonical PG..C, B1..B7 order. */
export function getLineupAssignments(lineup: TeamLineup): readonly { readonly slot: LineupSlot; readonly playerId: PlayerId }[] {
  const assignments: { readonly slot: LineupSlot; readonly playerId: PlayerId }[] = []
  for (const position of BASKETBALL_POSITIONS) {
    const playerId = lineup.starters[position]
    if (playerId !== undefined) assignments.push({ slot: position, playerId })
  }
  for (const slot of BENCH_SLOTS) {
    const playerId = lineup.bench[slot]
    if (playerId !== undefined) assignments.push({ slot, playerId })
  }
  return assignments
}

/** Validates that every assigned player belongs to the roster and each slot/player appears at most once. */
export function validateTeamLineup(lineup: TeamLineup, rosterPlayerIds: readonly PlayerId[]): void {
  const roster = new Set(rosterPlayerIds)
  const seenPlayers = new Set<PlayerId>()
  for (const { slot, playerId } of getLineupAssignments(lineup)) {
    if (!roster.has(playerId)) throw new RangeError(`Lineup slot ${slot} references player ${playerId} outside the team roster`)
    if (seenPlayers.has(playerId)) throw new RangeError(`Player ${playerId} occupies more than one lineup slot`)
    seenPlayers.add(playerId)
  }
}
