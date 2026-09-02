import type { GameWorld } from '@/domain/world'
import { createStaffHumanEvent, SYSTEMIC_ATTRIBUTION, type StaffHumanContext } from '@/domain/staffHumanState'
import { applyStaffHumanEvent } from '@/engine/staff/StaffHumanReactionEngine'

/**
 * Wave 5A §15 — deterministic pattern detection over existing `StaffReactionRecord` history
 * (never a duplicate counter). Looks only at the most recent rejection-family reactions for this
 * Staff person: a single isolated rejection has small impact (handled by the base reaction
 * already); a real sequence escalates to `recommendationPatternNegative`. A later positive
 * sequence allows gradual recovery via `recommendationPatternPositive` — history is never erased,
 * only outweighed by what comes after.
 */
const REJECTION_KINDS = ['actionableRecommendationRejected', 'importantRecommendationRejected'] as const
const ACCEPTANCE_KINDS = ['recommendationAccepted', 'importantRecommendationAccepted'] as const
const PATTERN_WINDOW = 5
const NEGATIVE_PATTERN_THRESHOLD = 3
const POSITIVE_PATTERN_THRESHOLD = 3

export function detectRecommendationPattern(world: GameWorld, staffId: string): GameWorld {
  const context = Object.values(world.staffHumanContextsById)
    .filter((item) => item.staffId === staffId && item.endedOn === undefined)
    .sort((a, b) => b.startedOn.localeCompare(a.startedOn))[0]
  if (context === undefined) return world

  const recentAdvisory = Object.values(world.staffReactionRecordsById)
    .filter((record) => record.staffId === staffId && (REJECTION_KINDS as readonly string[]).includes(record.eventKind) || (ACCEPTANCE_KINDS as readonly string[]).includes(record.eventKind))
    .filter((record) => record.staffId === staffId)
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.id.localeCompare(a.id))
    .slice(0, PATTERN_WINDOW)

  const rejectionStreak = countLeadingStreak(recentAdvisory, (record) => (REJECTION_KINDS as readonly string[]).includes(record.eventKind))
  const acceptanceStreak = countLeadingStreak(recentAdvisory, (record) => (ACCEPTANCE_KINDS as readonly string[]).includes(record.eventKind))

  if (rejectionStreak >= NEGATIVE_PATTERN_THRESHOLD) return emitPatternEvent(world, context, staffId, 'recommendationPatternNegative', rejectionStreak)
  if (acceptanceStreak >= POSITIVE_PATTERN_THRESHOLD) return emitPatternEvent(world, context, staffId, 'recommendationPatternPositive', acceptanceStreak)
  return world
}

function countLeadingStreak<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  let count = 0
  for (const item of items) {
    if (!predicate(item)) break
    count += 1
  }
  return count
}

function emitPatternEvent(world: GameWorld, context: StaffHumanContext, staffId: string, kind: 'recommendationPatternNegative' | 'recommendationPatternPositive', streakLength: number): GameWorld {
  // Keyed by streak length so a LONGER streak (a stronger pattern) is a distinct, newly-idempotent
  // event rather than silently no-op-ing forever once the threshold is first crossed — this lets
  // the pattern reinforce (Wave 5A §15 "impacto acumulado") without spamming one event per rejection.
  const sourceEventId = `advisory-pattern:${context.id}:${kind}:${streakLength}`
  const event = createStaffHumanEvent({
    id: `event:${sourceEventId}`,
    kind,
    staffId: staffId as never,
    contextId: context.id,
    occurredOn: world.currentDate,
    importance: streakLength >= 5 ? 'CRITICAL' : 'IMPORTANT',
    sourceEventId,
    attribution: SYSTEMIC_ATTRIBUTION,
    payload: { streakLength },
  })
  return applyStaffHumanEvent(world, context, event).world
}
