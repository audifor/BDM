import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { validateGameWorld } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { evaluateSimulationBreakpoints } from './SimulationBreakpoints'
import { advanceGameDayWithResultAsync } from './advanceGameDay'
import { createUniverseAcceptanceRunner } from './testSupport/WorldDbV2UniverseRunner'

it.skipIf(process.env.BDM_V206_REGRESSION !== '1')('loads and continues the certified 30-day and full-season universes without losing their complete Save V4 state', async () => {
  const runner = createUniverseAcceptanceRunner(), reports = []
  try {
    for (const file of ['day-30.save.json.gz', 'certified-universe.save.json.gz']) {
      const raw = JSON.parse(gunzipSync(readFileSync('docs/playable/evidence/worlddb-v2-05/' + file)).toString('utf8'))
      let world = deserializeGameWorldSaveV4(raw)
      validateGameWorld(world)
      const original = projectPersistentWorldTruth(world), date = world.currentDate
      const restored = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, '2026-10-28T00:00:00Z'))))
      expect(projectPersistentWorldTruth(restored)).toEqual(original)
      expect(Object.keys(world.competitions)).toHaveLength(4); expect(Object.keys(world.teams)).toHaveLength(70)
      const rosterIds = Object.values(world.teams).flatMap(t => t.rosterPlayerIds)
      expect(new Set(rosterIds).size).toBe(rosterIds.length)
      const identities = Object.keys(world.players).sort()
      const champions = Object.values(world.seasonHistoryBySeasonId).map(s => ({ seasonId: s.seasonId, championTeamId: s.championTeamId }))
      if (file.startsWith('certified')) expect(champions.filter(s => s.championTeamId).length).toBeGreaterThanOrEqual(4)
      useGameStore.getState().replaceWorld(restored)
      const decisions = []
      for (const stop of evaluateSimulationBreakpoints(restored).candidates.filter(b => b.level === 'BLOCKING' || b.level === 'ACTION_REQUIRED')) {
        const store = useGameStore.getState()
        if (stop.reason === 'userGame') continue
        if (stop.reason === 'returnToPlayReview') store.reviewReturnToPlay(stop.sourceId as never, 'CONTINUE_RECOVERY')
        else if (stop.reason === 'mediaOpportunity') store.skipMedia(stop.sourceId)
        else if (stop.reason === 'coachJobOffer') store.declineUserCoachOffer(stop.sourceId)
        else throw Error('Unsupported required decision: ' + JSON.stringify(stop))
        decisions.push({ reason: stop.reason, sourceId: stop.sourceId })
      }
      world = useGameStore.getState().world!
      let seed = 151617
      const advanced = await advanceGameDayWithResultAsync(world, runner, () => seed++)
      expect(advanced.status, JSON.stringify(advanced.failure)).toMatch(/COMPLETED|BREAKPOINT_AFTER_PROCESSING/)
      expect(advanced.world.currentDate).not.toBe(date)
      expect(Object.keys(advanced.world.players).sort()).toEqual(identities)
      const afterSave = serializeGameWorldV4(advanced.world, '2026-10-28T00:00:00Z')
      expect(projectPersistentWorldTruth(deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(afterSave))))).toEqual(projectPersistentWorldTruth(advanced.world))
      reports.push({ file, beforeDate: date, afterDate: advanced.world.currentDate, identities: identities.length,
        clubs: 70, competitions: 4, champions, decisions, beforeActas: Object.keys(restored.matchStatLogsByGameId).length,
        afterActas: Object.keys(advanced.world.matchStatLogsByGameId).length, exactRoundTrips: true })
    }
    writeFileSync('.worlddb-v2/v2-06/regressions.json', JSON.stringify({ passed: true, reports }, null, 2))
  } finally { runner.dispose() }
}, 600_000)
