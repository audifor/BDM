import { distanceBetween, type CourtPosition } from '@/domain/court'
import type { PlayerId } from '@/domain/ids'
import type { OffensiveSlotName, OffensiveSlotTarget } from './FiveOutStructure'

const SPACE_SLOTS: readonly Exclude<OffensiveSlotName, 'BALL'>[] = ['STRONG_CORNER', 'STRONG_SLOT', 'WEAK_SLOT', 'WEAK_CORNER', 'POST']
type SpaceAssignment = { readonly playerId: PlayerId; readonly slot: Exclude<OffensiveSlotName, 'BALL'> }

export function assignFiveOutSlots(
  playerPositions: readonly { readonly playerId: PlayerId; readonly position: CourtPosition }[],
  targets: readonly OffensiveSlotTarget[],
  previous: readonly { readonly playerId: PlayerId; readonly slot: OffensiveSlotName }[] = [],
  fixed?: SpaceAssignment,
): readonly SpaceAssignment[] {
  const players = [...playerPositions].sort((left, right) => String(left.playerId).localeCompare(String(right.playerId)))
  if (players.length !== 4 || targets.length !== 4) throw new Error('5OUT assignment requires four SPACE players and four targets')
  const targetsBySlot = new Map(targets.map((item) => [item.slot, item.position]))
  const retained: SpaceAssignment[] = []
  const usedSlots = new Set<Exclude<OffensiveSlotName, 'BALL'>>()

  // Keep valid assignments fixed. Only players without a retained slot take part
  // in the distance search, so an owner change fills one vacancy instead of
  // globally re-optimizing all four players.
  for (const player of players) {
    const prior = previous.find((item) => item.playerId === player.playerId)?.slot
    if (!prior || prior === 'BALL' || !targetsBySlot.has(prior) || usedSlots.has(prior)) continue
    retained.push({ playerId: player.playerId, slot: prior })
    usedSlots.add(prior)
  }

  // BT5.8: a fixed occupant (the post player of a 4-out-1-in) takes his slot whatever the distances.
  if (fixed !== undefined && targetsBySlot.has(fixed.slot) && players.some((player) => player.playerId === fixed.playerId)) {
    const holder = retained.findIndex((item) => item.slot === fixed.slot || item.playerId === fixed.playerId)
    if (holder >= 0 && !(retained[holder]!.slot === fixed.slot && retained[holder]!.playerId === fixed.playerId)) {
      for (let index = retained.length - 1; index >= 0; index -= 1) if (retained[index]!.slot === fixed.slot || retained[index]!.playerId === fixed.playerId) { usedSlots.delete(retained[index]!.slot); retained.splice(index, 1) }
    }
    if (!retained.some((item) => item.playerId === fixed.playerId)) { retained.push({ playerId: fixed.playerId, slot: fixed.slot }); usedSlots.add(fixed.slot) }
  }
  const unassigned = players.filter((player) => !retained.some((item) => item.playerId === player.playerId))
  const openSlots = targets.map((item) => item.slot).filter((slot) => !usedSlots.has(slot))
  let bestCost = Number.POSITIVE_INFINITY
  let best: SpaceAssignment[] = []
  const visit = (playerIndex: number, used: Set<Exclude<OffensiveSlotName, 'BALL'>>, current: SpaceAssignment[], cost: number) => {
    if (playerIndex === unassigned.length) {
      if (cost < bestCost - 1e-9 || Math.abs(cost - bestCost) <= 1e-9 && assignmentKey(current) < assignmentKey(best)) {
        bestCost = cost
        best = [...current]
      }
      return
    }
    const player = unassigned[playerIndex]!
    for (const slot of openSlots) {
      if (used.has(slot)) continue
      const target = targetsBySlot.get(slot)
      if (!target) throw new Error(`Missing 5OUT target ${slot}`)
      used.add(slot)
      current.push({ playerId: player.playerId, slot })
      visit(playerIndex + 1, used, current, cost + distanceBetween(player.position, target))
      current.pop()
      used.delete(slot)
    }
  }
  visit(0, new Set(usedSlots), [...retained], 0)
  return best.sort((left, right) => String(left.playerId).localeCompare(String(right.playerId)))
}

function assignmentKey(items: readonly SpaceAssignment[]): string {
  const slotOrder = new Map(SPACE_SLOTS.map((slot, index) => [slot, index]))
  return [...items].sort((a, b) => String(a.playerId).localeCompare(String(b.playerId)))
    .map((item) => `${String(item.playerId)}:${slotOrder.get(item.slot)}`)
    .join('|')
}
