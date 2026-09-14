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

export interface WorldCompetitionSeasonSlotRecord {
  readonly id: string
  readonly competitionSeasonId: string
  readonly slotTypeId: string | null
  readonly slotOrder: number | null
}

export interface WorldCompetitionStructureNodeRecord {
  readonly id: string
  readonly competitionSeasonId: string
  readonly nodeType: string
  readonly name: string | null
  readonly sequenceNo: number | null
  readonly specializedType: string | null
  readonly sourceEcosystemUnitId: string | null
}

export interface WorldCompetitionStructureRelationshipRecord {
  readonly id: string
  readonly fromNodeId: string
  readonly toNodeId: string
  readonly relationshipType: string
}

export interface WorldCompetitionStructurePositionRecord {
  readonly id: string
  readonly structureNodeId: string
  readonly positionType: string
  readonly positionOrder: number | null
  readonly label: string | null
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
  readonly sideRole: string
  readonly competitionSeasonEntryId: string | null
  readonly competitionSeasonSlotId: string | null
  readonly sourceStructurePositionId: string | null
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
  readonly seasonSlots: readonly WorldCompetitionSeasonSlotRecord[]
  readonly structureNodes: readonly WorldCompetitionStructureNodeRecord[]
  readonly structureRelationships: readonly WorldCompetitionStructureRelationshipRecord[]
  readonly structurePositions: readonly WorldCompetitionStructurePositionRecord[]
  readonly structureAssignments: readonly WorldCompetitionStructureAssignmentRecord[]
  readonly fixtures: readonly WorldCompetitionFixtureRecord[]
  readonly fixtureSides: readonly WorldCompetitionFixtureSideRecord[]
  readonly rules: readonly WorldCompetitionRuleRecord[]
}

type UnknownRecord = Record<string, unknown>
type IdRecord = { readonly id: string }

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
    competitionAssignments: parseArray(root.competitionAssignments, 'competitionAssignments', parseCompetitionAssignment),
    competitionSeasons: parseArray(root.competitionSeasons, 'competitionSeasons', parseCompetitionSeason),
    seasonEntries: parseArray(root.seasonEntries, 'seasonEntries', parseSeasonEntry),
    seasonSlots: parseArray(root.seasonSlots, 'seasonSlots', parseSeasonSlot),
    structureNodes: parseArray(root.structureNodes, 'structureNodes', parseStructureNode),
    structureRelationships: parseArray(root.structureRelationships, 'structureRelationships', parseStructureRelationship),
    structurePositions: parseArray(root.structurePositions, 'structurePositions', parseStructurePosition),
    structureAssignments: parseArray(root.structureAssignments, 'structureAssignments', parseStructureAssignment),
    fixtures: parseArray(root.fixtures, 'fixtures', parseFixture),
    fixtureSides: parseArray(root.fixtureSides, 'fixtureSides', parseFixtureSide),
    rules: parseArray(root.rules, 'rules', parseRule),
  }

  validateReferences(pack)
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

function parseSeasonSlot(value: unknown, path: string): WorldCompetitionSeasonSlotRecord {
  const row = requireRecord(value, path)
  return {
    id: requireString(row.id, `${path}.id`),
    competitionSeasonId: requireString(row.competitionSeasonId, `${path}.competitionSeasonId`),
    slotTypeId: optionalString(row.slotTypeId, `${path}.slotTypeId`),
    slotOrder: optionalInteger(row.slotOrder, `${path}.slotOrder`),
  }
}

function parseStructureNode(value: unknown, path: string): WorldCompetitionStructureNodeRecord {
  const row = requireRecord(value, path)
  return {
    id: requireString(row.id, `${path}.id`),
    competitionSeasonId: requireString(row.competitionSeasonId, `${path}.competitionSeasonId`),
    nodeType: requireString(row.nodeType, `${path}.nodeType`),
    name: optionalString(row.name, `${path}.name`),
    sequenceNo: optionalInteger(row.sequenceNo, `${path}.sequenceNo`),
    specializedType: optionalString(row.specializedType, `${path}.specializedType`),
    sourceEcosystemUnitId: optionalString(row.sourceEcosystemUnitId, `${path}.sourceEcosystemUnitId`),
  }
}

function parseStructureRelationship(value: unknown, path: string): WorldCompetitionStructureRelationshipRecord {
  const row = requireRecord(value, path)
  return {
    id: requireString(row.id, `${path}.id`),
    fromNodeId: requireString(row.fromNodeId, `${path}.fromNodeId`),
    toNodeId: requireString(row.toNodeId, `${path}.toNodeId`),
    relationshipType: requireString(row.relationshipType, `${path}.relationshipType`),
  }
}

function parseStructurePosition(value: unknown, path: string): WorldCompetitionStructurePositionRecord {
  const row = requireRecord(value, path)
  return {
    id: requireString(row.id, `${path}.id`),
    structureNodeId: requireString(row.structureNodeId, `${path}.structureNodeId`),
    positionType: requireString(row.positionType, `${path}.positionType`),
    positionOrder: optionalInteger(row.positionOrder, `${path}.positionOrder`),
    label: optionalString(row.label, `${path}.label`),
  }
}

function parseStructureAssignment(value: unknown, path: string): WorldCompetitionStructureAssignmentRecord {
  const row = requireRecord(value, path)
  return {
    id: requireString(row.id, `${path}.id`),
    competitionSeasonEntryId: requireString(row.competitionSeasonEntryId, `${path}.competitionSeasonEntryId`),
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
    competitionFixtureId: requireString(row.competitionFixtureId, `${path}.competitionFixtureId`),
    sideRole: requireString(row.sideRole, `${path}.sideRole`),
    competitionSeasonEntryId: optionalString(row.competitionSeasonEntryId, `${path}.competitionSeasonEntryId`),
    competitionSeasonSlotId: optionalString(row.competitionSeasonSlotId, `${path}.competitionSeasonSlotId`),
    sourceStructurePositionId: optionalString(row.sourceStructurePositionId, `${path}.sourceStructurePositionId`),
  }
}

function parseRule(value: unknown, path: string): WorldCompetitionRuleRecord {
  const row = requireRecord(value, path)
  return {
    id: requireString(row.id, `${path}.id`),
    competitionSeasonId: requireString(row.competitionSeasonId, `${path}.competitionSeasonId`),
    scopeStructureNodeId: optionalString(row.scopeStructureNodeId, `${path}.scopeStructureNodeId`),
    category: requireString(row.category, `${path}.category`),
    ruleType: requireString(row.ruleType, `${path}.ruleType`),
    priority: requireInteger(row.priority, `${path}.priority`),
    payload: requireJsonValue(row.payload, `${path}.payload`),
  }
}

function validateReferences(pack: WorldCompetitionPack): void {
  const ecosystemIds = uniqueIds(pack.ecosystems, 'ecosystems')
  const unitIds = uniqueIds(pack.ecosystemUnits, 'ecosystemUnits')
  const competitionIds = uniqueIds(pack.competitions, 'competitions')
  uniqueIds(pack.competitionAssignments, 'competitionAssignments')
  const seasonIds = uniqueIds(pack.competitionSeasons, 'competitionSeasons')
  const entryIds = uniqueIds(pack.seasonEntries, 'seasonEntries')
  const slotIds = uniqueIds(pack.seasonSlots, 'seasonSlots')
  const nodeIds = uniqueIds(pack.structureNodes, 'structureNodes')
  uniqueIds(pack.structureRelationships, 'structureRelationships')
  const positionIds = uniqueIds(pack.structurePositions, 'structurePositions')
  uniqueIds(pack.structureAssignments, 'structureAssignments')
  const fixtureIds = uniqueIds(pack.fixtures, 'fixtures')
  uniqueIds(pack.fixtureSides, 'fixtureSides')
  uniqueIds(pack.rules, 'rules')

  const unitsById = byId(pack.ecosystemUnits)
  const entriesById = byId(pack.seasonEntries)
  const slotsById = byId(pack.seasonSlots)
  const nodesById = byId(pack.structureNodes)
  const positionsById = byId(pack.structurePositions)
  const fixturesById = byId(pack.fixtures)

  for (const unit of pack.ecosystemUnits) {
    requireReference(ecosystemIds, unit.ecosystemId, `ecosystemUnits.${unit.id}.ecosystemId`)
    if (unit.parentUnitId !== null) {
      requireReference(unitIds, unit.parentUnitId, `ecosystemUnits.${unit.id}.parentUnitId`)
      if (unitsById.get(unit.parentUnitId)?.ecosystemId !== unit.ecosystemId) {
        throw new RangeError(`ecosystemUnits.${unit.id}.parentUnitId crosses ecosystems`)
      }
    }
  }

  for (const assignment of pack.competitionAssignments) {
    requireReference(ecosystemIds, assignment.ecosystemId, `competitionAssignments.${assignment.id}.ecosystemId`)
    requireReference(competitionIds, assignment.competitionId, `competitionAssignments.${assignment.id}.competitionId`)
    if (assignment.unitId !== null) {
      requireReference(unitIds, assignment.unitId, `competitionAssignments.${assignment.id}.unitId`)
      if (unitsById.get(assignment.unitId)?.ecosystemId !== assignment.ecosystemId) {
        throw new RangeError(`competitionAssignments.${assignment.id}.unitId crosses ecosystems`)
      }
    }
  }

  for (const season of pack.competitionSeasons) {
    requireReference(competitionIds, season.competitionId, `competitionSeasons.${season.id}.competitionId`)
  }

  for (const entry of pack.seasonEntries) {
    requireReference(seasonIds, entry.competitionSeasonId, `seasonEntries.${entry.id}.competitionSeasonId`)
  }

  for (const slot of pack.seasonSlots) {
    requireReference(seasonIds, slot.competitionSeasonId, `seasonSlots.${slot.id}.competitionSeasonId`)
  }

  for (const node of pack.structureNodes) {
    requireReference(seasonIds, node.competitionSeasonId, `structureNodes.${node.id}.competitionSeasonId`)
    if (node.sourceEcosystemUnitId !== null) {
      requireReference(unitIds, node.sourceEcosystemUnitId, `structureNodes.${node.id}.sourceEcosystemUnitId`)
    }
  }

  for (const relationship of pack.structureRelationships) {
    requireReference(nodeIds, relationship.fromNodeId, `structureRelationships.${relationship.id}.fromNodeId`)
    requireReference(nodeIds, relationship.toNodeId, `structureRelationships.${relationship.id}.toNodeId`)
    const from = nodesById.get(relationship.fromNodeId)
    const to = nodesById.get(relationship.toNodeId)
    if (from?.competitionSeasonId !== to?.competitionSeasonId) {
      throw new RangeError(`structureRelationships.${relationship.id} crosses competition seasons`)
    }
  }

  for (const position of pack.structurePositions) {
    requireReference(nodeIds, position.structureNodeId, `structurePositions.${position.id}.structureNodeId`)
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
      if (nodesById.get(fixture.structureNodeId)?.competitionSeasonId !== fixture.competitionSeasonId) {
        throw new RangeError(`fixtures.${fixture.id}.structureNodeId crosses competition seasons`)
      }
    }
  }

  for (const side of pack.fixtureSides) {
    requireReference(fixtureIds, side.competitionFixtureId, `fixtureSides.${side.id}.competitionFixtureId`)
    const seasonId = fixturesById.get(side.competitionFixtureId)?.competitionSeasonId
    if (side.competitionSeasonEntryId !== null) {
      requireReference(entryIds, side.competitionSeasonEntryId, `fixtureSides.${side.id}.competitionSeasonEntryId`)
      if (entriesById.get(side.competitionSeasonEntryId)?.competitionSeasonId !== seasonId) {
        throw new RangeError(`fixtureSides.${side.id}.competitionSeasonEntryId crosses competition seasons`)
      }
    }
    if (side.competitionSeasonSlotId !== null) {
      requireReference(slotIds, side.competitionSeasonSlotId, `fixtureSides.${side.id}.competitionSeasonSlotId`)
      if (slotsById.get(side.competitionSeasonSlotId)?.competitionSeasonId !== seasonId) {
        throw new RangeError(`fixtureSides.${side.id}.competitionSeasonSlotId crosses competition seasons`)
      }
    }
    if (side.sourceStructurePositionId !== null) {
      requireReference(positionIds, side.sourceStructurePositionId, `fixtureSides.${side.id}.sourceStructurePositionId`)
      const position = positionsById.get(side.sourceStructurePositionId)
      if (nodesById.get(position?.structureNodeId ?? '')?.competitionSeasonId !== seasonId) {
        throw new RangeError(`fixtureSides.${side.id}.sourceStructurePositionId crosses competition seasons`)
      }
    }
  }

  for (const rule of pack.rules) {
    requireReference(seasonIds, rule.competitionSeasonId, `rules.${rule.id}.competitionSeasonId`)
    if (rule.scopeStructureNodeId !== null) {
      requireReference(nodeIds, rule.scopeStructureNodeId, `rules.${rule.id}.scopeStructureNodeId`)
      if (nodesById.get(rule.scopeStructureNodeId)?.competitionSeasonId !== rule.competitionSeasonId) {
        throw new RangeError(`rules.${rule.id}.scopeStructureNodeId crosses competition seasons`)
      }
    }
  }
}

function byId<T extends IdRecord>(rows: readonly T[]): ReadonlyMap<string, T> {
  return new Map(rows.map((row) => [row.id, row]))
}

function uniqueIds(rows: readonly IdRecord[], path: string): Set<string> {
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

function parseArray<T>(value: unknown, path: string, parser: (value: unknown, path: string) => T): readonly T[] {
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

function optionalInteger(value: unknown, path: string): number | null {
  if (value === null || value === undefined) {
    return null
  }
  return requireInteger(value, path)
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
