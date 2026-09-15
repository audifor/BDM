import type { WorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import type { WorldDbProgressionAssignmentV1 } from './WorldDbProgressionResolver'

export type WorldDbFixtureSideResolutionSourceV1 = 'DIRECT_ENTRY' | 'STRUCTURE_POSITION' | 'UNRESOLVED'

export interface WorldDbResolvedFixtureSideV1 {
  readonly competitionFixtureSideId: string
  readonly competitionFixtureId: string
  readonly sideRole: string
  readonly competitionSeasonEntryId: string | null
  readonly resolutionSource: WorldDbFixtureSideResolutionSourceV1
}

export interface WorldDbResolvedFixtureV1 {
  readonly competitionFixtureId: string
  readonly sides: readonly WorldDbResolvedFixtureSideV1[]
  readonly ready: boolean
}

/**
 * Resolves B04 fixture participants without inferring bracket wiring.
 *
 * Direct entry references are immediately usable. A side that references a structure position is
 * resolved only when a progression assignment explicitly names that same position. Competition
 * season slots remain unresolved because selection/seeding belongs to separate rule engines.
 */
export function resolveWorldDbFixturesV1(
  runtime: WorldDbCompetitionRuntimeV1,
  assignments: readonly WorldDbProgressionAssignmentV1[],
): readonly WorldDbResolvedFixtureV1[] {
  const entryByPositionId = resolveWorldDbStructurePositionEntriesV1(runtime, assignments)
  const resolved = runtime.bundle.fixtures.map((fixture) => {
    const sides = (runtime.fixtureSidesByFixtureId[fixture.competitionFixtureId] ?? []).map((side) => {
      const positionEntryId = side.sourceStructurePositionId === null
        ? undefined
        : entryByPositionId[side.sourceStructurePositionId]

      if (side.competitionSeasonEntryId !== null) {
        if (positionEntryId !== undefined && positionEntryId !== side.competitionSeasonEntryId) {
          throw new Error(
            `Fixture side ${side.competitionFixtureSideId} direct entry conflicts with resolved structure position`,
          )
        }
        return Object.freeze({
          competitionFixtureSideId: side.competitionFixtureSideId,
          competitionFixtureId: side.competitionFixtureId,
          sideRole: side.sideRole,
          competitionSeasonEntryId: side.competitionSeasonEntryId,
          resolutionSource: 'DIRECT_ENTRY' as const,
        })
      }

      if (positionEntryId !== undefined) {
        return Object.freeze({
          competitionFixtureSideId: side.competitionFixtureSideId,
          competitionFixtureId: side.competitionFixtureId,
          sideRole: side.sideRole,
          competitionSeasonEntryId: positionEntryId,
          resolutionSource: 'STRUCTURE_POSITION' as const,
        })
      }

      return Object.freeze({
        competitionFixtureSideId: side.competitionFixtureSideId,
        competitionFixtureId: side.competitionFixtureId,
        sideRole: side.sideRole,
        competitionSeasonEntryId: null,
        resolutionSource: 'UNRESOLVED' as const,
      })
    })

    const resolvedEntryIds = sides
      .map((side) => side.competitionSeasonEntryId)
      .filter((entryId): entryId is string => entryId !== null)
    if (new Set(resolvedEntryIds).size !== resolvedEntryIds.length) {
      throw new Error(`Fixture ${fixture.competitionFixtureId} resolves the same entry to multiple sides`)
    }

    return Object.freeze({
      competitionFixtureId: fixture.competitionFixtureId,
      sides: Object.freeze(sides),
      ready: sides.length >= 2 && sides.every((side) => side.competitionSeasonEntryId !== null),
    })
  })

  return Object.freeze(resolved)
}

/** Returns only explicitly targeted structure positions; node-only progression is intentionally absent. */
export function resolveWorldDbStructurePositionEntriesV1(
  runtime: WorldDbCompetitionRuntimeV1,
  assignments: readonly WorldDbProgressionAssignmentV1[],
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const assignment of assignments) {
    if (assignment.destinationPositionId === undefined) continue
    const position = runtime.positionById[assignment.destinationPositionId]
    if (position === undefined) {
      throw new Error(`Progression destination position not found: ${assignment.destinationPositionId}`)
    }
    if (position.competitionStructureNodeId !== assignment.destinationNodeId) {
      throw new Error(
        `Progression destination position ${assignment.destinationPositionId} does not belong to node ${assignment.destinationNodeId}`,
      )
    }
    if (runtime.entryById[assignment.competitionSeasonEntryId] === undefined) {
      throw new Error(`Progression entry not found: ${assignment.competitionSeasonEntryId}`)
    }

    const existing = result[assignment.destinationPositionId]
    if (existing !== undefined && existing !== assignment.competitionSeasonEntryId) {
      throw new Error(`Structure position ${assignment.destinationPositionId} received multiple entries`)
    }
    result[assignment.destinationPositionId] = assignment.competitionSeasonEntryId
  }
  return Object.freeze(result)
}
