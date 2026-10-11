import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseWorldCompetitionRuntimeBundle } from '@/domain/competition'
import { parseGameDate } from '@/domain/date'
import { advanceGameDay } from './advanceGameDay'
import { simulateAndApplyGame } from './matchResolution'
import { bootstrapGameWorldFromWorldDb } from './WorldDbGameBootstrap'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { spainAcbCalendarForStartYear } from '@/data/worldCompetitionCalendars'
import { attachWorldDbSpainCup } from './WorldDbSpainCupBootstrap'
import type { WorldDbGameBootstrapSliceV1 } from '@/domain/worldDb/GameBootstrap'

const slicePath = process.env.BDM_WORLD_DB_SLICE_JSON
const bundlePath = process.env.VITE_BDM_WORLD_DB_RUNTIME_BUNDLE_PATH

describe('isolated WorldDB 2026-27 candidate smoke', () => {
  it.skipIf(!slicePath || !bundlePath || !existsSync(slicePath) || !existsSync(bundlePath))(
    'starts July 1, advances to an official fixture, simulates it and preserves the result through Save/Reload',
    () => {
      const slice = JSON.parse(readFileSync(slicePath!, 'utf8')) as WorldDbGameBootstrapSliceV1
      const bundle = parseWorldCompetitionRuntimeBundle(JSON.parse(readFileSync(bundlePath!, 'utf8')))
      const seasonId = 'edition:ESP:liga-endesa:2026-27'
      const cupSeasonId = 'edition:ESP:copa-del-rey:2026-27'
      const format = bundle.competitionFormats.find((item) => item.competitionSeasonId === seasonId)
      const cupFormat = bundle.competitionFormats.find((item) => item.competitionSeasonId === cupSeasonId)
      expect(format).toBeDefined()
      expect(cupFormat).toBeDefined()
      const selection = {
        source: slice.source,
        ecosystemId: slice.ecosystem.ecosystemId,
        competitionId: slice.competition.competitionId,
        competitionSeasonId: seasonId,
        teamId: slice.teams[0]!.teamId,
      }
      const initial = bootstrapGameWorldFromWorldDb(
        slice,
        selection,
        { contentId: bundle.contentId, contentHash: bundle.contentHash, worldDbSchema: bundle.worldDbSchema },
        format,
        spainAcbCalendarForStartYear(2026),
      )
      const world = attachWorldDbSpainCup(initial, cupFormat!)
      expect(world.currentDate).toBe('2026-07-01')
      expect(Object.keys(world.teams)).toHaveLength(18)
      expect(Object.keys(world.players)).toHaveLength(270)
      expect(Object.keys(world.games)).toHaveLength(306)
      expect(Object.keys(world.players).sort()).toEqual(slice.players.map((player) => player.playerId).sort())

      const firstMatch = Object.values(world.games).sort((left, right) => left.date.localeCompare(right.date))[0]!
      const advanced = advanceGameDay(world)
      expect(advanced.currentDate).toBe('2026-07-02')
      expect(advanced.games[firstMatch.id]?.date).toBe(firstMatch.date)
      expect(advanced.games[firstMatch.id]?.status).toBe('scheduled')
      const played = simulateAndApplyGame(advanced, advanced.games[firstMatch.id]!)
      expect(played.games[firstMatch.id]?.status).toBe('completed')
      expect(played.games[firstMatch.id]?.result).toEqual(expect.objectContaining({ homeScore: expect.any(Number), awayScore: expect.any(Number) }))

      const restored = deserializeGameWorldV4(serializeGameWorldV4(played, '2026-10-11T00:00:00.000Z'))
      expect(restored.currentDate).toBe(played.currentDate)
      expect(restored.games[firstMatch.id]).toEqual(played.games[firstMatch.id])
      expect(Object.keys(restored.players).sort()).toEqual(Object.keys(played.players).sort())
      expect(Object.keys(restored.games)).toHaveLength(306)
    },
    120_000,
  )
})
