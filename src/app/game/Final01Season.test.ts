import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { validateGameWorld } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { hashStringToSeed } from '@/engine/random'
import { calculateStandings } from '@/engine/competition/standings'
import { getCompetitionPostseasonState } from '@/engine/competition'
import { advanceGameDayWithResultAsync } from './advanceGameDay'
import { evaluateSimulationBreakpoints } from './SimulationBreakpoints'
import { createUniverseAcceptanceRunner } from './testSupport/WorldDbV2UniverseRunner'

const input = process.env.BDM_FINAL01_SAVE
it.skipIf(process.env.BDM_FINAL01_SEASON !== '1' || !input || !existsSync(input))('continues the real Windows career through four finals, fiscal closure and successor seasons', async () => {
  const out = resolve('.worlddb-v2/final-01/season'); mkdirSync(out, { recursive: true })
  let world = deserializeGameWorldSaveV4(JSON.parse(readFileSync(input!, 'utf8')))
  const initial = world, seasons = Object.values(world.competitions).map(c => Object.values(world.seasons).filter(s => s.competitionId === c.id).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]!)
  expect(seasons).toHaveLength(4); expect(Object.keys(world.teams)).toHaveLength(70)
  const checkpoint = (name: string) => {
    validateGameWorld(world)
    const json = JSON.stringify(serializeGameWorldV4(world, '2026-10-28T00:00:00Z'))
    writeFileSync(resolve(out, name+'.json'), json)
    const restored = deserializeGameWorldSaveV4(JSON.parse(readFileSync(resolve(out,name+'.json'),'utf8')))
    expect(projectPersistentWorldTruth(restored)).toEqual(projectPersistentWorldTruth(world)); world = restored
  }
  const summary = () => seasons.map(season => {
    const games = Object.values(world.games).filter(g => g.seasonId === season.id)
    const next = Object.values(world.seasons).find(s => s.competitionId === season.competitionId && s.startDate > season.startDate)
    return { competitionId: season.competitionId, seasonId: season.id, champion: world.seasonHistoryBySeasonId[season.id]?.championTeamId,
      completed: games.filter(g => g.status === 'completed').length, clubs: world.competitions[season.competitionId]!.participantTeamIds.length,
      successor: next?.id, successorCompleted: next ? Object.values(world.games).filter(g => g.seasonId === next.id && g.status === 'completed').length : 0 }
  })
  const runner = createUniverseAcceptanceRunner(), decisions: unknown[] = []
  checkpoint('starting-native-career')
  try {
    const completedNativeSave = process.env.BDM_FINAL01_COMPLETED
    if (completedNativeSave) {
      world = deserializeGameWorldSaveV4(JSON.parse(readFileSync(completedNativeSave, 'utf8')))
      expect(world.currentDate > initial.currentDate).toBe(true)
    }
    for (let day = 0; !completedNativeSave && day < 500; day++) {
      if (summary().every(row => row.champion && row.successorCompleted > 0)) break
      useGameStore.getState().replaceWorld(world)
      for (const stop of evaluateSimulationBreakpoints(world).candidates.filter(b => b.level === 'BLOCKING' || b.level === 'ACTION_REQUIRED')) {
        if (stop.reason === 'userGame') continue
        const store = useGameStore.getState()
        if (stop.reason === 'mediaOpportunity') store.skipMedia(stop.sourceId)
        else if (stop.reason === 'returnToPlayReview') {
          const cleared = store.reviewReturnToPlay(stop.sourceId as never, 'CLEAR_FOR_PLAY')
          if (!cleared.ok) store.reviewReturnToPlay(stop.sourceId as never, 'CONTINUE_RECOVERY')
        } else { checkpoint('decision-required'); throw Error('Native decision required: '+JSON.stringify(stop)) }
        decisions.push({ date: world.currentDate, reason: stop.reason, sourceId: stop.sourceId })
      }
      world = useGameStore.getState().world!
      let sequence = 0
      const result = await advanceGameDayWithResultAsync(world, runner, () => hashStringToSeed(`final-01:${world.currentDate}:${sequence++}`))
      if (result.status === 'FAILED' || result.status === 'BREAKPOINT_PREVENTED') {
        writeFileSync(resolve(out, 'failure.json'), JSON.stringify(result)); checkpoint('before-failure')
      }
      expect(result.status, JSON.stringify({ date: world.currentDate, failure: result.failure, stop: result.breakpointBefore.breakpoint })).toMatch(/COMPLETED|BREAKPOINT_AFTER_PROCESSING/)
      world = result.world
      writeFileSync(resolve(out,'progress.json'),JSON.stringify({ date:world.currentDate,days:day+1,leagues:summary(),decisions:decisions.length },null,2))
      if (day % 30 === 29) checkpoint('latest')
    }
    expect(summary().every(row => row.champion && row.successorCompleted > 0)).toBe(true)
    for (const season of seasons) {
      const games = Object.values(world.games).filter(g => g.seasonId === season.id), teams = world.competitions[season.competitionId]!.participantTeamIds
      expect(games.every(g => g.status === 'completed' && world.matchStatLogsByGameId[g.id] !== undefined)).toBe(true)
      expect(games.filter(g => g.stakes === 'regular')).toHaveLength(teams.length * (teams.length - 1))
      expect(calculateStandings(world, season.id).every(row => row.played === 2 * (teams.length - 1))).toBe(true)
      expect(getCompetitionPostseasonState(world, season.id)?.championTeamId).toBe(world.seasonHistoryBySeasonId[season.id]!.championTeamId)
    }
    for (const [id, fact] of Object.entries(initial.financialTransactionsById)) expect(world.financialTransactionsById[id as never]).toEqual(fact)
    for (const [id, contract] of Object.entries(initial.contractsById)) expect(world.contractsById[id as never]).toMatchObject({ playerId: contract.playerId, teamId: contract.teamId, term: contract.term, compensation: contract.compensation })
    for (const id of Object.keys(initial.injuriesById)) expect(world.injuriesById[id as never]).toBeDefined()
    for (const id of Object.keys(initial.personsById)) expect(world.personsById[id as never]).toBeDefined()
    for (const period of Object.values(initial.fiscalPeriodsById)) if (period.endsOn < world.currentDate) expect(world.fiscalPeriodsById[period.id]!.status).toBe('CLOSED')
    const rosterIds = Object.values(world.teams).flatMap(team => team.rosterPlayerIds)
    expect(new Set(rosterIds).size).toBe(rosterIds.length)
    checkpoint('certified-universe')
    writeFileSync(resolve(out, 'acceptance.json'), JSON.stringify({ passed:true,date:world.currentDate,leagues:summary(),actas:Object.keys(world.matchStatLogsByGameId).length,closedPeriods:Object.values(world.fiscalPeriodsById).filter(p=>p.status==='CLOSED').length,originalFinancialHistoryUnchanged:true,exactSaveRoundTrip:true,decisions },null,2))
  } finally { runner.dispose() }
}, 28_800_000)
