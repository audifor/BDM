import {
  assertWorldDbCompetitionBundleV1,
  type WorldDbCompetitionBundleV1,
  type WorldDbCompetitionEntryV1,
  type WorldDbFixtureSideV1,
  type WorldDbFixtureV1,
  type WorldDbStructureNodeV1,
} from '@/domain/worldDb/CompetitionBundle'

export interface WorldDbCompetitionRuntimeV1 {
  readonly bundle: WorldDbCompetitionBundleV1
  readonly entryById: Readonly<Record<string, WorldDbCompetitionEntryV1>>
  readonly nodeById: Readonly<Record<string, WorldDbStructureNodeV1>>
  readonly fixturesByNodeId: Readonly<Record<string, readonly WorldDbFixtureV1[]>>
  readonly fixtureSidesByFixtureId: Readonly<Record<string, readonly WorldDbFixtureSideV1[]>>
  readonly entryIdsByNodeId: Readonly<Record<string, readonly string[]>>
  readonly childNodeIdsByNodeId: Readonly<Record<string, readonly string[]>>
}

/**
 * Builds the immutable in-memory view used by competition engines.
 *
 * The adapter validates B04 referential integrity at the game boundary. A corrupted or partially
 * materialized World DB therefore fails during new-game bootstrap rather than half way through a
 * season simulation.
 */
export function createWorldDbCompetitionRuntimeV1(value: unknown): WorldDbCompetitionRuntimeV1 {
  assertWorldDbCompetitionBundleV1(value)
  const bundle = value
  const entryById = uniqueIndex(bundle.entries, (entry) => entry.competitionSeasonEntryId, 'competition entry')
  const nodeById = uniqueIndex(bundle.structureNodes, (node) => node.competitionStructureNodeId, 'structure node')
  const fixtureById = uniqueIndex(bundle.fixtures, (fixture) => fixture.competitionFixtureId, 'fixture')

  const fixturesByNodeId = groupBy(bundle.fixtures.filter((fixture) => fixture.structureNodeId !== null), (fixture) => fixture.structureNodeId!)
  const fixtureSidesByFixtureId = groupBy(bundle.fixtureSides, (side) => side.competitionFixtureId)
  const entryIdsByNodeId = groupValues(
    bundle.structureEntryAssignments,
    (assignment) => assignment.competitionStructureNodeId,
    (assignment) => assignment.competitionSeasonEntryId,
  )
  const childNodeIdsByNodeId = groupValues(
    bundle.structureEdges,
    (edge) => edge.fromNodeId,
    (edge) => edge.toNodeId,
  )

  for (const assignment of bundle.structureEntryAssignments) {
    requireKey(nodeById, assignment.competitionStructureNodeId, 'Structure assignment node')
    requireKey(entryById, assignment.competitionSeasonEntryId, 'Structure assignment entry')
  }
  for (const edge of bundle.structureEdges) {
    requireKey(nodeById, edge.fromNodeId, 'Structure edge source')
    requireKey(nodeById, edge.toNodeId, 'Structure edge destination')
  }
  for (const fixture of bundle.fixtures) {
    if (fixture.structureNodeId !== null) requireKey(nodeById, fixture.structureNodeId, 'Fixture structure node')
  }
  for (const side of bundle.fixtureSides) {
    requireKey(fixtureById, side.competitionFixtureId, 'Fixture side fixture')
    if (side.competitionSeasonEntryId !== null) requireKey(entryById, side.competitionSeasonEntryId, 'Fixture side entry')
  }

  return Object.freeze({
    bundle,
    entryById: Object.freeze(entryById),
    nodeById: Object.freeze(nodeById),
    fixturesByNodeId: freezeGrouped(fixturesByNodeId),
    fixtureSidesByFixtureId: freezeGrouped(fixtureSidesByFixtureId),
    entryIdsByNodeId: freezeGrouped(entryIdsByNodeId),
    childNodeIdsByNodeId: freezeGrouped(childNodeIdsByNodeId),
  })
}

function uniqueIndex<T>(values: readonly T[], id: (value: T) => string, label: string): Record<string, T> {
  const result: Record<string, T> = {}
  for (const value of values) {
    const key = id(value)
    if (result[key] !== undefined) throw new Error(`Duplicate ${label}: ${key}`)
    result[key] = value
  }
  return result
}

function groupBy<T>(values: readonly T[], keyOf: (value: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {}
  for (const value of values) (result[keyOf(value)] ??= []).push(value)
  return result
}

function groupValues<T>(values: readonly T[], keyOf: (value: T) => string, valueOf: (value: T) => string): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const value of values) (result[keyOf(value)] ??= []).push(valueOf(value))
  return result
}

function freezeGrouped<T>(value: Record<string, T[]>): Readonly<Record<string, readonly T[]>> {
  for (const values of Object.values(value)) Object.freeze(values)
  return Object.freeze(value)
}

function requireKey<T>(index: Readonly<Record<string, T>>, key: string, label: string): void {
  if (index[key] === undefined) throw new Error(`${label} not found: ${key}`)
}
