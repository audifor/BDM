import type {
  WorldDbCompetitionBundleV1,
  WorldDbFixtureScheduleAllocationV1,
  WorldDbScheduleSlotTimingV1,
  WorldDbScheduleSlotV1,
} from '@/domain/worldDb/CompetitionBundle'

export interface WorldDbResolvedScheduleTimingV1 {
  readonly timingHistoryId: string
  readonly timingState: string
  readonly localDate: string | null
  readonly localTime: string | null
  readonly timeZone: string | null
}

export interface WorldDbResolvedFixtureScheduleV1 {
  readonly competitionFixtureId: string
  readonly allocationId: string
  readonly allocationStatus: string
  readonly competitionScheduleSlotId: string
  readonly slotOrder: number | null
  readonly scheduleBlockId: string | null
  readonly scheduleSessionId: string | null
  readonly timing: WorldDbResolvedScheduleTimingV1 | null
}

/** Resolves canonical B04 scheduling at one point in time without interpreting status vocabularies. */
export function resolveWorldDbFixtureSchedulesAtV1(
  bundle: WorldDbCompetitionBundleV1,
  asOf: string,
): Readonly<Record<string, WorldDbResolvedFixtureScheduleV1 | null>> {
  const asOfMs = parseTemporal(asOf, 'asOf')
  const fixtures = uniqueIndex(bundle.fixtures, (row) => row.competitionFixtureId, 'competition fixture')
  const slots = uniqueIndex(bundle.scheduleSlots ?? [], (row) => row.competitionScheduleSlotId, 'competition schedule slot')
  const blocks = uniqueIndex(bundle.scheduleBlocks ?? [], (row) => row.competitionScheduleBlockId, 'competition schedule block')
  const sessions = uniqueIndex(bundle.scheduleSessions ?? [], (row) => row.competitionScheduleSessionId, 'competition schedule session')

  for (const slot of slots.values()) validateSlotReferences(slot, blocks, sessions)

  const allocationsByFixture = groupBy(bundle.fixtureScheduleAllocations ?? [], (row) => row.competitionFixtureId)
  const timingsBySlot = groupBy(bundle.scheduleSlotTimings ?? [], (row) => row.competitionScheduleSlotId)
  const output: Record<string, WorldDbResolvedFixtureScheduleV1 | null> = {}

  for (const fixtureId of [...fixtures.keys()].sort()) {
    const activeAllocations = (allocationsByFixture.get(fixtureId) ?? []).filter((row) => isActiveAt(row.validFrom, row.validTo, asOfMs, `allocation ${row.competitionFixtureScheduleAllocationId}`))
    if (activeAllocations.length > 1) throw new Error(`Fixture ${fixtureId} has multiple active schedule allocations at ${asOf}`)
    if (activeAllocations.length === 0) {
      output[fixtureId] = null
      continue
    }

    const allocation = activeAllocations[0]!
    const slot = slots.get(allocation.competitionScheduleSlotId)
    if (slot === undefined) throw new Error(`Fixture allocation ${allocation.competitionFixtureScheduleAllocationId} references unknown schedule slot ${allocation.competitionScheduleSlotId}`)

    const activeTimings = (timingsBySlot.get(slot.competitionScheduleSlotId) ?? []).filter((row) => isActiveAt(row.validFrom, row.validTo, asOfMs, `timing ${row.competitionScheduleSlotTimingHistoryId}`))
    if (activeTimings.length > 1) throw new Error(`Schedule slot ${slot.competitionScheduleSlotId} has multiple active timings at ${asOf}`)

    output[fixtureId] = Object.freeze({
      competitionFixtureId: fixtureId,
      allocationId: allocation.competitionFixtureScheduleAllocationId,
      allocationStatus: allocation.status,
      competitionScheduleSlotId: slot.competitionScheduleSlotId,
      slotOrder: slot.slotOrder,
      scheduleBlockId: slot.scheduleBlockId,
      scheduleSessionId: slot.scheduleSessionId,
      timing: activeTimings.length === 0 ? null : freezeTiming(activeTimings[0]!),
    })
  }

  for (const fixtureId of allocationsByFixture.keys()) {
    if (!fixtures.has(fixtureId)) throw new Error(`Schedule allocation references unknown competition fixture ${fixtureId}`)
  }
  for (const slotId of timingsBySlot.keys()) {
    if (!slots.has(slotId)) throw new Error(`Schedule timing references unknown schedule slot ${slotId}`)
  }

  return Object.freeze(output)
}

export function listWorldDbFixturesScheduledOnLocalDateV1(
  resolved: Readonly<Record<string, WorldDbResolvedFixtureScheduleV1 | null>>,
  localDate: string,
): readonly WorldDbResolvedFixtureScheduleV1[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw new TypeError(`localDate must be YYYY-MM-DD: ${localDate}`)
  return Object.freeze(Object.values(resolved)
    .filter((row): row is WorldDbResolvedFixtureScheduleV1 => row !== null && row.timing?.localDate === localDate)
    .sort((left, right) => compareScheduledFixtures(left, right)))
}

function freezeTiming(row: WorldDbScheduleSlotTimingV1): WorldDbResolvedScheduleTimingV1 {
  return Object.freeze({
    timingHistoryId: row.competitionScheduleSlotTimingHistoryId,
    timingState: row.timingState,
    localDate: row.localDate,
    localTime: row.localTime,
    timeZone: row.timeZone,
  })
}

function validateSlotReferences(slot: WorldDbScheduleSlotV1, blocks: ReadonlyMap<string, unknown>, sessions: ReadonlyMap<string, unknown>): void {
  if (slot.scheduleBlockId !== null && !blocks.has(slot.scheduleBlockId)) {
    throw new Error(`Schedule slot ${slot.competitionScheduleSlotId} references unknown block ${slot.scheduleBlockId}`)
  }
  if (slot.scheduleSessionId !== null && !sessions.has(slot.scheduleSessionId)) {
    throw new Error(`Schedule slot ${slot.competitionScheduleSlotId} references unknown session ${slot.scheduleSessionId}`)
  }
}

function isActiveAt(validFrom: string | null, validTo: string | null, asOfMs: number, label: string): boolean {
  const fromMs = validFrom === null ? Number.NEGATIVE_INFINITY : parseTemporal(validFrom, `${label} validFrom`)
  const toMs = validTo === null ? Number.POSITIVE_INFINITY : parseTemporal(validTo, `${label} validTo`)
  if (fromMs >= toMs) throw new Error(`${label} has invalid validity interval`)
  return fromMs <= asOfMs && asOfMs < toMs
}

function parseTemporal(value: string, label: string): number {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be a non-empty date/time string`)
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new TypeError(`${label} is not a parseable date/time: ${value}`)
  return parsed
}

function uniqueIndex<T>(rows: readonly T[], keyOf: (row: T) => string, label: string): ReadonlyMap<string, T> {
  const result = new Map<string, T>()
  for (const row of rows) {
    const key = keyOf(row)
    if (result.has(key)) throw new Error(`Duplicate ${label} id: ${key}`)
    result.set(key, row)
  }
  return result
}

function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string): ReadonlyMap<string, readonly T[]> {
  const mutable = new Map<string, T[]>()
  for (const row of rows) {
    const key = keyOf(row)
    const values = mutable.get(key) ?? []
    values.push(row)
    mutable.set(key, values)
  }
  return mutable
}

function compareScheduledFixtures(left: WorldDbResolvedFixtureScheduleV1, right: WorldDbResolvedFixtureScheduleV1): number {
  const leftTime = left.timing?.localTime ?? '99:99:99'
  const rightTime = right.timing?.localTime ?? '99:99:99'
  if (leftTime !== rightTime) return leftTime.localeCompare(rightTime)
  const leftOrder = left.slotOrder ?? Number.MAX_SAFE_INTEGER
  const rightOrder = right.slotOrder ?? Number.MAX_SAFE_INTEGER
  if (leftOrder !== rightOrder) return leftOrder - rightOrder
  return left.competitionFixtureId.localeCompare(right.competitionFixtureId)
}
