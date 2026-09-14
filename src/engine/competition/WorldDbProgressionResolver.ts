import type { WorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import type { WorldDbCompetitionRulesV1, WorldDbRuleRecordV1 } from './WorldDbCompetitionRules'

export interface WorldDbFixtureOutcomeV1 {
  readonly competitionFixtureId: string
  readonly winnerEntryId: string
  readonly loserEntryId: string
}

export interface WorldDbProgressionAssignmentV1 {
  readonly ruleId: string
  readonly ruleType: string
  readonly sourceNodeId: string
  readonly destinationNodeId: string
  readonly competitionSeasonEntryId: string
}

const GAME_RESULT_RULES = new Set(['GAME_WINNER', 'GAME_LOSER'])

/**
 * Resolves result-driven B04 progression without knowing which competition is being played.
 *
 * This first execution slice intentionally handles only rules whose selector is fully determined
 * by a physical fixture result. Standings, committee selection and cross-group ranking remain
 * separate evaluators and can be added without changing this contract.
 */
export function resolveWorldDbFixtureProgressionV1(
  runtime: WorldDbCompetitionRuntimeV1,
  rules: WorldDbCompetitionRulesV1,
  outcomes: readonly WorldDbFixtureOutcomeV1[],
): readonly WorldDbProgressionAssignmentV1[] {
  const fixtureById = Object.fromEntries(runtime.bundle.fixtures.map((fixture) => [fixture.competitionFixtureId, fixture]))
  const outcomeByFixtureId = uniqueIndex(outcomes, (outcome) => outcome.competitionFixtureId, 'fixture outcome')
  const destinationsByRuleId = groupByRuleId(rules.progressionDestinations)
  const assignments: WorldDbProgressionAssignmentV1[] = []
  const seen = new Set<string>()

  for (const [fixtureId, outcome] of Object.entries(outcomeByFixtureId)) {
    const fixture = fixtureById[fixtureId]
    if (fixture === undefined) throw new Error(`Progression outcome fixture not found: ${fixtureId}`)
    if (fixture.structureNodeId === null) continue

    requireEntry(runtime, outcome.winnerEntryId, `Winner for ${fixtureId}`)
    requireEntry(runtime, outcome.loserEntryId, `Loser for ${fixtureId}`)
    if (outcome.winnerEntryId === outcome.loserEntryId) {
      throw new Error(`Fixture outcome winner and loser must differ: ${fixtureId}`)
    }

    for (const rule of rules.progressionRules) {
      if (rule.scopeStructureNodeId !== fixture.structureNodeId || typeof rule.type !== 'string') continue
      if (!GAME_RESULT_RULES.has(rule.type)) continue

      const entryId = rule.type === 'GAME_WINNER' ? outcome.winnerEntryId : outcome.loserEntryId
      for (const destination of destinationsByRuleId[rule.id] ?? []) {
        const destinationNodeId = readDestinationNodeId(destination)
        if (runtime.nodeById[destinationNodeId] === undefined) {
          throw new Error(`Progression destination node not found: ${destinationNodeId}`)
        }
        const key = `${rule.id}\u0000${destinationNodeId}\u0000${entryId}`
        if (seen.has(key)) continue
        seen.add(key)
        assignments.push(Object.freeze({
          ruleId: rule.id,
          ruleType: rule.type,
          sourceNodeId: fixture.structureNodeId,
          destinationNodeId,
          competitionSeasonEntryId: entryId,
        }))
      }
    }
  }

  return Object.freeze(assignments)
}

function groupByRuleId(records: readonly WorldDbRuleRecordV1[]): Record<string, WorldDbRuleRecordV1[]> {
  const grouped: Record<string, WorldDbRuleRecordV1[]> = {}
  for (const record of records) {
    if (typeof record.ruleId !== 'string' || record.ruleId.length === 0) {
      throw new TypeError(`Progression destination ${record.id} must have a ruleId`)
    }
    ;(grouped[record.ruleId] ??= []).push(record)
  }
  return grouped
}

function readDestinationNodeId(destination: WorldDbRuleRecordV1): string {
  if (!isRecord(destination.payload)) {
    throw new TypeError(`Progression destination ${destination.id} must have an object payload`)
  }
  const nodeId = destination.payload.competition_structure_node_id
  if (typeof nodeId !== 'string' || nodeId.length === 0) {
    throw new TypeError(`Progression destination ${destination.id} must name a structure node`)
  }
  return nodeId
}

function requireEntry(runtime: WorldDbCompetitionRuntimeV1, entryId: string, label: string): void {
  if (runtime.entryById[entryId] === undefined) throw new Error(`${label} entry not found: ${entryId}`)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
