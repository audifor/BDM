export interface WorldDbSourceRefV1 {
  readonly databaseId: string
  readonly schemaId: string
}

export interface WorldDbCompetitionSeasonV1 {
  readonly competitionSeasonId: string
  readonly competitionId: string
  readonly seasonId: string
  readonly editionNumber: number | null
}

export interface WorldDbCompetitionEntryV1 {
  readonly competitionSeasonEntryId: string
  readonly teamId: string | null
}

export interface WorldDbStructureNodeV1 {
  readonly competitionStructureNodeId: string
  readonly nodeType: string
  readonly name: string | null
  readonly sequenceNo: number | null
  /** Canonical subtype projected from the node-specific B04 table when available. */
  readonly specializedType?: string | null
}

export interface WorldDbStructurePositionV1 {
  readonly competitionStructurePositionId: string
  readonly competitionStructureNodeId: string
  readonly positionType: string
  readonly positionOrder: number | null
  readonly label: string | null
}

export interface WorldDbStructureEdgeV1 {
  readonly fromNodeId: string
  readonly toNodeId: string
  readonly relationshipType: string
}

export interface WorldDbStructureEntryAssignmentV1 {
  readonly competitionStructureNodeId: string
  readonly competitionSeasonEntryId: string
  readonly validFrom: string | null
  readonly validTo: string | null
}

export interface WorldDbFixtureV1 {
  readonly competitionFixtureId: string
  readonly structureNodeId: string | null
  readonly matchdayId: string | null
  readonly fixtureOrder: number | null
}

export interface WorldDbFixtureSideV1 {
  readonly competitionFixtureSideId: string
  readonly competitionFixtureId: string
  readonly sideRole: string
  readonly competitionSeasonEntryId: string | null
  readonly competitionSeasonSlotId: string | null
  readonly sourceStructurePositionId: string | null
}

export interface WorldDbScheduleBlockV1 {
  readonly competitionScheduleBlockId: string
  readonly blockType: string
  readonly name: string | null
  readonly startDate: string | null
  readonly endDate: string | null
}

export interface WorldDbScheduleSessionV1 {
  readonly competitionScheduleSessionId: string
  readonly competitionScheduleBlockId: string
  readonly name: string | null
  readonly sessionOrder: number | null
}

export interface WorldDbScheduleSlotV1 {
  readonly competitionScheduleSlotId: string
  readonly scheduleBlockId: string | null
  readonly scheduleSessionId: string | null
  readonly slotOrder: number | null
}

export interface WorldDbScheduleSlotTimingV1 {
  readonly competitionScheduleSlotTimingHistoryId: string
  readonly competitionScheduleSlotId: string
  readonly timingState: string
  readonly localDate: string | null
  readonly localTime: string | null
  readonly timeZone: string | null
  readonly validFrom: string | null
  readonly validTo: string | null
}

export interface WorldDbFixtureScheduleAllocationV1 {
  readonly competitionFixtureScheduleAllocationId: string
  readonly competitionFixtureId: string
  readonly competitionScheduleSlotId: string
  readonly status: string
  readonly validFrom: string | null
  readonly validTo: string | null
}

export interface WorldDbCompetitionBundleV1 {
  readonly schemaVersion: 1
  readonly source: WorldDbSourceRefV1
  readonly competitionSeason: WorldDbCompetitionSeasonV1
  readonly entries: readonly WorldDbCompetitionEntryV1[]
  readonly structureNodes: readonly WorldDbStructureNodeV1[]
  /** Added additively within v1 so older in-memory fixtures remain valid. */
  readonly structurePositions?: readonly WorldDbStructurePositionV1[]
  readonly structureEdges: readonly WorldDbStructureEdgeV1[]
  readonly structureEntryAssignments: readonly WorldDbStructureEntryAssignmentV1[]
  readonly fixtures: readonly WorldDbFixtureV1[]
  readonly fixtureSides: readonly WorldDbFixtureSideV1[]
  /** Canonical B04 scheduling rows. Optional so persisted/test v1 bundles remain backward compatible. */
  readonly scheduleBlocks?: readonly WorldDbScheduleBlockV1[]
  readonly scheduleSessions?: readonly WorldDbScheduleSessionV1[]
  readonly scheduleSlots?: readonly WorldDbScheduleSlotV1[]
  readonly scheduleSlotTimings?: readonly WorldDbScheduleSlotTimingV1[]
  readonly fixtureScheduleAllocations?: readonly WorldDbFixtureScheduleAllocationV1[]
  readonly rulePayloads: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>
}

export function assertWorldDbCompetitionBundleV1(value: unknown): asserts value is WorldDbCompetitionBundleV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new TypeError('Unsupported World DB competition bundle version')
  requireRecord(value.source, 'World DB source')
  requireText(value.source.databaseId, 'World DB databaseId')
  requireText(value.source.schemaId, 'World DB schemaId')
  requireRecord(value.competitionSeason, 'World DB competition season')
  requireText(value.competitionSeason.competitionSeasonId, 'World DB competitionSeasonId')
  requireText(value.competitionSeason.competitionId, 'World DB competitionId')
  requireText(value.competitionSeason.seasonId, 'World DB seasonId')
  requireArray(value.entries, 'World DB entries')
  requireArray(value.structureNodes, 'World DB structure nodes')
  if (value.structurePositions !== undefined) requireArray(value.structurePositions, 'World DB structure positions')
  requireArray(value.structureEdges, 'World DB structure edges')
  requireArray(value.structureEntryAssignments, 'World DB structure entry assignments')
  requireArray(value.fixtures, 'World DB fixtures')
  requireArray(value.fixtureSides, 'World DB fixture sides')
  if (value.scheduleBlocks !== undefined) requireArray(value.scheduleBlocks, 'World DB schedule blocks')
  if (value.scheduleSessions !== undefined) requireArray(value.scheduleSessions, 'World DB schedule sessions')
  if (value.scheduleSlots !== undefined) requireArray(value.scheduleSlots, 'World DB schedule slots')
  if (value.scheduleSlotTimings !== undefined) requireArray(value.scheduleSlotTimings, 'World DB schedule slot timings')
  if (value.fixtureScheduleAllocations !== undefined) requireArray(value.fixtureScheduleAllocations, 'World DB fixture schedule allocations')
  requireRecord(value.rulePayloads, 'World DB rule payloads')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`)
}

function requireArray(value: unknown, label: string): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
}

function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`)
}
