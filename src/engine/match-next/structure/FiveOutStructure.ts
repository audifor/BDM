import { distanceBetween, type CourtGeometry, type CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'

export type OffensiveSlotName = 'BALL' | 'STRONG_CORNER' | 'STRONG_SLOT' | 'WEAK_SLOT' | 'WEAK_CORNER'
export type OffensiveBallSide = 'TOP' | 'BOTTOM'

export interface OffensiveSlotTarget {
  readonly slot: Exclude<OffensiveSlotName, 'BALL'>
  readonly position: CourtPosition
}

export interface OffensiveStructureState {
  readonly teamId: TeamId
  readonly formation: '5OUT'
  readonly attackingBasket: CourtPosition
  readonly ballSide: OffensiveBallSide
  readonly ballPlayerId: PlayerId
  readonly slots: readonly OffensiveSlotTarget[]
  readonly assignments: readonly { readonly playerId: PlayerId; readonly slot: OffensiveSlotName }[]
  readonly continuityAnchors?: readonly {
    readonly playerId: PlayerId
    readonly slot: Exclude<OffensiveSlotName, 'BALL'>
    readonly position: CourtPosition
  }[]
  readonly lastReassignmentT: number
  readonly setupStartedT: number | null
  readonly reassignmentCount: number
}

export function resolveBallSide(ball: CourtPosition, court: CourtGeometry, previous: OffensiveBallSide | undefined): OffensiveBallSide {
  const side = lateralSide(ball, court)
  if (!previous) return side
  const signed = ball.y - court.widthMeters / 2
  if (previous === 'TOP' && signed > 0.8) return 'BOTTOM'
  if (previous === 'BOTTOM' && signed < -0.8) return 'TOP'
  return previous
}

export function resolveFiveOutTargets(court: CourtGeometry, ball: CourtPosition, attackingBasket: CourtPosition, ballSide: OffensiveBallSide): readonly OffensiveSlotTarget[] {
  void ball
  const direction = attackingBasket.x >= court.lengthMeters / 2 ? 1 : -1
  const side = ballSide === 'TOP' ? -1 : 1
  const centerY = court.widthMeters / 2
  const arc = court.threePointLine.arcRadiusMeters
  // Corners: on the corner-three strip, just off the sideline and level with the basket (a real corner, ~6.9 m from it).
  const cornerY = clamp(court.threePointLine.cornerOffsetMeters * 0.6, 0.35, court.widthMeters / 2 - 0.5)
  const cornerBack = -0.3
  // Wings: outside the arc at roughly 40 degrees from the basket axis, spaced from the corners and from each other.
  const wingRadius = arc + 0.7
  const wingAngle = 0.72
  const wingBack = wingRadius * Math.cos(wingAngle)
  const wingLateral = Math.min(wingRadius * Math.sin(wingAngle), centerY - 1.2)
  const strongCornerY = ballSide === 'TOP' ? cornerY : court.widthMeters - cornerY
  const point = (back: number, y: number): CourtPosition => ({
    x: clamp(attackingBasket.x - direction * back, 0.5, court.lengthMeters - 0.5),
    y: clamp(y, 0.3, court.widthMeters - 0.3),
  })
  return [
    { slot: 'STRONG_CORNER', position: point(cornerBack, strongCornerY) },
    { slot: 'STRONG_SLOT', position: point(wingBack, centerY + side * wingLateral) },
    { slot: 'WEAK_SLOT', position: point(wingBack, centerY - side * wingLateral) },
    { slot: 'WEAK_CORNER', position: point(cornerBack, court.widthMeters - strongCornerY) },
  ]
}

export function slotTargetsAreValid(slots: readonly OffensiveSlotTarget[], court: CourtGeometry): boolean {
  return slots.length === 4
    && new Set(slots.map((item) => item.slot)).size === 4
    && slots.every((item) => item.position.x >= 0 && item.position.x <= court.lengthMeters && item.position.y >= 0 && item.position.y <= court.widthMeters)
    && slots.every((item, index) => slots.slice(index + 1).every((other) => distanceBetween(item.position, other.position) >= 3))
}

export function attackingBasketForTeam(teamId: TeamId, homeTeamId: TeamId, period: number, court: CourtGeometry): CourtPosition {
  const homeAttacksRight = (period - 1) % 4 < 2
  const teamAttacksRight = teamId === homeTeamId ? homeAttacksRight : !homeAttacksRight
  return teamAttacksRight ? court.baskets.right : court.baskets.left
}

function lateralSide(ball: CourtPosition, court: CourtGeometry): OffensiveBallSide { return ball.y < court.widthMeters / 2 ? 'TOP' : 'BOTTOM' }

function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)) }
