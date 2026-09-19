import {
  WORLD_COMPETITION_FORMAT_SCHEMA_VERSION,
  type WorldCompetitionCarryover,
  type WorldCompetitionConsequence,
  type WorldCompetitionContest,
  type WorldCompetitionEntrySelection,
  type WorldCompetitionFormatDocument,
  type WorldCompetitionFormatNode,
  type WorldCompetitionFormatVariant,
  type WorldCompetitionHosting,
  type WorldCompetitionOpponentScope,
  type WorldCompetitionPairing,
  type WorldCompetitionProgressionEdge,
  type WorldCompetitionSeeding,
  type WorldCompetitionSource,
  type WorldCompetitionTieResolution,
} from './WorldCompetitionFormatTypes'
import { array, boolean, enumValue, jsonObject, optionalArray, optionalPositiveInteger, optionalText, record, requireUnique, text } from './WorldCompetitionFormatParserHelpers'

export function parseWorldCompetitionFormatDocument(value: unknown): WorldCompetitionFormatDocument {
  const raw = record(value, 'competition format')
  const schemaVersion = text(raw.schema_version, 'schema_version')
  if (schemaVersion !== WORLD_COMPETITION_FORMAT_SCHEMA_VERSION) throw new RangeError(`Unsupported competition format schema_version: ${schemaVersion}`)
  const status = enumValue(raw.status, ['COMPLETE', 'PARTIAL', 'RECONCILE', 'BLOCKED'] as const, 'status')
  if (status === 'BLOCKED') throw new RangeError('BLOCKED competition formats cannot enter the active runtime bundle')
  const variants = array(raw.variants, 'variants').map(parseVariant)
  if (variants.length === 0) throw new RangeError('Competition format requires at least one variant')
  requireUnique(variants.map((variant) => variant.key), 'variant key')
  const sources = array(raw.sources, 'sources').map(parseSource)
  if (sources.length === 0) throw new RangeError('Competition format requires at least one source')
  const consequences = optionalArray(raw.consequences, 'consequences').map(parseConsequence)
  validateGraphReferences(variants, consequences)
  const notes = optionalText(raw.notes, 'notes')
  return Object.freeze({
    schemaVersion: WORLD_COMPETITION_FORMAT_SCHEMA_VERSION,
    competitionId: text(raw.competition_id, 'competition_id'),
    competitionSeasonId: text(raw.competition_season_id, 'competition_season_id'),
    seasonLabel: text(raw.season_label, 'season_label'),
    status,
    ...(notes === undefined ? {} : { notes }),
    variants: Object.freeze(variants),
    consequences: Object.freeze(consequences),
    sources: Object.freeze(sources),
  })
}

function parseVariant(value: unknown): WorldCompetitionFormatVariant {
  const raw = record(value, 'variant')
  const nodes = array(raw.nodes, 'variant.nodes').map(parseNode)
  if (nodes.length === 0) throw new RangeError('Competition format variant requires at least one node')
  requireUnique(nodes.map((node) => node.key), 'node key')
  const name = optionalText(raw.name, 'variant.name')
  const scope = optionalText(raw.scope, 'variant.scope')
  return Object.freeze({
    key: text(raw.key, 'variant.key'),
    ...(name === undefined ? {} : { name }),
    ...(scope === undefined ? {} : { scope }),
    isRealVariant: raw.is_real_variant === undefined || raw.is_real_variant === null ? false : boolean(raw.is_real_variant, 'variant.is_real_variant'),
    ...(raw.entry_selection === undefined || raw.entry_selection === null ? {} : { entrySelection: parseEntrySelection(raw.entry_selection) }),
    ...(raw.seeding === undefined || raw.seeding === null ? {} : { seeding: parseSeeding(raw.seeding) }),
    nodes: Object.freeze(nodes),
    edges: Object.freeze(optionalArray(raw.edges, 'variant.edges').map(parseEdge)),
  })
}

function parseEntrySelection(value: unknown): WorldCompetitionEntrySelection {
  const raw = record(value, 'entry_selection')
  return Object.freeze({ method: enumValue(raw.method, ['DIRECT', 'QUALIFICATION', 'RANK_BASED', 'WILDCARD', 'LICENSE', 'HOST', 'COMMITTEE_SELECTION'] as const, 'entry_selection.method'), payload: jsonObject(raw.payload, 'entry_selection.payload') })
}
function parseSeeding(value: unknown): WorldCompetitionSeeding {
  const raw = record(value, 'seeding')
  return Object.freeze({ schemeType: enumValue(raw.scheme_type, ['RANK_BASED', 'DRAW', 'POTS', 'GEOGRAPHIC', 'COMMITTEE', 'FIXED'] as const, 'seeding.scheme_type'), basis: Object.freeze(optionalArray(raw.basis, 'seeding.basis').map((item) => jsonObject(item, 'seeding.basis item'))) })
}
function parseNode(value: unknown): WorldCompetitionFormatNode {
  const raw = record(value, 'node')
  const specializedType = optionalText(raw.specialized_type, 'node.specialized_type')
  const name = optionalText(raw.name, 'node.name')
  const parent = optionalText(raw.parent, 'node.parent')
  const teamCount = optionalPositiveInteger(raw.team_count, 'node.team_count')
  return Object.freeze({
    key: text(raw.key, 'node.key'),
    nodeType: enumValue(raw.node_type, ['STAGE', 'GROUP', 'ROUND', 'SERIES', 'BRACKET', 'SUBDIVISION'] as const, 'node.node_type'),
    role: enumValue(raw.role, ['REGULAR_SEASON', 'GROUP_STAGE', 'CONFERENCE_STAGE', 'SPLIT_STAGE', 'PLAY_IN', 'PLAYOFF', 'PLAYOUT', 'PROMOTION_STAGE', 'RELEGATION_STAGE', 'QUALIFIER', 'FINAL_FOUR', 'FINAL_EIGHT', 'FINAL', 'PLACEMENT'] as const, 'node.role'),
    ...(specializedType === undefined ? {} : { specializedType }), ...(name === undefined ? {} : { name }), ...(parent === undefined ? {} : { parent }), ...(teamCount === undefined ? {} : { teamCount }),
    ...(raw.pairing === undefined || raw.pairing === null ? {} : { pairing: parsePairing(raw.pairing) }), ...(raw.opponent_scope === undefined || raw.opponent_scope === null ? {} : { opponentScope: parseOpponentScope(raw.opponent_scope) }), ...(raw.contest === undefined || raw.contest === null ? {} : { contest: parseContest(raw.contest) }), ...(raw.hosting === undefined || raw.hosting === null ? {} : { hosting: parseHosting(raw.hosting) }), ...(raw.carryover === undefined || raw.carryover === null ? {} : { carryover: parseCarryover(raw.carryover) }),
  })
}
function parsePairing(value: unknown): WorldCompetitionPairing {
  const raw = record(value, 'pairing'); const meetingsPerPair = optionalPositiveInteger(raw.meetings_per_pair, 'pairing.meetings_per_pair')
  return Object.freeze({ type: enumValue(raw.type, ['ROUND_ROBIN', 'FIXED_SCHEDULE', 'FIXED_BRACKET', 'SEEDED_BRACKET', 'CROSS_GROUP', 'DRAW', 'RESEED'] as const, 'pairing.type'), ...(meetingsPerPair === undefined ? {} : { meetingsPerPair }), payload: jsonObject(raw.payload, 'pairing.payload') })
}
function parseOpponentScope(value: unknown): WorldCompetitionOpponentScope { const raw = record(value, 'opponent_scope'); return Object.freeze({ type: enumValue(raw.type, ['ALL_STAGE', 'SAME_GROUP', 'SAME_SUBDIVISION', 'CROSS_SUBDIVISION', 'SELECTIVE', 'SCHEDULE_MATRIX'] as const, 'opponent_scope.type'), payload: jsonObject(raw.payload, 'opponent_scope.payload') }) }
function parseContest(value: unknown): WorldCompetitionContest {
  const raw = record(value, 'contest'); const bestOf = optionalPositiveInteger(raw.best_of, 'contest.best_of'); const winsRequired = optionalPositiveInteger(raw.wins_required, 'contest.wins_required'); if (bestOf !== undefined && winsRequired !== undefined && winsRequired > bestOf) throw new RangeError('contest.wins_required cannot exceed contest.best_of'); const legCount = optionalPositiveInteger(raw.leg_count, 'contest.leg_count'); const aggregateMetric = optionalText(raw.aggregate_metric, 'contest.aggregate_metric')
  return Object.freeze({ formatType: enumValue(raw.format_type, ['SINGLE_GAME', 'SERIES', 'AGGREGATE'] as const, 'contest.format_type'), ...(raw.requires_winner === undefined || raw.requires_winner === null ? {} : { requiresWinner: boolean(raw.requires_winner, 'contest.requires_winner') }), ...(bestOf === undefined ? {} : { bestOf }), ...(winsRequired === undefined ? {} : { winsRequired }), ...(legCount === undefined ? {} : { legCount }), ...(aggregateMetric === undefined ? {} : { aggregateMetric }), ...(raw.tie_resolution === undefined || raw.tie_resolution === null ? {} : { tieResolution: parseTieResolution(raw.tie_resolution) }) })
}
function parseTieResolution(value: unknown): WorldCompetitionTieResolution { const raw = record(value, 'tie_resolution'); const trigger = optionalText(raw.trigger, 'tie_resolution.trigger'); const method = optionalText(raw.method, 'tie_resolution.method'); const location = optionalText(raw.location, 'tie_resolution.location'); return Object.freeze({ ...(trigger === undefined ? {} : { trigger }), ...(method === undefined ? {} : { method }), ...(location === undefined ? {} : { location }) }) }
function parseHosting(value: unknown): WorldCompetitionHosting { const raw = record(value, 'hosting'); const pattern = optionalText(raw.pattern, 'hosting.pattern'); const priorityBasis = optionalText(raw.priority_basis, 'hosting.priority_basis'); return Object.freeze({ ruleType: enumValue(raw.rule_type, ['NEUTRAL', 'HIGHER_SEED', 'BALANCED', 'SERIES_PATTERN', 'ASSIGNED_HOST', 'DRAWN_HOST'] as const, 'hosting.rule_type'), ...(pattern === undefined ? {} : { pattern }), ...(priorityBasis === undefined ? {} : { priorityBasis }), payload: jsonObject(raw.payload, 'hosting.payload') }) }
function parseCarryover(value: unknown): WorldCompetitionCarryover { const raw = record(value, 'carryover'); const sourceNode = optionalText(raw.source_node, 'carryover.source_node'); return Object.freeze({ ruleType: enumValue(raw.rule_type, ['NONE', 'FULL', 'SELECTIVE', 'TRANSFORMED'] as const, 'carryover.rule_type'), ...(sourceNode === undefined ? {} : { sourceNode }), payload: jsonObject(raw.payload, 'carryover.payload') }) }
function parseEdge(value: unknown): WorldCompetitionProgressionEdge {
  const raw = record(value, 'edge'); const rankFrom = optionalPositiveInteger(raw.rank_from, 'edge.rank_from'); const rankTo = optionalPositiveInteger(raw.rank_to, 'edge.rank_to'); const count = optionalPositiveInteger(raw.count, 'edge.count'); if (rankFrom !== undefined && rankTo !== undefined && rankFrom > rankTo) throw new RangeError('edge.rank_from cannot exceed edge.rank_to')
  return Object.freeze({ from: text(raw.from, 'edge.from'), to: text(raw.to, 'edge.to'), selector: enumValue(raw.selector, ['RANK_RANGE', 'TOP_N', 'BOTTOM_N', 'WINNER', 'LOSER', 'BEST_ACROSS_GROUPS', 'WILDCARD', 'AT_LARGE', 'BYE'] as const, 'edge.selector'), ...(rankFrom === undefined ? {} : { rankFrom }), ...(rankTo === undefined ? {} : { rankTo }), ...(count === undefined ? {} : { count }), payload: jsonObject(raw.payload, 'edge.payload') })
}
function parseConsequence(value: unknown): WorldCompetitionConsequence {
  const raw = record(value, 'consequence'); const rankFrom = optionalPositiveInteger(raw.rank_from, 'consequence.rank_from'); const rankTo = optionalPositiveInteger(raw.rank_to, 'consequence.rank_to'); const count = optionalPositiveInteger(raw.count, 'consequence.count'); if (rankFrom !== undefined && rankTo !== undefined && rankFrom > rankTo) throw new RangeError('consequence.rank_from cannot exceed consequence.rank_to'); const targetCompetitionId = optionalText(raw.target_competition_id, 'consequence.target_competition_id'); const targetCompetitionSeasonId = optionalText(raw.target_competition_season_id, 'consequence.target_competition_season_id')
  return Object.freeze({ variantKey: text(raw.variant_key, 'consequence.variant_key'), sourceNode: text(raw.source_node, 'consequence.source_node'), selector: enumValue(raw.selector, ['RANK_RANGE', 'TOP_N', 'BOTTOM_N', 'WINNER', 'LOSER'] as const, 'consequence.selector'), type: enumValue(raw.type, ['PROMOTION', 'RELEGATION', 'EXTERNAL_QUALIFICATION', 'ELIMINATION'] as const, 'consequence.type'), ...(rankFrom === undefined ? {} : { rankFrom }), ...(rankTo === undefined ? {} : { rankTo }), ...(count === undefined ? {} : { count }), ...(targetCompetitionId === undefined ? {} : { targetCompetitionId }), ...(targetCompetitionSeasonId === undefined ? {} : { targetCompetitionSeasonId }), payload: jsonObject(raw.payload, 'consequence.payload') })
}
function parseSource(value: unknown): WorldCompetitionSource { const raw = record(value, 'source'); const url = text(raw.url, 'source.url'); if (!/^https?:\/\//.test(url)) throw new TypeError('source.url must be http(s)'); const scope = optionalText(raw.scope, 'source.scope'); const notes = optionalText(raw.notes, 'source.notes'); return Object.freeze({ url, type: enumValue(raw.type, ['OFFICIAL', 'PRIMARY', 'SECONDARY'] as const, 'source.type'), ...(scope === undefined ? {} : { scope }), ...(notes === undefined ? {} : { notes }) }) }

function validateGraphReferences(variants: readonly WorldCompetitionFormatVariant[], consequences: readonly WorldCompetitionConsequence[]): void {
  const variantByKey = new Map(variants.map((variant) => [variant.key, variant] as const))
  for (const variant of variants) {
    const nodeKeys = new Set(variant.nodes.map((node) => node.key))
    for (const node of variant.nodes) { if (node.parent !== undefined && !nodeKeys.has(node.parent)) throw new RangeError(`Unknown parent node ${node.parent} in variant ${variant.key}`); if (node.carryover?.sourceNode !== undefined && !nodeKeys.has(node.carryover.sourceNode)) throw new RangeError(`Unknown carryover source node ${node.carryover.sourceNode} in variant ${variant.key}`) }
    for (const edge of variant.edges) { if (!nodeKeys.has(edge.from)) throw new RangeError(`Unknown edge source node ${edge.from} in variant ${variant.key}`); if (!nodeKeys.has(edge.to)) throw new RangeError(`Unknown edge destination node ${edge.to} in variant ${variant.key}`); if (edge.from === edge.to) throw new RangeError(`Competition progression edge cannot self-reference node ${edge.from}`) }
  }
  for (const consequence of consequences) { const variant = variantByKey.get(consequence.variantKey); if (variant === undefined) throw new RangeError(`Unknown consequence variant ${consequence.variantKey}`); if (!variant.nodes.some((node) => node.key === consequence.sourceNode)) throw new RangeError(`Unknown consequence source node ${consequence.sourceNode} in variant ${consequence.variantKey}`) }
}
