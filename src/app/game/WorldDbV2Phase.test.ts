import { expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { getUserTeam } from '@/engine/calendar'
import { hashStringToSeed } from '@/engine/random'
import { useGameStore } from '@/stores/gameStore'
import { advanceGameDayWithResult } from './advanceGameDay'
import { evaluateSimulationBreakpoints } from './SimulationBreakpoints'

// Prepare a real native checkpoint through the production day boundary. The
// source save stays read-only; no date, fixture, coach or result is injected.
it.skipIf(!process.env.BDM_WORLDDB_PHASE_SOURCE)('reaches the next user postseason fixture from a real certified phase', () => {
  let world = deserializeGameWorldSaveV4(JSON.parse(readFileSync(process.env.BDM_WORLDDB_PHASE_SOURCE!, 'utf8')))
  const out = resolve('.worlddb-v2/phase-04-' + Date.now()); mkdirSync(out, { recursive: true })
  useGameStore.getState().replaceWorld(world)
  const season = world.currentSeasonId!, team = getUserTeam(world)!.id
  let ready = false
  for (let day = 0; day < 200; day++) {
    if (Object.values(world.games).some(g => g.seasonId === season && g.postseasonFixtureId && g.status === 'scheduled' && g.date === world.currentDate && (g.homeTeamId === team || g.awayTeamId === team))) { ready = true; break }
    for (const b of evaluateSimulationBreakpoints(world).candidates.filter(b => b.level === 'ACTION_REQUIRED' || b.level === 'BLOCKING')) {
      if (b.reason === 'userGame') continue
      if (b.reason === 'mediaOpportunity') useGameStore.getState().skipMedia(b.sourceId)
      else if (b.reason === 'coachJobOffer') useGameStore.getState().declineUserCoachOffer(b.sourceId)
      else if (b.reason === 'returnToPlayReview') {
        const result = useGameStore.getState().reviewReturnToPlay(b.sourceId as never, 'CLEAR_FOR_PLAY')
        if (!result.ok) useGameStore.getState().reviewReturnToPlay(b.sourceId as never, 'CONTINUE_RECOVERY')
      } else throw Error('Unresolved phase decision: ' + JSON.stringify(b))
    }
    world = useGameStore.getState().world!
    let i = 0
    const result = advanceGameDayWithResult(world, () => hashStringToSeed(`phase-04:${world.currentDate}:${i++}`))
    expect(result.status, JSON.stringify(result.failure)).toMatch(/COMPLETED|BREAKPOINT_AFTER_PROCESSING/)
    world = result.world; useGameStore.getState().replaceWorld(world)
  }
  expect(ready).toBe(true)
  const save = serializeGameWorldV4(world, '2026-10-26T12:00:00Z')
  writeFileSync(resolve(out, 'ready.json'), JSON.stringify(save))
  expect(projectPersistentWorldTruth(deserializeGameWorldSaveV4(JSON.parse(readFileSync(resolve(out, 'ready.json'), 'utf8'))))).toEqual(projectPersistentWorldTruth(world))
  writeFileSync(resolve(out, 'acceptance.json'), JSON.stringify({ passed: true, source: process.env.BDM_WORLDDB_PHASE_SOURCE, date: world.currentDate, season, team }, null, 2))
}, 1_800_000)
