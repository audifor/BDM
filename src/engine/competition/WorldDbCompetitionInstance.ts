import type { WorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import type { WorldDbCompetitionRulesV1, WorldDbRuleRecordV1 } from './WorldDbCompetitionRules'

export type WorldDbCompetitionInstanceStatusV1 = 'awaitingDraw' | 'ready'

export interface WorldDbInstanceFixtureV1 {
  readonly instanceFixtureId: string
  readonly sourceCompetitionFixtureId: string | null
  readonly structureNodeId: string
  readonly ordinal: number
  readonly homeTeamId: string
  readonly awayTeamId: string
}

export interface WorldDbCompetitionInstanceRequirementV1 {
  readonly kind: 'DRAW'
  readonly structureNodeId: string
  readonly teamIds: readonly string[]
}

export interface WorldDbCompetitionInstanceV1 {
  readonly schemaVersion: 1
  readonly competitionSeasonId: string
  readonly status: WorldDbCompetitionInstanceStatusV1
  readonly participantTeamIds: readonly string[]
  readonly nodeParticipantTeamIds: Readonly<Record<string, readonly string[]>>
  readonly fixtures: readonly WorldDbInstanceFixtureV1[]
  readonly requirements: readonly WorldDbCompetitionInstanceRequirementV1[]
}

export interface InstantiateWorldDbCompetitionV1Input {
  readonly participantTeamIds: readonly string[]
  /** Explicit deterministic order produced by a draw/seeding service. No randomness occurs here. */
  readonly pairingOrderByNodeId?: Readonly<Record<string, readonly string[]>>
}

/**
 * Creates the mutable-save projection for the first executable node of a declarative B04 format.
 * World DB remains immutable. Draw results and generated fixtures belong to the save instance.
 */
export function instantiateWorldDbCompetitionV1(
  runtime: WorldDbCompetitionRuntimeV1,
  rules: WorldDbCompetitionRulesV1,
  input: InstantiateWorldDbCompetitionV1Input,
): WorldDbCompetitionInstanceV1 {
  const participantTeamIds = validateUniqueIds(input.participantTeamIds, 'Competition participant team')
  if (participantTeamIds.length < 2) throw new RangeError('Competition instance requires at least two participants')

  const rootPairingRules = findRootPairingRules(rules)
  if (rootPairingRules.length !== 1) {
    throw new Error(`Competition instance requires exactly one initial pairing node; found ${rootPairingRules.length}`)
  }

  const pairing = rootPairingRules[0]!
  const nodeId = requireText(pairing.scopeStructureNodeId, 'Initial pairing scope node')
  if (runtime.nodeById[nodeId] === undefined) throw new Error(`Initial pairing node not found: ${nodeId}`)

  const nodeParticipantTeamIds = Object.freeze({ [nodeId]: participantTeamIds })
  const explicitOrder = input.pairingOrderByNodeId?.[nodeId]

  if (pairing.type === 'DRAW_PAIRING' && explicitOrder === undefined) {
    return Object.freeze({
      schemaVersion: 1,
      competitionSeasonId: runtime.bundle.competitionSeason.competitionSeasonId,
      status: 'awaitingDraw',
      participantTeamIds,
      nodeParticipantTeamIds,
      fixtures: Object.freeze([]),
      requirements: Object.freeze([
        Object.freeze({ kind: 'DRAW' as const, structureNodeId: nodeId, teamIds: participantTeamIds }),
      ]),
    })
  }

  const order = explicitOrder === undefined
    ? participantTeamIds
    : validatePermutation(explicitOrder, participantTeamIds, `Pairing order for ${nodeId}`)

  const fixtures = buildInitialFixtures(runtime, pairing, nodeId, order)
  return Object.freeze({
    schemaVersion: 1,
    competitionSeasonId: runtime.bundle.competitionSeason.competitionSeasonId,
    status: 'ready',
    participantTeamIds,
    nodeParticipantTeamIds,
    fixtures: Object.freeze(fixtures),
    requirements: Object.freeze([]),
  })
}

function findRootPairingRules(rules: WorldDbCompetitionRulesV1): readonly WorldDbRuleRecordV1[] {
  const destinationNodeIds = new Set<string>()
  for (const destination of rules.progressionDestinations) {
    const payload = record(destination.payload)
    const nodeId = payload?.competition_structure_node_id
    if (typeof nodeId === 'string') destinationNodeIds.add(nodeId)
  }
  return rules.pairing.filter((rule) =>
    typeof rule.scopeStructureNodeId === 'string' && !destinationNodeIds.has(rule.scopeStructureNodeId),
  )
}

function buildInitialFixtures(
  runtime: WorldDbCompetitionRuntimeV1,
  pairing: WorldDbRuleRecordV1,
  nodeId: string,
  orderedTeamIds: readonly string[],
): WorldDbInstanceFixtureV1[] {
  switch (pairing.type) {
    case 'ROUND_ROBIN_PAIRING':
      return buildRoundRobinFixtures(runtime, pairing, nodeId, orderedTeamIds)
    case 'FIXED_BRACKET_PAIRING':
    case 'SEEDED_BRACKET_PAIRING':
    case 'DRAW_PAIRING':
      return buildPairFixtures(runtime, nodeId, orderedTeamIds)
    default:
      throw new Error(`Unsupported initial pairing type: ${String(pairing.type)}`)
  }
}

function buildPairFixtures(
  runtime: WorldDbCompetitionRuntimeV1,
  nodeId: string,
  orderedTeamIds: readonly string[],
): WorldDbInstanceFixtureV1[] {
  if (orderedTeamIds.length % 2 !== 0) {
    throw new RangeError(`Pairing node ${nodeId} requires an even participant count in V1`)
  }
  const fixtures: WorldDbInstanceFixtureV1[] = []
  for (let index = 0; index < orderedTeamIds.length; index += 2) {
    fixtures.push(instanceFixture(runtime, nodeId, fixtures.length + 1, orderedTeamIds[index]!, orderedTeamIds[index + 1]!))
  }
  return fixtures
}

function buildRoundRobinFixtures(
  runtime: WorldDbCompetitionRuntimeV1,
  pairing: WorldDbRuleRecordV1,
  nodeId: string,
  orderedTeamIds: readonly string[],
): WorldDbInstanceFixtureV1[] {
  const payload = record(pairing.payload)
  const meetings = payload?.meetings_per_pair ?? 1
  if (!Number.isInteger(meetings) || Number(meetings) < 1) throw new RangeError(`Invalid meetings_per_pair for ${nodeId}`)

  const fixtures: WorldDbInstanceFixtureV1[] = []
  for (let meeting = 0; meeting < Number(meetings); meeting += 1) {
    for (let left = 0; left < orderedTeamIds.length - 1; left += 1) {
      for (let right = left + 1; right < orderedTeamIds.length; right += 1) {
        const first = orderedTeamIds[left]!
        const second = orderedTeamIds[right]!
        const [home, away] = meeting % 2 === 0 ? [first, second] : [second, first]
        fixtures.push(instanceFixture(runtime, nodeId, fixtures.length + 1, home, away))
      }
    }
  }
  return fixtures
}

function instanceFixture(
  runtime: WorldDbCompetitionRuntimeV1,
  nodeId: string,
  ordinal: number,
  homeTeamId: string,
  awayTeamId: string,
): WorldDbInstanceFixtureV1 {
  return Object.freeze({
    instanceFixtureId: `instance-fixture:${runtime.bundle.competitionSeason.competitionSeasonId}:${nodeId}:${ordinal}`,
    sourceCompetitionFixtureId: null,
    structureNodeId: nodeId,
    ordinal,
    homeTeamId,
    awayTeamId,
  })
}

function validateUniqueIds(values: readonly string[], label: string): readonly string[] {
  const result = values.map((value) => requireText(value, label))
  if (new Set(result).size !== result.length) throw new Error(`${label} IDs must be unique`)
  return Object.freeze(result)
}

function validatePermutation(values: readonly string[], expected: readonly string[], label: string): readonly string[] {
  const result = validateUniqueIds(values, label)
  if (result.length !== expected.length) throw new Error(`${label} must contain every participant exactly once`)
  const expectedIds = new Set(expected)
  if (result.some((value) => !expectedIds.has(value))) throw new Error(`${label} contains an unknown participant`)
  return result
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`)
  return value
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null
}
