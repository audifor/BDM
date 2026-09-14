import type { WorldCompetitionFixedBracketPlanV1, WorldCompetitionFixtureParticipantRefV1, WorldCompetitionVirtualFixtureV1 } from './WorldCompetitionFixedBracket'

export interface WorldCompetitionResolvedParticipantV1 {
  readonly competitionSeasonEntryId: string
  readonly seed: number
}

export interface WorldCompetitionVirtualFixtureOutcomeV1 {
  readonly fixtureId: string
  readonly winnerEntryId: string
  readonly loserEntryId: string
}

export interface WorldCompetitionResolvedVirtualFixtureV1 {
  readonly fixtureId: string
  readonly competitionSeasonId: string
  readonly variantKey: string
  readonly nodeKey: string
  readonly fixtureOrder: number
  readonly participants: readonly [WorldCompetitionResolvedParticipantV1, WorldCompetitionResolvedParticipantV1]
}

export interface WorldCompetitionVirtualFixtureResolutionV1 {
  readonly resolvedFixtures: readonly WorldCompetitionResolvedVirtualFixtureV1[]
  readonly readyFixtures: readonly WorldCompetitionResolvedVirtualFixtureV1[]
  readonly completedFixtureIds: readonly string[]
}

/**
 * Resolves a deterministic virtual bracket from already completed contest outcomes.
 * Seed identity is preserved through every WINNER_OF_FIXTURE edge so later series hosting can
 * apply explicit HIGHER_SEED priority without reconstructing standings.
 */
export function resolveWorldCompetitionVirtualFixturesV1(
  plan: WorldCompetitionFixedBracketPlanV1,
  outcomes: readonly WorldCompetitionVirtualFixtureOutcomeV1[],
): WorldCompetitionVirtualFixtureResolutionV1 {
  const fixtureById = new Map(plan.fixtures.map((fixture) => [fixture.fixtureId, fixture] as const))
  const outcomeByFixtureId = new Map<string, WorldCompetitionVirtualFixtureOutcomeV1>()
  for (const outcome of outcomes) {
    if (!fixtureById.has(outcome.fixtureId)) throw new Error(`Virtual fixture outcome references unknown fixture: ${outcome.fixtureId}`)
    if (outcomeByFixtureId.has(outcome.fixtureId)) throw new Error(`Duplicate virtual fixture outcome: ${outcome.fixtureId}`)
    if (!outcome.winnerEntryId || !outcome.loserEntryId || outcome.winnerEntryId === outcome.loserEntryId) {
      throw new Error(`Virtual fixture outcome requires distinct winner and loser: ${outcome.fixtureId}`)
    }
    outcomeByFixtureId.set(outcome.fixtureId, outcome)
  }

  const seedByEntryId = buildSeedIndex(plan.fixtures)
  const validatedOutcomes = new Map<string, WorldCompetitionVirtualFixtureOutcomeV1>()
  const resolvedFixtures: WorldCompetitionResolvedVirtualFixtureV1[] = []
  const readyFixtures: WorldCompetitionResolvedVirtualFixtureV1[] = []
  const completedFixtureIds: string[] = []

  for (const fixture of plan.fixtures) {
    const left = resolveParticipant(fixture.participants[0], validatedOutcomes, seedByEntryId)
    const right = resolveParticipant(fixture.participants[1], validatedOutcomes, seedByEntryId)
    const declaredOutcome = outcomeByFixtureId.get(fixture.fixtureId)

    if (left === null || right === null) {
      if (declaredOutcome !== undefined) throw new Error(`Virtual fixture outcome exists before participants are resolved: ${fixture.fixtureId}`)
      continue
    }
    if (left.competitionSeasonEntryId === right.competitionSeasonEntryId) {
      throw new Error(`Virtual fixture resolves the same entry on both sides: ${fixture.fixtureId}`)
    }

    const resolved = freezeResolvedFixture(fixture, left, right)
    resolvedFixtures.push(resolved)

    if (declaredOutcome === undefined) {
      readyFixtures.push(resolved)
      continue
    }

    validateOutcomeParticipants(resolved, declaredOutcome)
    validatedOutcomes.set(fixture.fixtureId, declaredOutcome)
    completedFixtureIds.push(fixture.fixtureId)
  }

  return Object.freeze({
    resolvedFixtures: Object.freeze(resolvedFixtures),
    readyFixtures: Object.freeze(readyFixtures),
    completedFixtureIds: Object.freeze(completedFixtureIds),
  })
}

export function selectWorldCompetitionHigherSeedV1(
  participants: readonly [WorldCompetitionResolvedParticipantV1, WorldCompetitionResolvedParticipantV1],
): WorldCompetitionResolvedParticipantV1 {
  if (participants[0].seed === participants[1].seed) throw new Error('Distinct bracket participants cannot share the same seed')
  return participants[0].seed < participants[1].seed ? participants[0] : participants[1]
}

function buildSeedIndex(fixtures: readonly WorldCompetitionVirtualFixtureV1[]): ReadonlyMap<string, number> {
  const result = new Map<string, number>()
  for (const fixture of fixtures) {
    for (const ref of fixture.participants) {
      if (ref.kind !== 'ENTRY') continue
      const previous = result.get(ref.competitionSeasonEntryId)
      if (previous !== undefined && previous !== ref.seed) {
        throw new Error(`Competition entry has conflicting bracket seeds: ${ref.competitionSeasonEntryId}`)
      }
      for (const [otherEntryId, otherSeed] of result) {
        if (otherEntryId !== ref.competitionSeasonEntryId && otherSeed === ref.seed) {
          throw new Error(`Bracket seed ${ref.seed} is assigned to multiple competition entries`)
        }
      }
      result.set(ref.competitionSeasonEntryId, ref.seed)
    }
  }
  return result
}

function resolveParticipant(
  ref: WorldCompetitionFixtureParticipantRefV1,
  validatedOutcomes: ReadonlyMap<string, WorldCompetitionVirtualFixtureOutcomeV1>,
  seedByEntryId: ReadonlyMap<string, number>,
): WorldCompetitionResolvedParticipantV1 | null {
  if (ref.kind === 'ENTRY') {
    return Object.freeze({ competitionSeasonEntryId: ref.competitionSeasonEntryId, seed: ref.seed })
  }
  const outcome = validatedOutcomes.get(ref.fixtureId)
  if (outcome === undefined) return null
  const seed = seedByEntryId.get(outcome.winnerEntryId)
  if (seed === undefined) throw new Error(`Winner has no canonical bracket seed: ${outcome.winnerEntryId}`)
  return Object.freeze({ competitionSeasonEntryId: outcome.winnerEntryId, seed })
}

function freezeResolvedFixture(
  fixture: WorldCompetitionVirtualFixtureV1,
  left: WorldCompetitionResolvedParticipantV1,
  right: WorldCompetitionResolvedParticipantV1,
): WorldCompetitionResolvedVirtualFixtureV1 {
  return Object.freeze({
    fixtureId: fixture.fixtureId,
    competitionSeasonId: fixture.competitionSeasonId,
    variantKey: fixture.variantKey,
    nodeKey: fixture.nodeKey,
    fixtureOrder: fixture.fixtureOrder,
    participants: Object.freeze([left, right]) as readonly [WorldCompetitionResolvedParticipantV1, WorldCompetitionResolvedParticipantV1],
  })
}

function validateOutcomeParticipants(
  fixture: WorldCompetitionResolvedVirtualFixtureV1,
  outcome: WorldCompetitionVirtualFixtureOutcomeV1,
): void {
  const participants = new Set(fixture.participants.map((participant) => participant.competitionSeasonEntryId))
  if (!participants.has(outcome.winnerEntryId) || !participants.has(outcome.loserEntryId)) {
    throw new Error(`Virtual fixture outcome participants do not match resolved fixture: ${fixture.fixtureId}`)
  }
}
