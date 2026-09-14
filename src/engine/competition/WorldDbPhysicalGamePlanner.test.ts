import { describe, expect, it } from 'vitest'
import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import type { WorldDbMatchRealizationBundleV1 } from '@/domain/worldDb/MatchRealizationBundle'
import { planWorldDbPhysicalGamesV1, type WorldDbCompetitionPlanningContextV1 } from './WorldDbPhysicalGamePlanner'

interface BundleOptions {
  readonly competitionSeasonId: string
  readonly competitionId: string
  readonly fixtureId: string
  readonly nodeId: string
  readonly localDate?: string
  readonly homeEntryId?: string | null
  readonly awayEntryId?: string | null
  readonly homePositionId?: string | null
  readonly awayPositionId?: string | null
  readonly sharedCompetitionSeasonId?: string
  readonly physicalMatchContext?: string
}

function bundle(options: BundleOptions): WorldDbCompetitionBundleV1 {
  const homeEntryId = options.homeEntryId === undefined ? `${options.competitionSeasonId}:entry:home` : options.homeEntryId
  const awayEntryId = options.awayEntryId === undefined ? `${options.competitionSeasonId}:entry:away` : options.awayEntryId
  const entries = [
    { competitionSeasonEntryId: `${options.competitionSeasonId}:entry:home`, teamId: 'team:home' },
    { competitionSeasonEntryId: `${options.competitionSeasonId}:entry:away`, teamId: 'team:away' },
  ] as const
  const positions = [options.homePositionId, options.awayPositionId]
    .filter((value): value is string => typeof value === 'string')
    .map((positionId, index) => ({ competitionStructurePositionId: positionId, competitionStructureNodeId: options.nodeId, positionType: 'BRACKET_SLOT', positionOrder: index + 1, label: null }))
  const rulePayloads: Record<string, readonly Readonly<Record<string, unknown>>[]> = {}
  if (options.sharedCompetitionSeasonId !== undefined) {
    rulePayloads.entrySelectionCriteria = [{ id: `${options.competitionSeasonId}:sharing`, payload: { shared_competition_season_id: options.sharedCompetitionSeasonId } }]
  }
  if (options.physicalMatchContext !== undefined) {
    rulePayloads.pairing = [{ id: `${options.competitionSeasonId}:pairing`, scopeStructureNodeId: options.nodeId, payload: { physical_match_context: options.physicalMatchContext } }]
  }

  return Object.freeze({
    schemaVersion: 1,
    source: Object.freeze({ databaseId: 'world.db', schemaId: 'DDL-PHASE1-A' }),
    competitionSeason: Object.freeze({ competitionSeasonId: options.competitionSeasonId, competitionId: options.competitionId, seasonId: 'season:2026', editionNumber: 1 }),
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
    structureNodes: Object.freeze([{ competitionStructureNodeId: options.nodeId, nodeType: 'ROUND', name: null, sequenceNo: 1 }]),
    structurePositions: Object.freeze(positions.map((position) => Object.freeze(position))),
    structureEdges: Object.freeze([]),
    structureEntryAssignments: Object.freeze([]),
    fixtures: Object.freeze([{ competitionFixtureId: options.fixtureId, structureNodeId: options.nodeId, matchdayId: null, fixtureOrder: 1 }]),
    fixtureSides: Object.freeze([
      Object.freeze({ competitionFixtureSideId: `${options.fixtureId}:home`, competitionFixtureId: options.fixtureId, sideRole: 'HOME', competitionSeasonEntryId: homeEntryId, competitionSeasonSlotId: null, sourceStructurePositionId: options.homePositionId ?? null }),
      Object.freeze({ competitionFixtureSideId: `${options.fixtureId}:away`, competitionFixtureId: options.fixtureId, sideRole: 'AWAY', competitionSeasonEntryId: awayEntryId, competitionSeasonSlotId: null, sourceStructurePositionId: options.awayPositionId ?? null }),
    ]),
    scheduleBlocks: Object.freeze([]),
    scheduleSessions: Object.freeze([]),
    scheduleSlots: Object.freeze([{ competitionScheduleSlotId: `${options.fixtureId}:slot`, scheduleBlockId: null, scheduleSessionId: null, slotOrder: 1 }]),
    scheduleSlotTimings: Object.freeze(options.localDate === undefined ? [] : [{ competitionScheduleSlotTimingHistoryId: `${options.fixtureId}:timing`, competitionScheduleSlotId: `${options.fixtureId}:slot`, timingState: 'CONFIRMED', localDate: options.localDate, localTime: '20:00', timeZone: 'UTC', validFrom: null, validTo: null }]),
    fixtureScheduleAllocations: Object.freeze([{ competitionFixtureScheduleAllocationId: `${options.fixtureId}:allocation`, competitionFixtureId: options.fixtureId, competitionScheduleSlotId: `${options.fixtureId}:slot`, status: 'ACTIVE', validFrom: null, validTo: null }]),
    rulePayloads: Object.freeze(rulePayloads),
  })
}

function context(bundleValue: WorldDbCompetitionBundleV1, extra: Partial<WorldDbCompetitionPlanningContextV1> = {}): WorldDbCompetitionPlanningContextV1 {
  return { bundle: bundleValue, ...extra }
}

const asOf = '2026-01-01T00:00:00Z'

describe('WorldDbPhysicalGamePlanner v1', () => {
  it('does not merge coincidental same-date same-team fixtures without explicit sharing policy', () => {
    const regular = bundle({ competitionSeasonId: 'season:regular', competitionId: 'competition:regular', fixtureId: 'fixture:regular', nodeId: 'node:regular', localDate: '2026-02-01' })
    const cup = bundle({ competitionSeasonId: 'season:cup', competitionId: 'competition:cup', fixtureId: 'fixture:cup', nodeId: 'node:cup', localDate: '2026-02-01' })

    const result = planWorldDbPhysicalGamesV1([context(regular), context(cup)], asOf)
    expect(result.games).toHaveLength(2)
    expect(result.bindings).toHaveLength(2)
  })

  it('creates one physical game with two fixture bindings only when sharing is explicitly declared', () => {
    const regular = bundle({ competitionSeasonId: 'season:regular', competitionId: 'competition:regular', fixtureId: 'fixture:regular', nodeId: 'node:regular', localDate: '2026-02-01' })
    const cup = bundle({
      competitionSeasonId: 'season:cup', competitionId: 'competition:cup', fixtureId: 'fixture:cup', nodeId: 'node:cup', localDate: '2026-02-01',
      sharedCompetitionSeasonId: 'season:regular', physicalMatchContext: 'SHARED_WITH_DECLARED_COMPETITION',
    })

    const result = planWorldDbPhysicalGamesV1([context(regular), context(cup)], asOf)
    expect(result.games).toHaveLength(1)
    expect(result.games[0]).toMatchObject({
      primaryCompetitionSeasonId: 'season:regular', competitionId: 'competition:regular', localDate: '2026-02-01', homeTeamId: 'team:home', awayTeamId: 'team:away',
    })
    expect(result.games[0]?.competitionFixtureIds).toEqual(['fixture:cup', 'fixture:regular'])
    expect(result.bindings.map((binding) => binding.competitionFixtureId)).toEqual(['fixture:cup', 'fixture:regular'])
  })

  it('waits rather than creating a duplicate when an explicitly shared counterpart is missing', () => {
    const cup = bundle({
      competitionSeasonId: 'season:cup', competitionId: 'competition:cup', fixtureId: 'fixture:cup', nodeId: 'node:cup', localDate: '2026-02-01',
      sharedCompetitionSeasonId: 'season:regular', physicalMatchContext: 'SHARED_WITH_DECLARED_COMPETITION',
    })
    const result = planWorldDbPhysicalGamesV1([context(cup)], asOf)
    expect(result.games).toEqual([])
    expect(result.waitingFixtures).toEqual([{ competitionFixtureId: 'fixture:cup', reason: 'MISSING_SHARED_COUNTERPART' }])
  })

  it('materializes participant sides from resolved structure positions without guessing unresolved slots', () => {
    const bracket = bundle({
      competitionSeasonId: 'season:bracket', competitionId: 'competition:bracket', fixtureId: 'fixture:final', nodeId: 'node:final', localDate: '2026-03-01',
      homeEntryId: null, awayEntryId: null, homePositionId: 'position:winner-a', awayPositionId: 'position:winner-b',
    })
    const resolved = planWorldDbPhysicalGamesV1([
      context(bracket, { resolvedEntryIdByStructurePositionId: { 'position:winner-a': 'season:bracket:entry:home', 'position:winner-b': 'season:bracket:entry:away' } }),
    ], asOf)
    expect(resolved.games).toHaveLength(1)

    const waiting = planWorldDbPhysicalGamesV1([context(bracket)], asOf)
    expect(waiting.games).toEqual([])
    expect(waiting.waitingFixtures).toEqual([{ competitionFixtureId: 'fixture:final', reason: 'UNRESOLVED_PARTICIPANTS' }])
  })

  it('reuses canonical B12 physical identity and its N:M realizations', () => {
    const regular = bundle({ competitionSeasonId: 'season:regular', competitionId: 'competition:regular', fixtureId: 'fixture:regular', nodeId: 'node:regular', localDate: '2026-02-01' })
    const cup = bundle({ competitionSeasonId: 'season:cup', competitionId: 'competition:cup', fixtureId: 'fixture:cup', nodeId: 'node:cup', localDate: '2026-02-01' })
    const realizations: WorldDbMatchRealizationBundleV1 = Object.freeze({
      schemaVersion: 1,
      competitionSeasonId: 'season:regular',
      matches: Object.freeze([{ matchId: 'match:shared', competitionSeasonId: 'season:regular', scheduledAt: '2026-02-01T20:00:00Z', playedAt: null, facilityId: null, status: 'SCHEDULED', homeTeamId: 'team:home', awayTeamId: 'team:away' }]),
      realizations: Object.freeze([
        { gameFixtureRealizationId: 'realization:regular', matchId: 'match:shared', competitionFixtureId: 'fixture:regular', realizationType: 'ORIGINAL', status: 'AUTHORITATIVE' },
        { gameFixtureRealizationId: 'realization:cup', matchId: 'match:shared', competitionFixtureId: 'fixture:cup', realizationType: 'ORIGINAL', status: 'AUTHORITATIVE' },
      ]),
    })

    const result = planWorldDbPhysicalGamesV1([context(regular, { matchRealizations: realizations }), context(cup)], asOf)
    expect(result.games).toHaveLength(1)
    expect(result.games[0]).toMatchObject({ sourceMatchId: 'match:shared', primaryCompetitionSeasonId: 'season:regular' })
    expect(result.games[0]?.competitionFixtureIds).toEqual(['fixture:cup', 'fixture:regular'])
    expect(result.bindings).toHaveLength(2)
  })

  it('keeps unscheduled fixtures waiting instead of inventing a date', () => {
    const unscheduled = bundle({ competitionSeasonId: 'season:regular', competitionId: 'competition:regular', fixtureId: 'fixture:regular', nodeId: 'node:regular' })
    const result = planWorldDbPhysicalGamesV1([context(unscheduled)], asOf)
    expect(result.games).toEqual([])
    expect(result.waitingFixtures).toEqual([{ competitionFixtureId: 'fixture:regular', reason: 'UNSCHEDULED' }])
  })
})
