import type { JsonObject, JsonValue, WorldCompetitionFormatDocument, WorldCompetitionFormatNode } from '@/domain/competition'

export interface WorldCompetitionSeededEntryV1 {
  readonly competitionSeasonEntryId: string
  readonly seed: number
}

export type WorldCompetitionFixtureParticipantRefV1 =
  | Readonly<{ kind: 'ENTRY'; competitionSeasonEntryId: string; seed: number }>
  | Readonly<{ kind: 'WINNER_OF_FIXTURE'; fixtureId: string }>

/** A virtual fixture is one competitive contest/matchup. SERIES contests may expand into several physical games later. */
export interface WorldCompetitionVirtualFixtureV1 {
  readonly fixtureId: string
  readonly competitionSeasonId: string
  readonly variantKey: string
  readonly nodeKey: string
  readonly fixtureOrder: number
  readonly participants: readonly [WorldCompetitionFixtureParticipantRefV1, WorldCompetitionFixtureParticipantRefV1]
}

export interface WorldCompetitionFixedBracketPlanV1 {
  readonly competitionSeasonId: string
  readonly variantKey: string
  readonly fixtures: readonly WorldCompetitionVirtualFixtureV1[]
  readonly fixtureIdsByNodeKey: Readonly<Record<string, readonly string[]>>
}

/**
 * Instantiates the fixed-bracket vocabulary currently emitted by the Phase 1 authoring pack.
 *
 * No bracket path is inferred when more than two predecessor winners are available. Such rounds
 * must declare `pairing.payload.paths`. A two-team destination is unambiguous and can consume the
 * two winners of its single incoming WINNER edge directly.
 */
export function instantiateWorldCompetitionFixedBracketV1(
  format: WorldCompetitionFormatDocument,
  variantKey: string,
  seededEntries: readonly WorldCompetitionSeededEntryV1[],
): WorldCompetitionFixedBracketPlanV1 {
  if (format.status !== 'COMPLETE') throw new Error(`Competition format is not executable: ${format.competitionSeasonId} status=${format.status}`)
  const variant = format.variants.find((candidate) => candidate.key === variantKey)
  if (variant === undefined) throw new Error(`Competition format variant not found: ${variantKey}`)

  const entryBySeed = indexSeededEntries(seededEntries)
  const nodeByKey = new Map(variant.nodes.map((node) => [node.key, node] as const))
  const incomingWinnerSources = new Map<string, string[]>()
  for (const edge of variant.edges) {
    if (!nodeByKey.has(edge.from) || !nodeByKey.has(edge.to)) throw new Error(`Invalid competition edge ${edge.from}->${edge.to}`)
    if (edge.selector !== 'WINNER') continue
    const sources = incomingWinnerSources.get(edge.to) ?? []
    sources.push(edge.from)
    incomingWinnerSources.set(edge.to, sources)
  }

  const fixtures: WorldCompetitionVirtualFixtureV1[] = []
  const fixturesByNodeKey: Record<string, WorldCompetitionVirtualFixtureV1[]> = {}
  const fixtureBySeedPair = new Map<string, WorldCompetitionVirtualFixtureV1>()

  for (const node of topologicalNodes(variant.nodes, variant.edges)) {
    const pairings = stringArray(node.pairing?.payload, 'pairings')
    const matchups = stringArray(node.pairing?.payload, 'matchups')
    if (pairings.length > 0 && matchups.length > 0) throw new Error(`Fixed bracket node ${node.key} declares both pairings and matchups`)
    const directPairings = pairings.length > 0 ? pairings : matchups
    const paths = stringArray(node.pairing?.payload, 'paths')
    const hasIncomingWinners = (incomingWinnerSources.get(node.key)?.length ?? 0) > 0
    const candidate = node.pairing?.type === 'FIXED_BRACKET' || directPairings.length > 0 || paths.length > 0 || node.teamCount === 2 || hasIncomingWinners
    if (!candidate) continue

    let participants: readonly (readonly [WorldCompetitionFixtureParticipantRefV1, WorldCompetitionFixtureParticipantRefV1])[]

    if (directPairings.length > 0) {
      participants = directPairings.map((pairing) => {
        const [leftSeed, rightSeed] = parseSeedPair(pairing)
        const left = requireSeed(entryBySeed, leftSeed)
        const right = requireSeed(entryBySeed, rightSeed)
        return Object.freeze([
          Object.freeze({ kind: 'ENTRY' as const, competitionSeasonEntryId: left.competitionSeasonEntryId, seed: left.seed }),
          Object.freeze({ kind: 'ENTRY' as const, competitionSeasonEntryId: right.competitionSeasonEntryId, seed: right.seed }),
        ]) as readonly [WorldCompetitionFixtureParticipantRefV1, WorldCompetitionFixtureParticipantRefV1]
      })
    } else if (paths.length > 0) {
      participants = paths.map((path) => {
        const [firstPair, secondPair] = parseWinnerPath(path)
        const first = fixtureBySeedPair.get(seedPairKey(firstPair[0], firstPair[1]))
        const second = fixtureBySeedPair.get(seedPairKey(secondPair[0], secondPair[1]))
        if (first === undefined) throw new Error(`Bracket path references unknown seed pairing ${firstPair[0]}_VS_${firstPair[1]} in ${node.key}`)
        if (second === undefined) throw new Error(`Bracket path references unknown seed pairing ${secondPair[0]}_VS_${secondPair[1]} in ${node.key}`)
        return Object.freeze([
          Object.freeze({ kind: 'WINNER_OF_FIXTURE' as const, fixtureId: first.fixtureId }),
          Object.freeze({ kind: 'WINNER_OF_FIXTURE' as const, fixtureId: second.fixtureId }),
        ]) as readonly [WorldCompetitionFixtureParticipantRefV1, WorldCompetitionFixtureParticipantRefV1]
      })
    } else if (node.teamCount === 2) {
      const sources = incomingWinnerSources.get(node.key) ?? []
      if (sources.length !== 1) throw new Error(`Two-team bracket node ${node.key} requires exactly one incoming WINNER source`)
      const sourceFixtures = fixturesByNodeKey[sources[0]!] ?? []
      if (sourceFixtures.length !== 2) throw new Error(`Two-team bracket node ${node.key} requires exactly two predecessor fixtures; found ${sourceFixtures.length}`)
      participants = [Object.freeze([
        Object.freeze({ kind: 'WINNER_OF_FIXTURE' as const, fixtureId: sourceFixtures[0]!.fixtureId }),
        Object.freeze({ kind: 'WINNER_OF_FIXTURE' as const, fixtureId: sourceFixtures[1]!.fixtureId }),
      ]) as readonly [WorldCompetitionFixtureParticipantRefV1, WorldCompetitionFixtureParticipantRefV1]]
    } else if (hasIncomingWinners) {
      throw new Error(`Fixed bracket node ${node.key} has incoming WINNER progression but lacks explicit paths or an unambiguous two-team destination`)
    } else {
      throw new Error(`Fixed bracket node ${node.key} lacks explicit pairings or paths`)
    }

    if (node.teamCount !== undefined && participants.length * 2 !== node.teamCount) {
      throw new Error(`Fixed bracket node ${node.key} declares ${node.teamCount} teams but resolves ${participants.length * 2}`)
    }

    const nodeFixtures = participants.map((refs, index) => Object.freeze({
      fixtureId: fixtureId(format.competitionSeasonId, variantKey, node.key, index + 1),
      competitionSeasonId: format.competitionSeasonId,
      variantKey,
      nodeKey: node.key,
      fixtureOrder: index + 1,
      participants: refs,
    }))
    fixtures.push(...nodeFixtures)
    fixturesByNodeKey[node.key] = nodeFixtures

    for (const fixture of nodeFixtures) {
      const direct = fixture.participants
      if (direct[0].kind === 'ENTRY' && direct[1].kind === 'ENTRY') {
        fixtureBySeedPair.set(seedPairKey(direct[0].seed, direct[1].seed), fixture)
      }
    }
  }

  if (fixtures.length === 0) throw new Error(`Competition format contains no instantiable fixed-bracket fixtures: ${format.competitionSeasonId}`)
  for (const edge of variant.edges.filter((candidate) => candidate.selector === 'WINNER')) {
    if ((fixturesByNodeKey[edge.from]?.length ?? 0) > 0 && (fixturesByNodeKey[edge.to]?.length ?? 0) === 0) {
      throw new Error(`Bracket progression ${edge.from}->${edge.to} is not fully materialized`)
    }
  }
  return Object.freeze({
    competitionSeasonId: format.competitionSeasonId,
    variantKey,
    fixtures: Object.freeze(fixtures),
    fixtureIdsByNodeKey: Object.freeze(Object.fromEntries(Object.entries(fixturesByNodeKey).map(([key, values]) => [key, Object.freeze(values.map((fixture) => fixture.fixtureId))]))),
  })
}

function indexSeededEntries(values: readonly WorldCompetitionSeededEntryV1[]): ReadonlyMap<number, WorldCompetitionSeededEntryV1> {
  const result = new Map<number, WorldCompetitionSeededEntryV1>()
  const entryIds = new Set<string>()
  for (const value of values) {
    if (!Number.isInteger(value.seed) || value.seed <= 0) throw new RangeError(`Competition seed must be a positive integer: ${value.seed}`)
    if (result.has(value.seed)) throw new Error(`Duplicate competition seed: ${value.seed}`)
    if (entryIds.has(value.competitionSeasonEntryId)) throw new Error(`Duplicate competition entry: ${value.competitionSeasonEntryId}`)
    result.set(value.seed, value)
    entryIds.add(value.competitionSeasonEntryId)
  }
  return result
}

function requireSeed(index: ReadonlyMap<number, WorldCompetitionSeededEntryV1>, seed: number): WorldCompetitionSeededEntryV1 {
  const value = index.get(seed)
  if (value === undefined) throw new Error(`Bracket seed is not present in competition entries: ${seed}`)
  return value
}

function stringArray(payload: JsonObject | undefined, key: string): readonly string[] {
  const value: JsonValue | undefined = payload?.[key]
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) throw new TypeError(`Bracket payload ${key} must be a string array`)
  return value as readonly string[]
}

function parseSeedPair(value: string): readonly [number, number] {
  const match = /^(\d+)(?:_VS_|-)(\d+)$/.exec(value)
  if (match === null) throw new Error(`Unsupported fixed bracket pairing: ${value}`)
  return [Number(match[1]), Number(match[2])]
}

function parseWinnerPath(value: string): readonly [readonly [number, number], readonly [number, number]] {
  const match = /^WINNER_(\d+)_VS_(\d+)_VS_WINNER_(\d+)_VS_(\d+)$/.exec(value)
  if (match === null) throw new Error(`Unsupported fixed bracket winner path: ${value}`)
  return [[Number(match[1]), Number(match[2])], [Number(match[3]), Number(match[4])]]
}

function seedPairKey(left: number, right: number): string { return left <= right ? `${left}:${right}` : `${right}:${left}` }
function fixtureId(seasonId: string, variantKey: string, nodeKey: string, order: number): string { return `worldcf:${seasonId}:${variantKey}:${nodeKey}:${order}` }

function topologicalNodes(nodes: readonly WorldCompetitionFormatNode[], edges: readonly { readonly from: string; readonly to: string }[]): readonly WorldCompetitionFormatNode[] {
  const nodeByKey = new Map(nodes.map((node) => [node.key, node] as const))
  const indegree = new Map<string, number>(nodes.map((node) => [node.key, 0]))
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    if (!nodeByKey.has(edge.from) || !nodeByKey.has(edge.to)) continue
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to])
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1)
  }
  const ready = [...nodes.filter((node) => indegree.get(node.key) === 0).map((node) => node.key)].sort()
  const ordered: WorldCompetitionFormatNode[] = []
  while (ready.length > 0) {
    const key = ready.shift()!
    ordered.push(nodeByKey.get(key)!)
    for (const destination of [...(outgoing.get(key) ?? [])].sort()) {
      const next = (indegree.get(destination) ?? 0) - 1
      indegree.set(destination, next)
      if (next === 0) { ready.push(destination); ready.sort() }
    }
  }
  if (ordered.length !== nodes.length) throw new Error('Competition format progression graph is cyclic')
  return ordered
}
