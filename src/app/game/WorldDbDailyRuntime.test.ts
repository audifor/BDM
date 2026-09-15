import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GameWorld } from '@/domain/world'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'

vi.mock('@/engine/calendar', () => ({ getScheduledGamesToday: vi.fn() }))
vi.mock('./advanceGameDay', () => ({
  advanceGameDay: vi.fn(),
  simulateRemainingGamesToday: vi.fn(),
}))
vi.mock('./ContinueFlow', () => ({
  DEFAULT_CONTINUE_DAY_LIMIT: 366,
  getContinueStopReason: vi.fn(),
}))
vi.mock('./WorldDbCompetitionContextLoader', () => ({
  loadWorldDbCompetitionPlanningContextsV1: vi.fn(),
  loadWorldDbCompetitionRuntimeCatalogV1: vi.fn(),
}))
vi.mock('./WorldDbGameMaterialization', () => ({ materializeWorldDbPhysicalGamesV1: vi.fn() }))
vi.mock('./simulateUntilDate', () => ({ tickSimulateUntilDate: vi.fn() }))

import { getScheduledGamesToday } from '@/engine/calendar'
import { advanceGameDay, simulateRemainingGamesToday } from './advanceGameDay'
import { getContinueStopReason } from './ContinueFlow'
import {
  loadWorldDbCompetitionPlanningContextsV1,
  loadWorldDbCompetitionRuntimeCatalogV1,
} from './WorldDbCompetitionContextLoader'
import { WorldDbDailyRuntimeSessionV1 } from './WorldDbDailyRuntime'
import { materializeWorldDbPhysicalGamesV1 } from './WorldDbGameMaterialization'
import { tickSimulateUntilDate } from './simulateUntilDate'

const HASH = 'a'.repeat(64)
const repository = {} as WorldDatabaseRepository
const context = Object.freeze({
  bundle: Object.freeze({ fixtures: Object.freeze([Object.freeze({})]) }),
}) as never

function world(
  date = '2030-01-01',
  competitionSeasonIds: readonly string[] = ['season-1'],
  pinned = false,
): GameWorld {
  return {
    currentDate: date,
    games: {},
    worldDbCompetitionRuntime: {
      competitionRuntimeBundle: pinned
        ? { contentId: 'runtime-1', contentHash: HASH, worldDbSchema: 'DDL-PHASE1-A' }
        : null,
      competitionPlanIds: [],
      competitionSeasonIds,
    },
  } as unknown as GameWorld
}

function configurePreparation(): void {
  vi.mocked(loadWorldDbCompetitionRuntimeCatalogV1).mockImplementation(async (_repository, _path, input) => ({
    world: world(input.currentDate, input.worldDbCompetitionRuntime?.competitionSeasonIds ?? [], true),
    bundle: {} as never,
    catalog: {} as never,
  }))
  vi.mocked(loadWorldDbCompetitionPlanningContextsV1).mockResolvedValue(Object.freeze([context]))
  vi.mocked(materializeWorldDbPhysicalGamesV1).mockImplementation((input) => ({
    world: input,
    plan: {} as never,
    deferredCompetitionFixtureIds: Object.freeze([]),
  }))
}

function session(): WorldDbDailyRuntimeSessionV1 {
  return new WorldDbDailyRuntimeSessionV1({
    repository,
    databasePath: '/db/world.sqlite',
    runtimeBundlePath: '/db/runtime.json',
  })
}

describe('WorldDbDailyRuntimeSessionV1', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configurePreparation()
    vi.mocked(getScheduledGamesToday).mockReturnValue([])
    vi.mocked(simulateRemainingGamesToday).mockImplementation((input) => input)
  })

  it('leaves worlds without active World DB seasons untouched', async () => {
    const input = world('2030-01-01', [])
    const result = await session().prepare(input)

    expect(result).toBe(input)
    expect(loadWorldDbCompetitionRuntimeCatalogV1).not.toHaveBeenCalled()
    expect(loadWorldDbCompetitionPlanningContextsV1).not.toHaveBeenCalled()
    expect(materializeWorldDbPhysicalGamesV1).not.toHaveBeenCalled()
  })

  it('revalidates bundle identity but caches immutable B04/B12 contexts', async () => {
    const runtime = session()
    const first = await runtime.prepare(world())
    await runtime.prepare(first)

    expect(loadWorldDbCompetitionRuntimeCatalogV1).toHaveBeenCalledTimes(2)
    expect(loadWorldDbCompetitionPlanningContextsV1).toHaveBeenCalledTimes(1)
    expect(loadWorldDbCompetitionPlanningContextsV1).toHaveBeenCalledWith(
      repository,
      '/db/world.sqlite',
      expect.objectContaining({ competitionSeasonIds: ['season-1'] }),
    )
    expect(materializeWorldDbPhysicalGamesV1).toHaveBeenCalledTimes(2)
  })

  it('reloads B04/B12 contexts when the active competition season set changes', async () => {
    const runtime = session()
    await runtime.prepare(world())
    await runtime.prepare(world('2030-01-01', ['season-1', 'season-2'], true))

    expect(loadWorldDbCompetitionPlanningContextsV1).toHaveBeenCalledTimes(2)
  })

  it('resolves same-day downstream Games before advancing the calendar', async () => {
    const next = world('2030-01-02', ['season-1'], true)
    vi.mocked(getScheduledGamesToday)
      .mockReturnValueOnce([{} as never])
      .mockReturnValueOnce([{} as never])
      .mockReturnValueOnce([])
    vi.mocked(advanceGameDay).mockReturnValue(next)

    const result = await session().advanceDay(world())

    expect(simulateRemainingGamesToday).toHaveBeenCalledTimes(2)
    expect(materializeWorldDbPhysicalGamesV1).toHaveBeenCalledTimes(4)
    expect(advanceGameDay).toHaveBeenCalledTimes(1)
    expect(result.currentDate).toBe('2030-01-02')
  })

  it('materializes before Continue stop checks and after each advanced day', async () => {
    const next = world('2030-01-02', ['season-1'], true)
    vi.mocked(getContinueStopReason)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ type: 'seasonComplete' })
    vi.mocked(advanceGameDay).mockReturnValue(next)

    const result = await session().continueGame(world(), 2)

    expect(advanceGameDay).toHaveBeenCalledTimes(1)
    expect(loadWorldDbCompetitionRuntimeCatalogV1).toHaveBeenCalledTimes(2)
    expect(result.daysAdvanced).toBe(1)
    expect(result.finalDate).toBe('2030-01-02')
    expect(result.stopReason).toEqual({ type: 'seasonComplete' })
  })

  it('uses the World DB daily boundary for an uninterrupted simulate-until day', async () => {
    const next = world('2030-01-02', ['season-1'], true)
    vi.mocked(getContinueStopReason).mockReturnValue(undefined)
    vi.mocked(advanceGameDay).mockReturnValue(next)

    const result = await session().tickSimulateUntilDate(world(), '2030-01-03' as never)

    expect(tickSimulateUntilDate).not.toHaveBeenCalled()
    expect(loadWorldDbCompetitionRuntimeCatalogV1).toHaveBeenCalledTimes(2)
    expect(result.event).toEqual({ type: 'dayAdvanced' })
    expect(result.world.currentDate).toBe('2030-01-02')
  })

  it('materializes again after a simulate-until interruption resolves gameplay', async () => {
    const next = world('2030-01-01', ['season-1'], true)
    vi.mocked(getContinueStopReason).mockReturnValue({
      type: 'mediaOpportunity',
      opportunityId: 'media-1' as never,
    })
    vi.mocked(tickSimulateUntilDate).mockReturnValue({ world: next, event: { type: 'mediaSkipped' } })

    const result = await session().tickSimulateUntilDate(world(), '2030-01-03' as never)

    expect(tickSimulateUntilDate).toHaveBeenCalledTimes(1)
    expect(loadWorldDbCompetitionRuntimeCatalogV1).toHaveBeenCalledTimes(2)
    expect(result.event).toEqual({ type: 'mediaSkipped' })
  })

  it('rejects missing external physical paths', () => {
    expect(() => new WorldDbDailyRuntimeSessionV1({
      repository,
      databasePath: ' ',
      runtimeBundlePath: '/db/runtime.json',
    })).toThrow('databasePath')
  })
})
