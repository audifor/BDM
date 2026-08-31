import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createOrganizationKnowledge, migrateLegacyPlayerKnowledge, type OrganizationKnowledge } from '@/domain/knowledge'
import { organizationIdFromString, playerIdFromString } from '@/domain/ids'
import { parseGameDate } from '@/domain/date'
import { CANONICAL_RATING_KEYS, TENDENCY_KEYS, createPlayer, type Player, type PlayerRatings, type PlayerTendencies } from '@/domain/player'
import { DEVELOPMENT_DOMAINS, createDevelopmentProfile, type PlayerDevelopmentProfile } from '@/domain/player/PlayerDevelopmentProfile'
import { PERSONALITY_DIMENSIONS } from '@/domain/personality'
import { createEvaluatorProfile, EVIDENCE_SOURCES, SCOUTING_MISSIONS, type Evidence, type EvaluatorProfile, type EvaluatorReport, type ScoutingAssignment } from '@/domain/scouting'
import type { OrganizationEvaluationPolicy } from '@/domain/intelligence'
import { deserializeGameWorldV1, serializeGameWorldV1, type GameWorldSaveV1, type SaveGameEnvelopeV1 } from './GameWorldSaveV1'

/** V2 owns canonical PlayerTruth. V1 remains a read-only legacy boundary. */
export interface GameWorldSaveV2 extends GameWorldSaveV1 { readonly organizationKnowledge: readonly Readonly<Record<string, unknown>>[]; readonly scoutingRuntime?: Readonly<Record<string, unknown>>; readonly marketRuntime?: Readonly<Record<string, unknown>> }
export interface SaveGameEnvelopeV2 { readonly schemaVersion: 2; readonly savedAt: string; readonly payload: GameWorldSaveV2 }

export function migrateGameWorldSaveV1ToV2(value: SaveGameEnvelopeV1): SaveGameEnvelopeV2 {
  const world = deserializeGameWorldV1(value, { enrichLegacy: false })
  const legacyShape = serializeGameWorldV1(world, value.savedAt)
  return { schemaVersion: 2, savedAt: legacyShape.savedAt, payload: v2Payload(legacyShape.payload, Object.values(world.playerKnowledgeById).map((record) => migrateLegacyPlayerKnowledge(record))) }
}

export function serializeGameWorldV2(world: GameWorld, savedAt: string): SaveGameEnvelopeV2 {
  const compatibilityPayload = serializeGameWorldV1(world, savedAt)
  return { schemaVersion: 2, savedAt: compatibilityPayload.savedAt, payload: v2Payload(compatibilityPayload.payload, world.organizationKnowledge, world) }
}

export function deserializeGameWorldV2(value: unknown): GameWorld {
  const envelope = record(value, 'Save V2 file')
  assertExactKeys(envelope, ['schemaVersion', 'savedAt', 'payload'], 'Save V2 envelope')
  if (envelope.schemaVersion !== 2) throw new Error('Unsupported save version')
  if (typeof envelope.savedAt !== 'string' || Number.isNaN(Date.parse(envelope.savedAt))) throw new TypeError('Save V2 savedAt must be an ISO-8601 timestamp')
  const payload = record(envelope.payload, 'Save V2 payload')
  parseV2Payload(payload)
  const world = deserializeGameWorldV1({ schemaVersion: 1, savedAt: envelope.savedAt, payload }, { enrichLegacy: false, readPlayer: parsePlayerV2 })
  const runtime = parseScoutingRuntimeV2(payload.scoutingRuntime)
  const market = parseMarketRuntimeV2(payload.marketRuntime)
  return updateGameWorld(world, { organizationKnowledge: parseOrganizationKnowledgeV2(payload.organizationKnowledge), evidence: runtime.evidence, evaluatorProfilesByStaffId: runtime.evaluatorProfilesByStaffId, scoutingAssignments: runtime.scoutingAssignments, evaluatorReports: runtime.evaluatorReports, agents: market.agents, agencies: market.agencies, playerRepresentations: market.playerRepresentations, marketReality: market.marketReality, marketKnowledge: market.marketKnowledge, marketSignals: market.marketSignals, negotiations: market.negotiations, rolePromises: market.rolePromises, ...(Object.keys(runtime.organizationEvaluationPoliciesById).length === 0 ? {} : { organizationEvaluationPoliciesById: runtime.organizationEvaluationPoliciesById }) })
}

function v2Payload(payload: GameWorldSaveV1, organizationKnowledge: readonly OrganizationKnowledge[], world?: GameWorld): GameWorldSaveV2 {
  return { ...payload, players: payload.players.map(({ potential: _potential, ...player }) => player), playerKnowledge: [], organizationKnowledge: organizationKnowledge.map((knowledge) => JSON.parse(JSON.stringify(knowledge)) as Readonly<Record<string, unknown>>), ...(world === undefined ? {} : { scoutingRuntime: { evidence: Object.values(world.evidenceById), evaluatorProfiles: Object.values(world.evaluatorProfilesByStaffId), assignments: Object.values(world.scoutingAssignmentsById), reports: Object.values(world.evaluatorReportsById), organizationPolicies: world.organizationEvaluationPoliciesById }, marketRuntime: { agents: Object.values(world.agentsById), agencies: Object.values(world.agenciesById), representations: world.playerRepresentations, reality: Object.values(world.marketRealityByPlayerId), knowledge: world.marketKnowledge, signals: Object.values(world.marketSignalsById), negotiations: Object.values(world.negotiationsById), rolePromises: Object.values(world.rolePromisesById) } }) }
}

/** V2 has its own closed-schema parsers; V1 readers are never used for changed contracts. */
export function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], name = 'Object'): void {
  const actual = Object.keys(value)
  if (actual.length !== expected.length || actual.some((key) => !expected.includes(key))) throw new TypeError(`${name} must contain exactly: ${expected.join(', ')}`)
}

export function parseCanonicalRatingsV2(value: unknown): PlayerRatings {
  const ratings = record(value, 'Player V2 ratings')
  assertExactKeys(ratings, CANONICAL_RATING_KEYS, 'Player V2 ratings')
  return Object.fromEntries(CANONICAL_RATING_KEYS.map((key) => [key, rating(ratings[key], `Player rating ${key}`)])) as PlayerRatings
}

export function parsePlayerTendenciesV2(value: unknown): PlayerTendencies {
  const tendencies = record(value, 'Player V2 tendencies')
  assertExactKeys(tendencies, TENDENCY_KEYS, 'Player V2 tendencies')
  return Object.fromEntries(TENDENCY_KEYS.map((key) => [key, rating(tendencies[key], `Player tendency ${key}`)])) as PlayerTendencies
}

export function parseDevelopmentProfileV2(value: unknown): PlayerDevelopmentProfile {
  const profile = record(value, 'Player V2 development')
  assertExactKeys(profile, ['developmentStage', 'growthRate', 'declineSensitivity', 'ceilings'], 'Player V2 development')
  const ceilings = record(profile.ceilings, 'Player V2 development ceilings')
  assertExactKeys(ceilings, DEVELOPMENT_DOMAINS, 'Player V2 development ceilings')
  return createDevelopmentProfile({ developmentStage: enumValue(profile.developmentStage, ['early', 'developing', 'prime', 'declining'], 'Player development stage') as PlayerDevelopmentProfile['developmentStage'], growthRate: rating(profile.growthRate, 'Player development growthRate'), declineSensitivity: rating(profile.declineSensitivity, 'Player development declineSensitivity'), ceilings: Object.fromEntries(DEVELOPMENT_DOMAINS.map((key) => [key, rating(ceilings[key], `Player development ${key}`)])) as PlayerDevelopmentProfile['ceilings'] })
}

export function parsePlayerV2(value: unknown, _referenceDate: import('@/domain/date').GameDate, _currentDate: import('@/domain/date').GameDate): Player {
  const player = record(value, 'Player V2')
  assertExactKeys(player, ['id', 'firstName', 'lastName', 'gender', 'nationalityId', 'basketball', 'bio', 'development'], 'Player V2')
  const basketball = record(player.basketball, 'Player V2 basketball')
  const basketballKeys = basketball.secondaryPositions === undefined ? ['primaryPosition', 'ratings', 'tendencies', 'traitIds'] : ['primaryPosition', 'secondaryPositions', 'ratings', 'tendencies', 'traitIds']
  assertExactKeys(basketball, basketballKeys, 'Player V2 basketball')
  const bio = record(player.bio, 'Player V2 bio')
  assertExactKeys(bio, ['dateOfBirth', 'heightCm', 'weightKg', 'wingspanCm', 'standingReachCm', 'dominantHand', 'measurementProvenance'], 'Player V2 bio')
  const provenance = record(bio.measurementProvenance, 'Player V2 measurement provenance')
  assertExactKeys(provenance, ['wingspanCm', 'standingReachCm', 'dominantHand'], 'Player V2 measurement provenance')
  const positions = basketball.secondaryPositions === undefined ? undefined : array(basketball.secondaryPositions, 'Player V2 secondary positions').map((position) => enumValue(position, ['PG', 'SG', 'SF', 'PF', 'C'], 'Player secondary position') as Player['basketball']['primaryPosition'])
  return createPlayer({ id: playerIdFromString(text(player.id, 'Player id')), firstName: text(player.firstName, 'Player firstName'), lastName: text(player.lastName, 'Player lastName'), gender: enumValue(player.gender, ['male', 'female'], 'Player gender') as Player['gender'], nationalityId: text(player.nationalityId, 'Player nationalityId') as Player['nationalityId'], basketball: { primaryPosition: enumValue(basketball.primaryPosition, ['PG', 'SG', 'SF', 'PF', 'C'], 'Player primary position') as Player['basketball']['primaryPosition'], ...(positions === undefined ? {} : { secondaryPositions: positions }), ratings: parseCanonicalRatingsV2(basketball.ratings), tendencies: parsePlayerTendenciesV2(basketball.tendencies), traitIds: array(basketball.traitIds, 'Player V2 traits').map((item) => text(item, 'Player trait')) }, bio: { dateOfBirth: parseGameDate(text(bio.dateOfBirth, 'Player dateOfBirth')), heightCm: finite(bio.heightCm, 'Player heightCm'), weightKg: finite(bio.weightKg, 'Player weightKg'), wingspanCm: finite(bio.wingspanCm, 'Player wingspanCm'), standingReachCm: finite(bio.standingReachCm, 'Player standingReachCm'), dominantHand: enumValue(bio.dominantHand, ['LEFT', 'RIGHT'], 'Player dominant hand') as 'LEFT' | 'RIGHT', measurementProvenance: { wingspanCm: provenanceValue(provenance.wingspanCm), standingReachCm: provenanceValue(provenance.standingReachCm), dominantHand: provenanceValue(provenance.dominantHand) } }, development: parseDevelopmentProfileV2(player.development) })
}

export function parsePersonalityV2(value: unknown): void {
  const entry = record(value, 'Personality V2'); assertExactKeys(entry, ['coachId', 'profile'], 'Personality V2')
  text(entry.coachId, 'Personality V2 person id'); const profile = record(entry.profile, 'Personality V2 profile'); assertExactKeys(profile, ['values'], 'Personality V2 profile')
  const values = record(profile.values, 'Personality V2 values'); assertExactKeys(values, PERSONALITY_DIMENSIONS, 'Personality V2 values')
  for (const key of PERSONALITY_DIMENSIONS) { const item = finite(values[key], `Personality ${key}`); if (!Number.isInteger(item) || item < 0 || item > 100) throw new RangeError(`Personality ${key} is invalid`) }
}

export function parseDevelopmentStimulusV2(value: unknown): void {
  const entry = record(value, 'Development stimulus V2'); assertExactKeys(entry, ['playerId', 'byRating'], 'Development stimulus V2'); text(entry.playerId, 'Development stimulus player id')
  const ratings = record(entry.byRating, 'Development stimulus V2 ratings'); assertExactKeys(ratings, CANONICAL_RATING_KEYS, 'Development stimulus V2 ratings')
  for (const key of CANONICAL_RATING_KEYS) { if (finite(ratings[key], `Development stimulus ${key}`) < 0) throw new RangeError('Development stimulus must be non-negative') }
}

export function parseOrganizationKnowledgeV2(value: unknown): readonly OrganizationKnowledge[] {
  if (!Array.isArray(value)) throw new TypeError('Save organizationKnowledge must be an array')
  return value.map((entry) => {
    const source = record(entry, 'Organization knowledge V2'); assertExactKeys(source, ['organizationId', 'subjectPlayerId', 'dimensions'], 'Organization knowledge V2')
    const sourceDimensions = record(source.dimensions, 'Organization knowledge V2 dimensions')
    const dimensions = Object.fromEntries(Object.entries(sourceDimensions).map(([key, raw]) => {
      if (!/^(finishing|shooting|creation|perimeterDefense|interiorDefense|rebounding|physical|potential:[a-zA-Z]+|tacticalFit)$/.test(key)) throw new TypeError(`Unknown organization knowledge dimension ${key}`)
      const finding = record(raw, 'Organization knowledge V2 finding'); const keys = ['coverage', 'confidence', 'assessedAt', 'provenance', ...(finding.estimate === undefined ? [] : ['estimate']), ...(finding.uncertainty === undefined ? [] : ['uncertainty']), ...(finding.evidenceIds === undefined ? [] : ['evidenceIds']), ...(finding.reportIds === undefined ? [] : ['reportIds'])]; assertExactKeys(finding, keys, 'Organization knowledge V2 finding')
      return [key, { coverage: bounded(finding.coverage, 'Organization knowledge coverage', 0, 1), confidence: bounded(finding.confidence, 'Organization knowledge confidence', 0, 1), assessedAt: parseGameDate(text(finding.assessedAt, 'Organization knowledge assessedAt')), provenance: enumValue(finding.provenance, ['legacyBaseline', 'public', 'ownObservation', 'scoutReport', 'inferred', 'staffFamiliarity'], 'Organization knowledge provenance') as OrganizationKnowledge['dimensions'][string]['provenance'], ...(finding.estimate === undefined ? {} : { estimate: bounded(finding.estimate, 'Organization knowledge estimate', 0, 100) }), ...(finding.uncertainty === undefined ? {} : { uncertainty: bounded(finding.uncertainty, 'Organization knowledge uncertainty', 0, 20) }), ...(finding.evidenceIds === undefined ? {} : { evidenceIds: array(finding.evidenceIds, 'Organization knowledge evidence IDs').map((id) => text(id, 'Organization knowledge evidence ID')) }), ...(finding.reportIds === undefined ? {} : { reportIds: array(finding.reportIds, 'Organization knowledge report IDs').map((id) => text(id, 'Organization knowledge report ID')) }) }]
    }))
    return createOrganizationKnowledge({ organizationId: organizationIdFromString(text(source.organizationId, 'Organization knowledge organizationId')), subjectPlayerId: playerIdFromString(text(source.subjectPlayerId, 'Organization knowledge subjectPlayerId')), dimensions })
  })
}

function parseScoutingRuntimeV2(value: unknown): { readonly evidence: readonly Evidence[]; readonly evaluatorProfilesByStaffId: Readonly<Record<import('@/domain/ids').StaffPersonId, EvaluatorProfile>>; readonly scoutingAssignments: readonly ScoutingAssignment[]; readonly evaluatorReports: readonly EvaluatorReport[]; readonly organizationEvaluationPoliciesById: Readonly<Record<import('@/domain/ids').OrganizationId, OrganizationEvaluationPolicy>> } {
  if (value === undefined) return { evidence: [], evaluatorProfilesByStaffId: {}, scoutingAssignments: [], evaluatorReports: [], organizationEvaluationPoliciesById: {} }
  const runtime = record(value, 'Scouting runtime V2'); assertExactKeys(runtime, runtime.organizationPolicies === undefined ? ['evidence', 'evaluatorProfiles', 'assignments', 'reports'] : ['evidence', 'evaluatorProfiles', 'assignments', 'reports', 'organizationPolicies'], 'Scouting runtime V2')
  const evidence = array(runtime.evidence, 'Scouting evidence').map((raw) => { const item = record(raw, 'Evidence'); assertExactKeys(item, ['id', 'organizationId', 'subjectPlayerId', 'source', 'observedAt', 'quality', 'dimensions', ...(item.context === undefined ? [] : ['context']), ...(item.gameId === undefined ? [] : ['gameId'])], 'Evidence'); return { id: text(item.id, 'Evidence id'), organizationId: organizationIdFromString(text(item.organizationId, 'Evidence organization')), subjectPlayerId: playerIdFromString(text(item.subjectPlayerId, 'Evidence player')), source: enumValue(item.source, EVIDENCE_SOURCES, 'Evidence source') as Evidence['source'], observedAt: parseGameDate(text(item.observedAt, 'Evidence date')), quality: bounded(item.quality, 'Evidence quality', 0, 1), dimensions: array(item.dimensions, 'Evidence dimensions').map((d) => text(d, 'Evidence dimension')), ...(item.context === undefined ? {} : { context: text(item.context, 'Evidence context') }), ...(item.gameId === undefined ? {} : { gameId: text(item.gameId, 'Evidence game') }) } })
  const profiles = array(runtime.evaluatorProfiles, 'Evaluator profiles').map((raw) => { const item = record(raw, 'Evaluator profile'); assertExactKeys(item, ['staffPersonId', 'experience', 'perks', 'biases'], 'Evaluator profile'); return createEvaluatorProfile({ staffPersonId: text(item.staffPersonId, 'Evaluator staff') as import('@/domain/ids').StaffPersonId, experience: bounded(item.experience, 'Evaluator experience', 0, 100), perks: array(item.perks, 'Evaluator perks').map((p) => enumValue(p, ['EYE_FOR_SHOOTERS', 'PROJECTION_EXPERT', 'TAPE_GRINDER', 'LIVE_SCOUT'], 'Evaluator perk') as EvaluatorProfile['perks'][number]), biases: array(item.biases, 'Evaluator biases').map((b) => enumValue(b, ['UPSIDE_BIAS', 'PRODUCTION_BIAS', 'ATHLETICISM_BIAS', 'SIZE_BIAS'], 'Evaluator bias') as EvaluatorProfile['biases'][number]) }) })
  const assignments = array(runtime.assignments, 'Scouting assignments').map((raw) => parseScoutingAssignmentV2(raw))
  const reports = array(runtime.reports, 'Evaluator reports').map((raw) => JSON.parse(JSON.stringify(record(raw, 'Evaluator report'))) as EvaluatorReport)
  const policies = runtime.organizationPolicies === undefined ? {} : Object.fromEntries(Object.entries(record(runtime.organizationPolicies, 'Organization policies')).map(([id, raw]) => { const policy=record(raw, 'Organization policy'); assertExactKeys(policy, ['riskTolerance','certaintyPreference','upsidePreference','currentAbilityPreference','scoutingReliance'], 'Organization policy'); return [organizationIdFromString(id), {riskTolerance:bounded(policy.riskTolerance,'riskTolerance',0,100),certaintyPreference:bounded(policy.certaintyPreference,'certaintyPreference',0,100),upsidePreference:bounded(policy.upsidePreference,'upsidePreference',0,100),currentAbilityPreference:bounded(policy.currentAbilityPreference,'currentAbilityPreference',0,100),scoutingReliance:bounded(policy.scoutingReliance,'scoutingReliance',0,100)}] })) as Readonly<Record<import('@/domain/ids').OrganizationId, OrganizationEvaluationPolicy>>
  return { evidence, evaluatorProfilesByStaffId: Object.fromEntries(profiles.map((profile) => [profile.staffPersonId, profile])) as Readonly<Record<import('@/domain/ids').StaffPersonId, EvaluatorProfile>>, scoutingAssignments: assignments, evaluatorReports: reports, organizationEvaluationPoliciesById: policies }
}

/**
 * `staffQualityScore` (Wave 3) is the only `ScoutingAssignment` field with a closed domain
 * contract (optional, finite, 0-100) — the rest of the assignment shape is preserved via the
 * existing plain JSON cast (already-established V2 discipline for this record) since it carries
 * no new Wave 3 semantics. A save with an out-of-range or non-finite `staffQualityScore` is
 * rejected rather than silently clamped or dropped.
 */
function parseScoutingAssignmentV2(raw: unknown): ScoutingAssignment {
  const item = record(raw, 'Scouting assignment')
  const parsed = JSON.parse(JSON.stringify(item)) as ScoutingAssignment
  if (item.staffQualityScore === undefined) return parsed
  return { ...parsed, staffQualityScore: bounded(item.staffQualityScore, 'Scouting assignment staffQualityScore', 0, 100) }
}

function parseMarketRuntimeV2(value: unknown): { readonly agents: readonly import('@/domain/market').Agent[]; readonly agencies: readonly import('@/domain/market').Agency[]; readonly playerRepresentations: readonly import('@/domain/market').PlayerRepresentation[]; readonly marketReality: readonly import('@/domain/market').MarketReality[]; readonly marketKnowledge: readonly import('@/domain/market').MarketKnowledge[]; readonly marketSignals: readonly import('@/domain/market').MarketSignal[]; readonly negotiations: readonly import('@/domain/market').ContractNegotiation[]; readonly rolePromises: readonly import('@/domain/market').RolePromise[] } {
  const empty = { agents: [], agencies: [], playerRepresentations: [], marketReality: [], marketKnowledge: [], marketSignals: [], negotiations: [], rolePromises: [] } as const
  if (value === undefined) return empty
  const runtime = record(value, 'Market runtime V2'); assertExactKeys(runtime, ['agents','agencies','representations','reality','knowledge','signals','negotiations','rolePromises'], 'Market runtime V2')
  const items = <T>(key:string) => array(runtime[key], `Market runtime ${key}`).map((item) => JSON.parse(JSON.stringify(record(item, `Market runtime ${key}`))) as T)
  return { agents: items<import('@/domain/market').Agent>('agents'), agencies: items<import('@/domain/market').Agency>('agencies'), playerRepresentations: items<import('@/domain/market').PlayerRepresentation>('representations'), marketReality: items<import('@/domain/market').MarketReality>('reality'), marketKnowledge: items<import('@/domain/market').MarketKnowledge>('knowledge'), marketSignals: items<import('@/domain/market').MarketSignal>('signals'), negotiations: items<import('@/domain/market').ContractNegotiation>('negotiations'), rolePromises: items<import('@/domain/market').RolePromise>('rolePromises') }
}

function parseV2Payload(payload: Record<string, unknown>): void {
  const players = array(payload.players, 'Save V2 players'); players.forEach((player) => parsePlayerShapeV2(player))
  const knowledge = array(payload.organizationKnowledge, 'Save V2 organizationKnowledge'); parseOrganizationKnowledgeV2(knowledge)
  parseScoutingRuntimeV2(payload.scoutingRuntime)
  parseMarketRuntimeV2(payload.marketRuntime)
  const legacyKnowledge = array(payload.playerKnowledge, 'Save V2 playerKnowledge'); if (legacyKnowledge.length !== 0) throw new TypeError('Save V2 must not contain legacy playerKnowledge')
  array(payload.personalities, 'Save V2 personalities').forEach(parsePersonalityV2)
  array(payload.developmentStimulus, 'Save V2 developmentStimulus').forEach(parseDevelopmentStimulusV2)
}
function parsePlayerShapeV2(value: unknown): void { parsePlayerV2(value, '2000-01-01' as import('@/domain/date').GameDate, '2000-01-01' as import('@/domain/date').GameDate) }
function record(value: unknown, name: string): Record<string, unknown> { if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`); return value as Record<string, unknown> }
function array(value: unknown, name: string): readonly unknown[] { if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`); return value }
function text(value: unknown, name: string): string { if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${name} must be a non-empty string`); return value }
function finite(value: unknown, name: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`); return value }
function bounded(value: unknown, name: string, minimum: number, maximum: number): number { const result = finite(value, name); if (result < minimum || result > maximum) throw new RangeError(`${name} must be from ${minimum} to ${maximum}`); return result }
function rating(value: unknown, name: string): number { return bounded(value, name, 1, 100) }
function enumValue(value: unknown, allowed: readonly string[], name: string): string { const result = text(value, name); if (!allowed.includes(result)) throw new TypeError(`${name} is invalid`); return result }
function provenanceValue(value: unknown): 'sourced' | 'generated' | 'migrated' | 'inferred' { return enumValue(value, ['sourced', 'generated', 'migrated', 'inferred'], 'Player measurement provenance') as 'sourced' | 'generated' | 'migrated' | 'inferred' }

/** Read dispatcher: V1 is migrated purely; runtime serialization is V2 only. */
export function deserializeGameWorldSave(value: unknown): GameWorld {
  const version = (value as { schemaVersion?: unknown }).schemaVersion
  if (version === 1) return deserializeGameWorldV2(migrateGameWorldSaveV1ToV2(value as SaveGameEnvelopeV1))
  if (version === 2) return deserializeGameWorldV2(value)
  throw new Error('Unsupported save version')
}
