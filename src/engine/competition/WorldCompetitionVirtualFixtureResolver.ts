import type { WorldCompetitionFixedBracketPlanV1, WorldCompetitionFixtureParticipantRefV1, WorldCompetitionVirtualFixtureV1 } from './WorldCompetitionFixedBracket'

export interface WorldCompetitionVirtualFixtureOutcomeV1 {
  readonly fixtureId: string
  readonly winnerEntryId: string
  readonly loserEntryId: string
}

export interface WorldCompetitionResolvedVirtualFixtureV1 {
  readonly fixtureId: string
  readonly nodeKey: string
  readonly fixtureOrder: number
  readonly participantEntryIds: readonly [string, string] | null
  readonly ready: boolean
  readonly completed: boolean
}

/**
 * Resolves participant references for an instantiated bracket using already completed predecessor
 * outcomes. The function is pure and validates that every declared outcome belongs to the resolved
 * participants of its fixture.
 */
export function resolveWorldCompetitionVirtualFixturesV1(
  plan: WorldCompetitionFixedBracketPlanV1,
  outcomes: readonly WorldCompetitionVirtualFixtureOutcomeV1[],
): readonly WorldCompetitionResolvedVirtualFixtureV1[] {
  const fixtureById = uniqueIndex(plan.fixtures, (fixture) => fixture.fixtureId, 'virtual fixture')
  const outcomeByFixtureId = uniqueIndex(outcomes, (outcome) => outcome.fixtureId, 'virtual fixture outcome')
  for (const fixtureId of Object.keys(outcomeByFixtureId)) {
    if (fixtureById[fixtureId] === undefined) throw new Error(`Virtual fixture outcome references unknown fixture: ${fixtureId}`)
  }

  const resolvedEntryIdsByFixtureId: Record<string, readonly [string, string]> = {}
  const resolved: WorldCompetitionResolvedVirtualFixtureV1[] = []

  for (const fixture of plan.fixtures) {
    const participantEntryIds = resolveParticipants(fixture, outcomeByFixtureId, resolvedEntryIdsByFixtureId)
    const outcome = outcomeByFixtureId[fixture.fixtureId]

    if (outcome !== undefined) {
      if (participantEntryIds === null) throw new Error(`Completed virtual fixture is not ready: ${fixture.fixtureId}`)
      validateOutcome(fixture.fixtureId, participantEntryIds, outcome)
    }

    if (participantEntryIds !== null) resolvedEntryIdsByFixtureId[fixture.fixtureId] = participantEntryIds
    resolved.push(Object.freeze({
      fixtureId: fixture.fixtureId,
      nodeKey: fixture.nodeKey,
      fixtureOrder: fixture.fixtureOrder,
      participantEntryIds,
      ready: participantEntryIds !== null,
      completed: outcome !== undefined,
    }))
  }

  return Object.freeze(resolved)
}

export function listReadyUncompletedWorldCompetitionFixturesV1(
  plan: WorldCompetitionFixedBracketPlanV1,
  outcomes: readonly WorldCompetitionVirtualFixtureOutcomeV1[],
): readonly WorldCompetitionResolvedVirtualFixtureV1[] {
  return Object.freeze(resolveWorldCompetitionVirtualFixturesV1(plan, outcomes).filter((fixture) => fixture.ready && !fixture.completed))
}

function resolveParticipants(
  fixture: WorldCompetitionVirtualFixtureV1,
  outcomeByFixtureId: Readonly<Record<string, WorldCompetitionVirtualFixtureOutcomeV1>>,
  resolvedEntryIdsByFixtureId: Readonly<Record<string, readonly [string, string]>>,
): readonly [string, string] | null {
  const left = resolveParticipant(fixture.participants[0], outcomeByFixtureId, resolvedEntryIdsByFixtureId)
  const right = resolveParticipant(fixture.participants[1], outcomeByFixtureId, resolvedEntryIdsByFixtureId)
  if (left === null || right === null) return null
  if (left === right) throw new Error(`Virtual fixture resolves the same entry on both sides: ${fixture.fixtureId}`)
  return Object.freeze([left, right]) as readonly [string, string]
}

function resolveParticipant(
  ref: WorldCompetitionFixtureParticipantRefV1,
  outcomeByFixtureId: Readonly<Record<string, WorldCompetitionVirtualFixtureOutcomeV1>>,
  resolvedEntryIdsByFixtureId: Readonly<Record<string, readonly [string, string]>>,
): string | null {
  if (ref.kind === 'ENTRY') return ref.competitionSeasonEntryId
  const predecessorParticipants = resolvedEntryIdsByFixtureId[ref.fixtureId]
  const predecessorOutcome = outcomeByFixtureId[ref.fixtureId]
  if (predecessorOutcome === undefined) return null
  if (predecessorParticipants === undefined) throw new Error(`Predecessor virtual fixture was not resolved before its outcome: ${ref.fixtureId}`)
  validateOutcome(ref.fixtureId, predecessorParticipants, predecessorOutcome)
  return predecessorOutcome.winnerEntryId
}

function validateOutcome(
  fixtureId: string,
  participants: readonly [string, string],
  outcome: WorldCompetitionVirtualFixtureOutcomeV1,
): void {
  if (outcome.winnerEntryId === outcome.loserEntryId) throw new Error(`Virtual fixture winner and loser must differ: ${fixtureId}`)
  const participantSet = new Set(participants)
  if (!participantSet.has(outcome.winnerEntryId) || !participantSet.has(outcome.loserEntryId)) {
    throw new Error(`Virtual fixture outcome does not match resolved participants: ${fixtureId}`)
  }
}

function uniqueIndex<T>(values: readonly T[], keyOf: (value: T) => string, label: string): Record<string, T> {
  const result: Record<string, T> = {}
  for (const value of values) {
    const key = keyOf(value)
    if (result[key] !== undefined) throw new Error(`Duplicate ${label}: ${key}`)
    result[key] = value
  }
  return result
}
