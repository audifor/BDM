export const WORLD_COMPETITION_PACK_SCHEMA_VERSION = '1.0' as const

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export interface WorldCompetitionEcosystemRecord {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly gender: string | null
}

export interface WorldCompetitionEcosystemUnitRecord {
  readonly id: string
  readonly ecosystemId: string
  readonly parentUnitId: string | null
  readonly levelId: string | null
  readonly unitType: string
  readonly code: string
  readonly name: string
}

export interface WorldCompetitionRecord {
  readonly id: string
  readonly name: string
}

export interface WorldCompetitionAssignmentRecord {
  readonly id: string
  readonly ecosystemId: string
  readonly competitionId: string
  readonly levelId: string | null
  readonly unitId: string | null
  readonly roleType: string
}

export interface WorldCompetitionSeasonRecord {
  readonly id: string
  readonly competitionId: string
  readonly seasonId: string
  readonly startDate: string | null
  readonly endDate: string | null
}

export interface WorldCompetitionSeasonEntryRecord {
  readonly id: string
  readonly competitionSeasonId: string
  readonly teamId: string
}

export interface WorldCompetitionStructureNodeRecord {
  readonly id: string
  readonly competitionSeasonId: string
  readonly parentNodeId: string | null
  readonly nodeType: string
  readonly role: string | null
  readonly name: string | null
  readonly sourceEcosystemUnitId: string | null
}

export interface WorldCompetitionStructureAssignmentRecord {
  readonly id: string
  readonly competitionSeasonEntryId: string
  readonly structureNodeId: string
}

export interface WorldCompetitionFixtureRecord {
  readonly id: string
  readonly competitionSeasonId: string
  readonly structureNodeId: string | null
  readonly status: string | null
  readonly scheduledDate: string | null
}

export interface WorldCompetitionFixtureSideRecord {
  readonly id: string
  readonly competitionFixtureId: string
  readonly side: string
  readonly teamId: string | null
  readonly sourceStructureNodeId: string | null
}

export interface WorldCompetitionRuleRecord {
  readonly id: string
  readonly competitionSeasonId: string
  readonly scopeStructureNodeId: string | null
  readonly category: string
  readonly ruleType: string
  readonly priority: number
  readonly payload: JsonValue
}

export interface WorldCompetitionPack {
  readonly schemaVersion: typeof WORLD_COMPETITION_PACK_SCHEMA_VERSION
  readonly sourceRevision: string
  readonly ecosystems: readonly WorldCompetitionEcosystemRecord[]
  readonly ecosystemUnits: readonly WorldCompetitionEcosystemUnitRecord[]
  readonly competitions: readonly WorldCompetitionRecord[]
  readonly competitionAssignments: readonly WorldCompetitionAssignmentRecord[]
  readonly competitionSeasons: readonly WorldCompetitionSeasonRecord[]
  readonly seasonEntries: readonly WorldCompetitionSeasonEntryRecord[]
  readonly structureNodes: readonly WorldCompetitionStructureNodeRecord[]
  readonly structureAssignments: readonly WorldCompetitionStructureAssignmentRecord[]
  readonly fixtures: readonly WorldCompetitionFixtureRecord[]
  readonly fixtureSides: readonly WorldCompetitionFixtureSideRecord[]
  readonly rules: readonly WorldCompetitionRuleRecord[]
}

type UnknownRecord = Record<string, unknown>

export function parseWorldCompetitionPack(input: unknown): WorldCompetitionPack {
  const root = requireRecord(input, 'World competition pack')
  const schemaVersion = requireString(root.schemaVersion, 'schemaVersion')
  if (schemaVersion !== WORLD_COMPETITION_PACK_SCHEMA_VERSION) {
    throw new RangeError(`Unsupported world competition pack schema version: ${schemaVersion}`)
  }

  const pack: WorldCompetitionPack = {
    schemaVersion: WORLD_COMPETITION_PACK_SCHEMA_VERSION,
    sourceRevision: requireString(root.sourceRevision, 'sourceRevision'),
    ecosystems: parseArray(root.ecosystems, 'ecosystems', parseEcosystem),
    ecosystemUnits: parseArray(root.ecosystemUnits, 'ecosystemUnits', parseEcosystemUnit),
    competitions: parseArray(root.competitions, 'competitions', parseCompetition),
    competitionAssignments: parseArray(
      root.competitionAssignments,
      'competitionAssignments',
      parseCompetitionAssignment,
    ),
    competitionSeasons: parseArray(root.competitionSeasons, 'competitionSeasons', parseCompetitionSeason),
    seasonEntries: parseArray(root.seasonEntries, 'seasonEntries', parseSeasonEntry),
    structureNodes: parseArray(root.structureNodes, 'structureNodes', parseStructureNode),
    structureAssignments: parseArray(
      root.structureAssignments,
      'structureAssignments',
      parseStructureAssignment,
    ),
    fixtures: parseArray(root.fixtures, 'fixtures', parseFixture),
    fixtureSides: parseArray(root.fixtureSides, 'fixtureSides', parseFixtureSide),
    rules: parseArray(root.rules, 'rules', parseRule),
  }

  validateWorldCompetitionPackReferences(pack)
  return pack
}

function parseEcosystem(value: unknown, path: string): WorldCompetitionEcosystemRecord {
  const row = requireRecord(value, path)
  return {
    id: requireString(row.id, `${path}.id`),
    code: requireString(row.code, `${path}.code`),
    name: requireString(row.name, `${path}.name`),
    gender: optionalString(row.gender, `${path}.gender`),
  }
}

function parseEcosystemUnit(value: unknown, path: string): WorldCompetitionEcosystemUnitRecord {
  const row = requireRecord(value, path)
  return {
    id: requireString(row.id, `${path}.id`),
    ecosystemId: requireString(row.ecosystemId, `${path}.ecosystemId`),
    parentUnitId: optionalString(row.parentUnitId, `${path}.parentUnitId`),
    levelId: optionalString(row.levelId, `${path}.levelId`),
    unitType: requireString(row.unitType, `${path}.unitType`),
    code: requireString(row.code, `${path}.code`),
    name: requireString(row.name, `${path}.name`),
  }
}

function parseCompetition(value: unknown, path: string): WorldCompetitionRecord {
  const row = requireRecord(value, path)
  return {
    id: requireString(row.id, `${path}.id`),
    name: requireString(row.name, `${path}.name`),
  }
}

function parseCompetitionAssignment(value: unknown, path: string): WorldCompetitionAssignmentRecord {
  const row = requireRecord(value, path)
  return {
    id: requireString(row.id, `${path}.id`),
    ecosystemId: requireString(row.ecosystemId, `${path}.ecosystemId`),
    competitionId: requireString(row.competitionId, `${path}.competitionId`),
    levelId: optionalString(row.levelId, `${path}.levelId`),
    unitId: optionalString(row.unitId, `${path}.unitId`),
    roleType: requireString(row.roleType, `${path}.roleType`),
  }
}

function parseCompetitionSeason(value: unknown, path: string): WorldCompetitionSeasonRecord {
  const row = requireRecord(value, path)
  return {
    id: requireString(row.id, `${path}.id`),
    competitionId: requireString(row.competitionId, `${path}.competitionId`),
    seasonId: requireString(row.seasonId, `${path}.seasonId`),
    startDate: optionalString(row.startDate, `${path}.startDate`),
    endDate: optionalString(row.endDate, `${path}.endDate`),
  }
}

function parseSeasonEntry(value: unknown, path: string): WorldCompetitionSeasonEntryRecord {
  const row = requireRecord(value, path)
  return {
    id: requireString(row.id, `${path}.id`),
    competitionSeasonId: requireString(row.competitionSeasonId, `${path}.competitionSeasonId`),
    teamId: requireString(row.teamId, `${path}.teamId`),
  }
}

function parseStructureNode(value: unknown, path: string): WorldCompetitionStructureNodeRecord {
  const row = requireRecord(value, path)
  return {
    id: requireString(row.id, `${path}.id`),
    competitionSeasonId: requireString(row.competitionSeasonId, `${path}.competitionSeasonId`),
    parentNodeId: optionalString(row.parentNodeId, `${path}.parentNodeId`),
    nodeType: requireString(row.nodeType, `${path}.nodeType`),
    role: optionalString(row.role, `${path}.role`),
    name: optionalString(row.name, `${path}.name`),
    sourceEcosystemUnitId: optionalString(
      row.sourceEcosystemUnitId,
      `${path}.sourceEcosystemUnitId`,
    ),
  }
}

function parseStructureAssignment(
  value: unknown,
  path: string,
): WorldCompetitionStructureAssignmentRecord {
  const row = requireRecord(value, path)
  return {
    id: requireString(row.id, `${path}.id`),
    competitionSeasonEntryId: requireString(
      row.competitionSeasonEntryId,
      `${path}.competitionSeasonEntryId`,
    ),
    structureNodeId: requireString(row.structureNodeId, `${path}.structureNodeId`),
  }
}

function parseFixture(value: unknown, path: string): WorldCompetitionFixtureRecord {
  const row = requireRecord(value, path)
  return {
    id: requireString(row.id, `${path}.id`),
    competitionSeasonId: requireString(row.competitionSeasonId, `${path}.competitionSeasonId`),
    structureNodeId: optionalString(row.structureNodeId, `${path}.structureNodeId`),
    status: optionalString(row.status, `${path}.status`),
    scheduledDate: optionalString(row.scheduledDate, `${path}.scheduledDate`),
  }
}

function parseFixtureSide(value: unknown, path: string): WorldCompetitionFixtureSideRecord {
  const row = requireRecord(value, path)
  return {
    id: requireString(row.id, `${path}.id`),
    competitionFixtureId: requireString(
      row.competitionFixtureId,
      `${path}.competitionFixtureId`,
    ),
    side: requireString(row.side, `${path}.side`),
    teamId: optionalString(row.teamId, `${path}.teamId`),
    sourceStructureNodeId: optionalString(
      row.sourceStructureNodeId,
      `${path}.sourceStructureNodeId`,
    ),
  }
}

function parseRule(value: unknown, path: string): WorldCompetitionRuleRecord {
  const row = requireRecord(value, path)
  return {
    id: requireString(row.id, `${path}.id`),
    competitionSeasonId: requireString(row.competitionSeasonId, `${path}.competitionSeasonId`),
    scopeStructureNodeId: optionalString(
      row.scopeStructureNodeId,
      `${path}.scopeStructureNodeId`,
    ),
    category: requireString(row.category, `${path}.category`),
    ruleType: requireString(row.ruleType, `${path}.ruleType`),
    priority: requireInteger(row.priority, `${path}.priority`),
    payload: requireJsonValue(row.payload, `${path}.payload`),
  }
}

function validateWorldCompetitionPackReferences(pack: WorldCompetitionPack): void {
  const ecosystemIds = uniqueIds(pack.ecosystems, 'ecosystems')
  const unitIds = uniqueIds(pack.ecosystemUnits, 'ecosystemUnits')
  const competitionIds = uniqueIds(pack.competitions, 'competitions')
  uniqueIds(pack.competitionAssignments, 'competitionAssignments')
  const seasonIds = uniqueIds(pack.competitionSeasons, 'competitionSeasons')
  const entryIds = uniqueIds(pack.seasonEntries, 'seasonEntries')
  const nodeIds = uniqueIds(pack.structureNodes, 'structureNodes')
  uniqueIds(pack.structureAssignments, 'structureAssignments')
  const fixtureIds = uniqueIds(pack.fixtures, 'fixtures')
  uniqueIds(pack.fixtureSides, 'fixtureSides')
  uniqueIds(pack.rules, 'rules')

  for (const unit of pack.ecosystemUnits) {
    requireReference(ecosystemIds, unit.ecosystemId, `ecosystemUnits.${unit.id}.ecosystemId`)
    if (unit.parentUnitId !== null) {
      requireReference(unitIds, unit.parentUnitId, `ecosystemUnits.${unit.id}.parentUnitId`)
    }
  }

  for (const assignment of pack.competitionAssignments) {
    requireReference(ecosystemIds, assignment.ecosystemId, `competitionAssignments.${assignment.id}.ecosystemId`)
    requireReference(competitionIds, assignment.competitionId, `competitionAssignments.${assignment.id}.competitionId`)
    if (assignment.unitId !== null) {
      requireReference(unitIds, assignment.unitId, `competitionAssignments.${assignment.id}.unitId`)
    }
  }

  const seasonsById = new Map(pack.competitionSeasons.map((season) => [season.id, season]))
  for (const season of pack.competitionSeasons) {
    requireReference(competitionIds, season.competitionId, `competitionSeasons.${season.id}.competitionId`)
  }

  const entriesById = new Map(pack.seasonEntries.map((entry) => [entry.id, entry]))
  for (const entry of pack.seasonEntries) {
    requireReference(seasonIds, entry.competitionSeasonId, `seasonEntries.${entry.id}.competitionSeasonId`)
  }

  const nodesById = new Map(pack.structureNodes.map((node) => [node.id, node]))
  for (const node of pack.structureNodes) {
    requireReference(seasonIds, node.competitionSeasonId, `structureNodes.${node.id}.competitionSeasonId`)
    if (node.parentNodeId !== null) {
      requireReference(nodeIds, node.parentNodeId, `structureNodes.${node.id}.parentNodeId`)
      const parent = nodesById.get(node.parentNodeId)
      if (parent?.competitionSeasonId !== node.competitionSeasonId) {
        throw new RangeError(`structureNodes.${node.id}.parentNodeId crosses competition seasons`)
      }
    }
    if (node.sourceEcosystemUnitId !== null) {
      requireReference(unitIds, node.sourceEcosystemUnitId, `structureNodes.${node.id}.sourceEcosystemUnitId`)
    }
  }

  for (const assignment of pack.structureAssignments) {
    requireReference(entryIds, assignment.competitionSeasonEntryId, `structureAssignments.${assignment.id}.competitionSeasonEntryId`)
    requireReference(nodeIds, assignment.structureNodeId, `structureAssignments.${assignment.id}.structureNodeId`)
    const entry = entriesById.get(assignment.competitionSeasonEntryId)
    const node = nodesById.get(assignment.structureNodeId)
    if (entry?.competitionSeasonId !== node?.competitionSeasonId) {
      throw new RangeError(`structureAssignments.${assignment.id} crosses competition seasons`)
    }
  }

  for (const fixture of pack.fixtures) {
    requireReference(seasonIds, fixture.competitionSeasonId, `fixtures.${fixture.id}.competitionSeasonId`)
    if (fixture.structureNodeId !== null) {
      requireReference(nodeIds, fixture.structureNodeId, `fixtures.${fixture.id}.structureNodeId`)
      const node = nodesById.get(fixture.structureNodeId)
      if (node?.competitionSeasonId !== fixture.competitionSeasonId) {
        throw new RangeError(`fixtures.${fixture.id}.structureNodeId crosses competition seasons`)
      }
    }
  }

  for (const side of pack.fixtureSides) {
    requireReference(fixtureIds, side.competitionFixtureId, `fixtureSides.${side.id}.competitionFixtureId`)
    if (side.sourceStructureNodeId !== null) {
      requireReference(nodeIds, side.sourceStructureNodeId, `fixtureSides.${side.id}.sourceStructureNodeId`)
    }
  }

  for (const rule of pack.rules) {
    requireReference(seasonIds, rule.competitionSeasonId, `rules.${rule.id}.competitionSeasonId`)
    if (rule.scopeStructureNodeId !== null) {
      requireReference(nodeIds, rule.scopeStructureNodeId, `rules.${rule.id}.scopeStructureNodeId`)
      const node = nodesById.get(rule.scopeStructureNodeId)
      if (node?.competitionSeasonId !== rule.competitionSeasonId) {
        throw new RangeError(`rules.${rule.id}.scopeStructureNodeId crosses competition seasons`)
      }
    }
  }

  for (const seasonId of seasonsById.keys()) {
    requireReference(seasonIds, seasonId, `competitionSeasons.${seasonId}.id`)
  }
}

function uniqueIds(rows: readonly { readonly id: string }[], path: string): Set<string> {
  const ids = new Set<string>()
  for (const row of rows) {
    if (ids.has(row.id)) {
      throw new RangeError(`${path} contains duplicate id: ${row.id}`)
    }
    ids.add(row.id)
  }
  return ids
}

function requireReference(ids: ReadonlySet<string>, id: string, path: string): void {
  if (!ids.has(id)) {
    throw new RangeError(`${path} references missing id: ${id}`)
  }
}

function parseArray<T>(
  value: unknown,
  path: string,
  parser: (value: unknown, path: string) => T,
): readonly T[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array`)
  }
  return value.map((item, index) => parser(item, `${path}[${index}]`))
}

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`)
  }
  return value as UnknownRecord
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`)
  }
  return value
}

function optionalString(value: unknown, path: string): string | null {
  if (value === null || value === undefined) {
    return null
  }
  return requireString(value, path)
}

function requireInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`${path} must be an integer`)
  }
  return value
}

function requireJsonValue(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} must contain only finite JSON numbers`)
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => requireJsonValue(item, `${path}[${index}]`))
  }
  const object = requireRecord(value, path)
  const output: Record<string, JsonValue> = {}
  for (const [key, item] of Object.entries(object)) {
    output[key] = requireJsonValue(item, `${path}.${key}`)
  }
  return output
}
