import type { CompletedGame } from '@/domain/game'
import { createWorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import { createWorldDbCompetitionRulesV1 } from './WorldDbCompetitionRules'
import { adaptCompletedGamesToWorldDbFixtureOutcomesV1 } from './WorldDbFixtureOutcomeAdapter'
import { resolveWorldDbStructurePositionEntriesV1 } from './WorldDbFixtureResolver'
import { createWorldDbGameFixtureBindingIndexV1 } from './WorldDbGameFixtureBinding'
import {
  planWorldDbPhysicalGamesV1,
  type WorldDbCompetitionPlanningContextV1,
  type WorldDbPhysicalGamePlanningResultV1,
} from './WorldDbPhysicalGamePlanner'
import { resolveWorldDbFixtureProgressionV1 } from './WorldDbProgressionResolver'

export interface WorldDbCompetitionProgressionReconstructionV1 {
  readonly contexts: readonly WorldDbCompetitionPlanningContextV1[]
  readonly plan: WorldDbPhysicalGamePlanningResultV1
}

/**
 * Reconstructs result-driven B04 structure-position state from persisted completed Games.
 *
 * Save V4 intentionally does not persist Game↔Fixture bindings or resolved bracket positions. Both
 * are deterministic projections, so reconstruction repeatedly replans physical Games, derives local
 * fixture outcomes from completed Games, applies explicit B04 progression destinations and replans
 * until no new structure position is discovered.
 */
export function reconstructWorldDbCompetitionProgressionV1(
  contexts: readonly WorldDbCompetitionPlanningContextV1[],
  completedGames: readonly CompletedGame[],
  asOf: string,
): WorldDbCompetitionProgressionReconstructionV1 {
  let currentContexts = freezeContexts(contexts)
  const maxIterations = countStructurePositions(currentContexts) + 1

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const plan = planWorldDbPhysicalGamesV1(currentContexts, asOf)
    const bindingIndex = createWorldDbGameFixtureBindingIndexV1(plan.bindings)
    let changed = false

    const nextContexts = currentContexts.map((context) => {
      const runtime = createWorldDbCompetitionRuntimeV1(context.bundle)
      const outcomes = adaptCompletedGamesToWorldDbFixtureOutcomesV1(
        runtime,
        bindingIndex,
        completedGames,
      )
      const assignments = resolveWorldDbFixtureProgressionV1(
        runtime,
        createWorldDbCompetitionRulesV1(context.bundle),
        outcomes,
      )
      const derivedPositions = resolveWorldDbStructurePositionEntriesV1(runtime, assignments)
      const merged = mergeResolvedPositions(
        context.resolvedEntryIdByStructurePositionId,
        derivedPositions,
        context.bundle.competitionSeason.competitionSeasonId,
      )

      if (!merged.changed) return context
      changed = true
      return Object.freeze({
        ...context,
        resolvedEntryIdByStructurePositionId: merged.value,
      })
    })

    if (!changed) {
      return Object.freeze({
        contexts: currentContexts,
        plan,
      })
    }
    currentContexts = Object.freeze(nextContexts)
  }

  throw new Error('World DB competition progression did not converge')
}

function mergeResolvedPositions(
  existing: Readonly<Record<string, string>> | undefined,
  derived: Readonly<Record<string, string>>,
  competitionSeasonId: string,
): { readonly value: Readonly<Record<string, string>>; readonly changed: boolean } {
  const result: Record<string, string> = { ...(existing ?? {}) }
  let changed = false

  for (const [positionId, entryId] of Object.entries(derived)) {
    const current = result[positionId]
    if (current !== undefined && current !== entryId) {
      throw new Error(
        `Competition season ${competitionSeasonId} structure position ${positionId} conflicts: ${current} vs ${entryId}`,
      )
    }
    if (current === undefined) {
      result[positionId] = entryId
      changed = true
    }
  }

  return Object.freeze({ value: Object.freeze(result), changed })
}

function freezeContexts(
  contexts: readonly WorldDbCompetitionPlanningContextV1[],
): readonly WorldDbCompetitionPlanningContextV1[] {
  return Object.freeze(contexts.map((context) => Object.freeze({
    ...context,
    ...(context.resolvedEntryIdByStructurePositionId === undefined
      ? {}
      : {
          resolvedEntryIdByStructurePositionId: Object.freeze({
            ...context.resolvedEntryIdByStructurePositionId,
          }),
        }),
  })))
}

function countStructurePositions(contexts: readonly WorldDbCompetitionPlanningContextV1[]): number {
  return contexts.reduce((total, context) => total + (context.bundle.structurePositions?.length ?? 0), 0)
}
