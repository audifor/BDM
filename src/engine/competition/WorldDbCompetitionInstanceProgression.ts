import {
  buildWorldDbInstanceFixturesForPairingV1,
  createWorldDbInstanceFixtureV1,
  type WorldDbCompetitionInstanceRequirementV1,
  type WorldDbCompetitionInstanceV1,
  type WorldDbInstanceFixtureOutcomeV1,
  type WorldDbInstanceFixtureV1,
} from './WorldDbCompetitionInstance'
import type { WorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import type { WorldDbCompetitionRulesV1, WorldDbRuleRecordV1 } from './WorldDbCompetitionRules'

export interface ApplyWorldDbCompetitionInstanceOutcomesV1Input {
  readonly outcomes: readonly WorldDbInstanceFixtureOutcomeV1[]
  /** Required only when the destination rule itself needs a new draw or explicit ordering. */
  readonly pairingOrderByNodeId?: Readonly<Record<string, readonly string[]>>
}

interface ProgressionCandidate {
  readonly destinationNodeId: string
  readonly sourceNodeId: string
  readonly sourceFixtureOrdinal: number
  readonly teamId: string
}

const RESULT_RULE_TYPES = new Set(['GAME_WINNER', 'GAME_LOSER'])

/**
 * Applies completed instance fixtures back into the declarative B04 graph.
 * The function is pure and idempotent: replaying the same outcome yields the same instance.
 */
export function applyWorldDbCompetitionInstanceOutcomesV1(
  runtime: WorldDbCompetitionRuntimeV1,
  rules: WorldDbCompetitionRulesV1,
  instance: WorldDbCompetitionInstanceV1,
  input: ApplyWorldDbCompetitionInstanceOutcomesV1Input,
): WorldDbCompetitionInstanceV1 {
  if (instance.competitionSeasonId !== runtime.bundle.competitionSeason.competitionSeasonId) {
    throw new Error('Competition instance does not belong to the loaded World DB season')
  }

  const fixtureById = Object.fromEntries(instance.fixtures.map((fixture) => [fixture.instanceFixtureId, fixture]))
  const outcomesById: Record<string, WorldDbInstanceFixtureOutcomeV1> = { ...instance.fixtureOutcomesById }

  for (const outcome of input.outcomes) {
    const fixture = fixtureById[outcome.instanceFixtureId]
    if (fixture === undefined) throw new Error(`Competition instance fixture not found: ${outcome.instanceFixtureId}`)
    validateOutcome(fixture, outcome)
    const existing = outcomesById[outcome.instanceFixtureId]
    if (existing !== undefined && (existing.winnerTeamId !== outcome.winnerTeamId || existing.loserTeamId !== outcome.loserTeamId)) {
      throw new Error(`Competition instance fixture outcome conflict: ${outcome.instanceFixtureId}`)
    }
    outcomesById[outcome.instanceFixtureId] = Object.freeze({ ...outcome })
  }

  const destinationsByRuleId = groupByRuleId(rules.progressionDestinations)
  const candidatesByDestination: Record<string, ProgressionCandidate[]> = {}

  for (const fixture of instance.fixtures) {
    const outcome = outcomesById[fixture.instanceFixtureId]
    if (outcome === undefined) continue
    for (const rule of rules.progressionRules) {
      if (rule.scopeStructureNodeId !== fixture.structureNodeId || !RESULT_RULE_TYPES.has(String(rule.type))) continue
      const teamId = rule.type === 'GAME_WINNER' ? outcome.winnerTeamId : outcome.loserTeamId
      for (const destination of destinationsByRuleId[rule.id] ?? []) {
        const destinationNodeId = readDestinationNodeId(destination)
        if (runtime.nodeById[destinationNodeId] === undefined) throw new Error(`Progression destination node not found: ${destinationNodeId}`)
        ;(candidatesByDestination[destinationNodeId] ??= []).push({
          destinationNodeId,
          sourceNodeId: fixture.structureNodeId,
          sourceFixtureOrdinal: fixture.ordinal,
          teamId,
        })
      }
    }
  }

  const nodeParticipantTeamIds: Record<string, readonly string[]> = { ...instance.nodeParticipantTeamIds }
  let fixtures = [...instance.fixtures]
  const requirements: WorldDbCompetitionInstanceRequirementV1[] = instance.requirements.filter((requirement) =>
    input.pairingOrderByNodeId?.[requirement.structureNodeId] === undefined,
  )

  for (const [destinationNodeId, candidates] of Object.entries(candidatesByDestination)) {
    const orderedCandidates = [...candidates].sort((left, right) =>
      left.sourceNodeId.localeCompare(right.sourceNodeId) || left.sourceFixtureOrdinal - right.sourceFixtureOrdinal,
    )
    const progressedTeamIds = unique(orderedCandidates.map((candidate) => candidate.teamId))
    nodeParticipantTeamIds[destinationNodeId] = Object.freeze(progressedTeamIds)

    if (fixtures.some((fixture) => fixture.structureNodeId === destinationNodeId)) continue
    if (!incomingResultNodesComplete(destinationNodeId, rules, instance.fixtures, outcomesById)) continue

    const pairingRules = rules.pairing.filter((rule) => rule.scopeStructureNodeId === destinationNodeId)
    const explicitOrder = input.pairingOrderByNodeId?.[destinationNodeId]
    if (pairingRules.length > 1) throw new Error(`Multiple pairing rules found for destination node ${destinationNodeId}`)

    if (pairingRules.length === 0) {
      const singleGame = rules.contestFormats.some((format) =>
        format.scopeStructureNodeId === destinationNodeId && format.type === 'SINGLE_GAME',
      )
      if (!singleGame || progressedTeamIds.length !== 2) continue
      fixtures.push(createWorldDbInstanceFixtureV1(runtime, destinationNodeId, 1, progressedTeamIds[0]!, progressedTeamIds[1]!))
      continue
    }

    const pairing = pairingRules[0]!
    if (pairing.type === 'DRAW_PAIRING' && explicitOrder === undefined) {
      if (!requirements.some((requirement) => requirement.structureNodeId === destinationNodeId)) {
        requirements.push(Object.freeze({ kind: 'DRAW', structureNodeId: destinationNodeId, teamIds: Object.freeze([...progressedTeamIds]) }))
      }
      continue
    }

    const sourceNodeIds = unique(orderedCandidates.map((candidate) => candidate.sourceNodeId))
    if (sourceNodeIds.length > 1 && explicitOrder === undefined && pairing.type !== 'ROUND_ROBIN_PAIRING') {
      throw new Error(`Destination node ${destinationNodeId} needs explicit pairing order for multiple progression sources`)
    }
    const order = explicitOrder === undefined
      ? progressedTeamIds
      : validatePermutation(explicitOrder, progressedTeamIds, `Pairing order for ${destinationNodeId}`)
    fixtures = fixtures.concat(buildWorldDbInstanceFixturesForPairingV1(runtime, pairing, destinationNodeId, order))
  }

  return freezeUpdatedInstance({
    ...instance,
    status: requirements.length > 0 ? 'awaitingDraw' : 'ready',
    nodeParticipantTeamIds,
    fixtures,
    fixtureOutcomesById: outcomesById,
    requirements,
  })
}

function incomingResultNodesComplete(
  destinationNodeId: string,
  rules: WorldDbCompetitionRulesV1,
  fixtures: readonly WorldDbInstanceFixtureV1[],
  outcomesById: Readonly<Record<string, WorldDbInstanceFixtureOutcomeV1>>,
): boolean {
  const destinationsByRuleId = groupByRuleId(rules.progressionDestinations)
  const sourceNodeIds = unique(rules.progressionRules
    .filter((rule) => RESULT_RULE_TYPES.has(String(rule.type)))
    .filter((rule) => (destinationsByRuleId[rule.id] ?? []).some((destination) => readDestinationNodeId(destination) === destinationNodeId))
    .map((rule) => rule.scopeStructureNodeId)
    .filter((nodeId): nodeId is string => typeof nodeId === 'string'))

  return sourceNodeIds.length > 0 && sourceNodeIds.every((sourceNodeId) => {
    const sourceFixtures = fixtures.filter((fixture) => fixture.structureNodeId === sourceNodeId)
    return sourceFixtures.length > 0 && sourceFixtures.every((fixture) => outcomesById[fixture.instanceFixtureId] !== undefined)
  })
}

function validateOutcome(fixture: WorldDbInstanceFixtureV1, outcome: WorldDbInstanceFixtureOutcomeV1): void {
  if (outcome.winnerTeamId === outcome.loserTeamId) throw new Error(`Fixture outcome winner and loser must differ: ${fixture.instanceFixtureId}`)
  const participants = new Set([fixture.homeTeamId, fixture.awayTeamId])
  if (!participants.has(outcome.winnerTeamId) || !participants.has(outcome.loserTeamId)) {
    throw new Error(`Fixture outcome teams do not match fixture participants: ${fixture.instanceFixtureId}`)
  }
}

function groupByRuleId(records: readonly WorldDbRuleRecordV1[]): Record<string, WorldDbRuleRecordV1[]> {
  const grouped: Record<string, WorldDbRuleRecordV1[]> = {}
  for (const record of records) {
    if (typeof record.ruleId !== 'string' || record.ruleId.length === 0) throw new TypeError(`Progression destination ${record.id} must have a ruleId`)
    ;(grouped[record.ruleId] ??= []).push(record)
  }
  return grouped
}

function readDestinationNodeId(destination: WorldDbRuleRecordV1): string {
  if (!isRecord(destination.payload)) throw new TypeError(`Progression destination ${destination.id} must have an object payload`)
  const nodeId = destination.payload.competition_structure_node_id
  if (typeof nodeId !== 'string' || nodeId.length === 0) throw new TypeError(`Progression destination ${destination.id} must name a structure node`)
  return nodeId
}

function validatePermutation(values: readonly string[], expected: readonly string[], label: string): readonly string[] {
  const result = unique(values)
  if (result.length !== values.length) throw new Error(`${label} IDs must be unique`)
  if (result.length !== expected.length) throw new Error(`${label} must contain every participant exactly once`)
  const expectedIds = new Set(expected)
  if (result.some((value) => !expectedIds.has(value))) throw new Error(`${label} contains an unknown participant`)
  return result
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function freezeUpdatedInstance(instance: WorldDbCompetitionInstanceV1): WorldDbCompetitionInstanceV1 {
  const nodeParticipants: Record<string, readonly string[]> = {}
  for (const [nodeId, teamIds] of Object.entries(instance.nodeParticipantTeamIds)) nodeParticipants[nodeId] = Object.freeze([...teamIds])
  return Object.freeze({
    ...instance,
    nodeParticipantTeamIds: Object.freeze(nodeParticipants),
    fixtures: Object.freeze([...instance.fixtures]),
    fixtureOutcomesById: Object.freeze({ ...instance.fixtureOutcomesById }),
    requirements: Object.freeze(instance.requirements.map((requirement) => Object.freeze({ ...requirement, teamIds: Object.freeze([...requirement.teamIds]) }))),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
