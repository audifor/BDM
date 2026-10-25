import { parseWorldCompetitionFormatDocument, type WorldCompetitionFormatDocument } from '@/domain/competition'
import { assertWorldDbCompetitionBundleV1, type WorldDbCompetitionBundleV1 } from './CompetitionBundle'

export interface Db04PbmSourceV1 {
  readonly databaseFile: string
  readonly catalogLayers: readonly ['DB-03', 'DB-04']
}

export interface Db04PbmCountriesResponseV1 {
  readonly schemaVersion: 1
  readonly source: Db04PbmSourceV1
  readonly countries: readonly Db04PbmCountryV1[]
}

export interface Db04PbmCompetitionsResponseV1 {
  readonly schemaVersion: 1
  readonly source: Db04PbmSourceV1
  readonly competitions: readonly Db04PbmCompetitionSummaryV1[]
}

export interface Db04PbmCountryV1 {
  readonly countryKey: string
  readonly sourceId: number
  readonly name: string
  readonly sourceCode: string
  readonly continentId: number
  readonly provenance: string
  readonly confidence: string
}

export function parseDb04PbmCountriesResponseV1(value: unknown): Db04PbmCountriesResponseV1 {
  const root = record(value, 'DB-04 countries response')
  if (root.schemaVersion !== 1) throw new RangeError(`Unsupported DB-04 catalog response version: ${String(root.schemaVersion)}`)
  const source = parseSource(root.source)
  const countries = array(root.countries, 'countries').map((value) => {
    const row = record(value, 'country')
    return Object.freeze({
      countryKey: text(row.countryKey, 'country.countryKey'),
      sourceId: integer(row.sourceId, 'country.sourceId'),
      name: text(row.name, 'country.name'),
      sourceCode: text(row.sourceCode, 'country.sourceCode'),
      continentId: integer(row.continentId, 'country.continentId'),
      provenance: text(row.provenance, 'country.provenance'),
      confidence: text(row.confidence, 'country.confidence'),
    })
  })
  unique(countries.map((country) => country.countryKey), 'country key')
  unique(countries.map((country) => country.sourceId), 'source country id')
  return Object.freeze({ schemaVersion: 1, source, countries: Object.freeze(countries) })
}

export function parseDb04PbmCompetitionsResponseV1(value: unknown): Db04PbmCompetitionsResponseV1 {
  const root = record(value, 'DB-04 competitions response')
  if (root.schemaVersion !== 1) throw new RangeError(`Unsupported DB-04 catalog response version: ${String(root.schemaVersion)}`)
  const source = parseSource(root.source)
  const competitions = array(root.competitions, 'competitions').map(parseCompetitionSummary)
  unique(competitions.map((competition) => competition.db03CompetitionKey), 'DB-03 competition key')
  return Object.freeze({ schemaVersion: 1, source, competitions: Object.freeze(competitions) })
}

export interface Db04PbmCompetitionSummaryV1 {
  readonly db03CompetitionKey: string
  readonly sourceKey: string
  readonly sourceNativeId: string
  readonly certifiedCompetitionId: string | null
  readonly displayName: string | null
  readonly nativeNameRaw: string | null
  readonly countryKey: string | null
  readonly countryCode: string | null
  readonly sourceSystem: string
  readonly genderRaw: string | null
  readonly genderNormalized: string | null
  readonly ageCategoryRaw: string | null
  readonly levelRaw: string | null
  readonly divisionRaw: string | null
  readonly identityStatus: string
  readonly identityConfidence: string | null
  readonly identityProvenance: string | null
  readonly sourceProvenance: string
  readonly formatStatus: string
  readonly certificationScope: string | null
  readonly availability: 'CERTIFIED_DATA_ONLY' | 'SOURCE_ONLY_UNVERIFIED'
  readonly gameExecutable: false
}

export interface Db04PbmEditionParticipantV1 {
  readonly participantKey: string
  readonly sourceTeamKey: string
  readonly sourceTeamId: number
  readonly sourceCompetitionId: string
  readonly canonicalTeamId: string
  readonly officialTeamName: string
  readonly officialMembershipId: string
  readonly provenance: string
  readonly confidence: string
  readonly status: string
}

export interface Db04PbmEditionV1 {
  readonly editionId: string
  readonly competitionId: string
  readonly seasonLabel: string
  readonly editionStatus: string
  readonly sourceStatus: string
  readonly participantCount: number
  readonly formatVersion: string | null
  readonly formatStatus: string
  readonly certificationScope: string | null
  readonly participants: readonly Db04PbmEditionParticipantV1[]
  readonly formatDocument: WorldCompetitionFormatDocument | null
  readonly stages: readonly unknown[]
  readonly transitions: readonly unknown[]
  readonly sources: readonly unknown[]
  readonly sourceRules: readonly unknown[]
}

export interface Db04PbmTeamV1 {
  readonly sourceTeamKey: string
  readonly sourceTeamId: number
  readonly sourceTable: string
  readonly entityClass: string
  readonly canonicalTeamId: string | null
  readonly displayName: string | null
  readonly officialEditionTeamNames: readonly string[]
  readonly sourceProvenance: string
  readonly countryKey: string | null
  readonly relationStatus: string
  readonly sourceLinkKeys: readonly string[]
  readonly competitionLinkEvidence: readonly unknown[]
}

export interface Db04PbmCompetitionDetailV1 {
  readonly schemaVersion: 1
  readonly source: Db04PbmSourceV1
  readonly competition: Db04PbmCompetitionSummaryV1
  readonly teams: readonly Db04PbmTeamV1[]
  readonly editions: readonly Db04PbmEditionV1[]
  readonly legacyPhases: readonly unknown[]
  readonly groups: readonly unknown[]
  readonly qualificationRelations: readonly unknown[]
  readonly relegationRelations: readonly unknown[]
  readonly missingReferences: readonly unknown[]
  readonly totalUnresolvedInheritedRelationFindings: number
}

export function parseDb04PbmCompetitionDetailV1(value: unknown): Db04PbmCompetitionDetailV1 {
  const root = record(value, 'DB-04 catalog response')
  if (root.schemaVersion !== 1) throw new RangeError(`Unsupported DB-04 catalog response version: ${String(root.schemaVersion)}`)
  const typedSource = parseSource(root.source)
  const competition = parseCompetitionSummary(root.competition)
  const teams = array(root.teams, 'teams').map(parseTeam)
  unique(teams.map((team) => team.sourceTeamKey), 'source team key')
  const editions = array(root.editions, 'editions').map(parseEdition)
  unique(editions.map((edition) => edition.editionId), 'edition id')
  for (const edition of editions) {
    unique(edition.participants.map((participant) => participant.participantKey), `participant key in ${edition.editionId}`)
    unique(edition.participants.map((participant) => participant.sourceTeamId), `source team id in ${edition.editionId}`)
    unique(edition.participants.map((participant) => participant.canonicalTeamId), `canonical team id in ${edition.editionId}`)
  }
  const missingReferences = array(root.missingReferences, 'missingReferences')
  const totalUnresolved = integer(root.totalUnresolvedInheritedRelationFindings, 'totalUnresolvedInheritedRelationFindings')
  return Object.freeze({
    schemaVersion: 1,
    source: Object.freeze(typedSource),
    competition,
    teams: Object.freeze(teams),
    editions: Object.freeze(editions),
    legacyPhases: array(root.legacyPhases, 'legacyPhases'),
    groups: array(root.groups, 'groups'),
    qualificationRelations: array(root.qualificationRelations, 'qualificationRelations'),
    relegationRelations: array(root.relegationRelations, 'relegationRelations'),
    missingReferences: Object.freeze(missingReferences),
    totalUnresolvedInheritedRelationFindings: totalUnresolved,
  })
}

export function toWorldDbCompetitionBundleV1(
  detail: Db04PbmCompetitionDetailV1,
  editionId: string,
): WorldDbCompetitionBundleV1 {
  const edition = detail.editions.find((item) => item.editionId === editionId)
  if (edition === undefined) throw new Error(`Documented DB-04 edition not found: ${editionId}`)
  if (detail.competition.availability !== 'CERTIFIED_DATA_ONLY' || edition.editionStatus !== 'CERTIFIED' || edition.formatStatus !== 'CERTIFIED' || edition.formatDocument === null) {
    throw new Error(`Edition does not have a certified DB-04 format: ${editionId}`)
  }
  if (edition.participants.length !== edition.participantCount) throw new Error(`Edition participant count mismatch for ${editionId}`)
  const realVariants = edition.formatDocument.variants.filter((variant) => variant.isRealVariant)
  if (realVariants.length !== 1) throw new Error(`Expected exactly one real format variant for ${editionId}; found ${realVariants.length}`)
  const variant = realVariants[0]!
  const participantKeys = new Set(edition.participants.map((participant) => participant.sourceTeamKey))
  if (participantKeys.size !== edition.participantCount) throw new Error(`Edition contains duplicate PBM teams: ${editionId}`)
  const bundle: WorldDbCompetitionBundleV1 = {
    schemaVersion: 1,
    source: { databaseId: detail.source.databaseFile, schemaId: 'DB-04' },
    competitionSeason: {
      competitionSeasonId: edition.editionId,
      competitionId: edition.competitionId,
      seasonId: edition.seasonLabel,
      editionNumber: null,
    },
    entries: edition.participants.map((participant) => ({
      competitionSeasonEntryId: participant.participantKey,
      teamId: participant.canonicalTeamId,
    })),
    structureNodes: variant.nodes.map((node, sequenceNo) => ({
      competitionStructureNodeId: node.key,
      nodeType: node.nodeType,
      name: node.name ?? node.key,
      sequenceNo: sequenceNo + 1,
    })),
    structureEdges: variant.edges.map((edge) => ({
      fromNodeId: edge.from,
      toNodeId: edge.to,
      relationshipType: edge.selector,
    })),
    structureEntryAssignments: edition.participants.map((participant) => ({
      competitionStructureNodeId: 'REGULAR',
      competitionSeasonEntryId: participant.participantKey,
      validFrom: null,
      validTo: null,
    })),
    fixtures: [],
    fixtureSides: [],
    rulePayloads: {
      certifiedFormat: [edition.formatDocument as unknown as Readonly<Record<string, unknown>>],
      certifiedSourceRules: edition.sourceRules as readonly Readonly<Record<string, unknown>>[],
    },
  }
  assertWorldDbCompetitionBundleV1(bundle)
  return bundle
}

function parseCompetitionSummary(value: unknown): Db04PbmCompetitionSummaryV1 {
  const row = record(value, 'competition')
  const availability = text(row.availability, 'competition.availability')
  if (availability !== 'CERTIFIED_DATA_ONLY' && availability !== 'SOURCE_ONLY_UNVERIFIED') throw new TypeError(`Unknown competition availability: ${availability}`)
  if (row.gameExecutable !== false) throw new Error('DB-04 catalog data is not certified as game executable')
  return Object.freeze({
    db03CompetitionKey: text(row.db03CompetitionKey, 'competition.db03CompetitionKey'),
    sourceKey: text(row.sourceKey, 'competition.sourceKey'),
    sourceNativeId: text(row.sourceNativeId, 'competition.sourceNativeId'),
    certifiedCompetitionId: nullableText(row.certifiedCompetitionId, 'competition.certifiedCompetitionId'),
    displayName: nullableText(row.displayName, 'competition.displayName'),
    nativeNameRaw: nullableText(row.nativeNameRaw, 'competition.nativeNameRaw'),
    countryKey: nullableText(row.countryKey, 'competition.countryKey'),
    countryCode: nullableText(row.countryCode, 'competition.countryCode'),
    sourceSystem: text(row.sourceSystem, 'competition.sourceSystem'),
    genderRaw: nullableText(row.genderRaw, 'competition.genderRaw'),
    genderNormalized: nullableText(row.genderNormalized, 'competition.genderNormalized'),
    ageCategoryRaw: nullableText(row.ageCategoryRaw, 'competition.ageCategoryRaw'),
    levelRaw: nullableText(row.levelRaw, 'competition.levelRaw'),
    divisionRaw: nullableText(row.divisionRaw, 'competition.divisionRaw'),
    identityStatus: text(row.identityStatus, 'competition.identityStatus'),
    identityConfidence: nullableText(row.identityConfidence, 'competition.identityConfidence'),
    identityProvenance: nullableText(row.identityProvenance, 'competition.identityProvenance'),
    sourceProvenance: text(row.sourceProvenance, 'competition.sourceProvenance'),
    formatStatus: text(row.formatStatus, 'competition.formatStatus'),
    certificationScope: nullableText(row.certificationScope, 'competition.certificationScope'),
    availability,
    gameExecutable: false,
  })
}

function parseSource(value: unknown): Db04PbmSourceV1 {
  const source = record(value, 'DB-04 catalog source')
  return Object.freeze({
    databaseFile: text(source.databaseFile, 'source.databaseFile'),
    catalogLayers: tuple(source.catalogLayers, ['DB-03', 'DB-04'], 'source.catalogLayers'),
  })
}

function parseEdition(value: unknown): Db04PbmEditionV1 {
  const row = record(value, 'edition')
  const rawFormat = row.formatDocument
  const formatDocument = rawFormat === null ? null : parseWorldCompetitionFormatDocument(rawFormat)
  const participants = array(row.participants, 'edition.participants').map((value) => {
    const participant = record(value, 'edition participant')
    return Object.freeze({
      participantKey: text(participant.participantKey, 'participant.participantKey'),
      sourceTeamKey: text(participant.sourceTeamKey, 'participant.sourceTeamKey'),
      sourceTeamId: integer(participant.sourceTeamId, 'participant.sourceTeamId'),
      sourceCompetitionId: text(participant.sourceCompetitionId, 'participant.sourceCompetitionId'),
      canonicalTeamId: text(participant.canonicalTeamId, 'participant.canonicalTeamId'),
      officialTeamName: text(participant.officialTeamName, 'participant.officialTeamName'),
      officialMembershipId: text(participant.officialMembershipId, 'participant.officialMembershipId'),
      provenance: text(participant.provenance, 'participant.provenance'),
      confidence: text(participant.confidence, 'participant.confidence'),
      status: text(participant.status, 'participant.status'),
    })
  })
  const participantCount = integer(row.participantCount, 'edition.participantCount')
  if (participants.length !== participantCount) throw new Error(`Edition ${String(row.editionId)} declares ${participantCount} participants but has ${participants.length}`)
  if (formatDocument !== null && (formatDocument.competitionSeasonId !== row.editionId || formatDocument.competitionId !== row.competitionId)) throw new Error(`Format document identity does not match edition ${String(row.editionId)}`)
  return Object.freeze({
    editionId: text(row.editionId, 'edition.editionId'),
    competitionId: text(row.competitionId, 'edition.competitionId'),
    seasonLabel: text(row.seasonLabel, 'edition.seasonLabel'),
    editionStatus: text(row.editionStatus, 'edition.editionStatus'),
    sourceStatus: text(row.sourceStatus, 'edition.sourceStatus'),
    participantCount,
    formatVersion: nullableText(row.formatVersion, 'edition.formatVersion'),
    formatStatus: text(row.formatStatus, 'edition.formatStatus'),
    certificationScope: nullableText(row.certificationScope, 'edition.certificationScope'),
    participants: Object.freeze(participants),
    formatDocument,
    stages: array(row.stages, 'edition.stages'),
    transitions: array(row.transitions, 'edition.transitions'),
    sources: array(row.sources, 'edition.sources'),
    sourceRules: array(row.sourceRules, 'edition.sourceRules'),
  })
}

function parseTeam(value: unknown): Db04PbmTeamV1 {
  const row = record(value, 'team')
  return Object.freeze({
    sourceTeamKey: text(row.sourceTeamKey, 'team.sourceTeamKey'),
    sourceTeamId: integer(row.sourceTeamId, 'team.sourceTeamId'),
    sourceTable: text(row.sourceTable, 'team.sourceTable'),
    entityClass: text(row.entityClass, 'team.entityClass'),
    canonicalTeamId: nullableText(row.canonicalTeamId, 'team.canonicalTeamId'),
    displayName: nullableText(row.displayName, 'team.displayName'),
    officialEditionTeamNames: array(row.officialEditionTeamNames, 'team.officialEditionTeamNames').map((name) => text(name, 'team edition name')),
    sourceProvenance: text(row.sourceProvenance, 'team.sourceProvenance'),
    countryKey: nullableText(row.countryKey, 'team.countryKey'),
    relationStatus: text(row.relationStatus, 'team.relationStatus'),
    sourceLinkKeys: array(row.sourceLinkKeys, 'team.sourceLinkKeys').map((key) => text(key, 'team source link key')),
    competitionLinkEvidence: array(row.competitionLinkEvidence, 'team.competitionLinkEvidence'),
  })
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`)
  return value as Record<string, unknown>
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  return value
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be non-empty text`)
  return value
}
function nullableText(value: unknown, label: string): string | null {
  if (value === null) return null
  return text(value, label)
}
function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError(`${label} must be an integer`)
  return value
}
function tuple(value: unknown, expected: readonly ['DB-03', 'DB-04'], label: string): readonly ['DB-03', 'DB-04'] {
  if (!Array.isArray(value) || value.length !== 2 || value[0] !== expected[0] || value[1] !== expected[1]) throw new TypeError(`${label} must be DB-03, DB-04`)
  return expected
}
function unique<T extends string | number>(values: readonly T[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`)
}
