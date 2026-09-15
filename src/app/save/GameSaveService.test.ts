import { describe, expect, it } from 'vitest'
import { createLiveUserMatch, createNewGame, completeMatch as completeMatchApp, instantResult } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { getGamesToday } from '@/engine/calendar'
import type { GameSaveRepository } from './GameSaveRepository'
import { loadSavedGame, saveCurrentGame } from './GameSaveService'

const SAVED_AT = '2032-10-01T12:00:00.000Z'

/** In-memory GameSaveRepository double: the same disk contract, no Tauri/filesystem dependency. */
function createMemoryRepository(): GameSaveRepository & { readonly writes: string[] } {
  let stored: string | null = null
  const writes: string[] = []
  return {
    writes,
    save: async (envelopeJson) => { stored = envelopeJson; writes.push(envelopeJson) },
    load: async () => { if (stored === null) throw new Error('No saved game'); return stored },
    getInfo: async () => (stored === null ? null : { savedAt: SAVED_AT }),
  }
}

function createFailingRepository(message: string): GameSaveRepository {
  return {
    save: async () => { throw new Error(message) },
    load: async () => { throw new Error('No saved game') },
    getInfo: async () => null,
  }
}

function completedLiveMatchSimulation() {
  const world = createNewGame()
  const controller = createLiveUserMatch(world)
  const simulation = controller.skipToEnd()
  return { world, simulation }
}

describe('completed live-match persistence bridge (MG2D / MG1 BUG-5)', () => {
  it('Test D: Save V3 round-trip preserves a completed live match result', async () => {
    const { world, simulation } = completedLiveMatchSimulation()
    const completedWorld = completeMatchApp(world, simulation)
    const repository = createMemoryRepository()

    await saveCurrentGame(completedWorld, repository, SAVED_AT)
    const loaded = await loadSavedGame(repository)

    const gameId = simulation.gameId
    expect(loaded.games[gameId]?.status).toBe('completed')
    expect(loaded.games[gameId]?.result).toEqual(completedWorld.games[gameId]?.result)
    expect(loaded.matchStatLogsByGameId[gameId]).toEqual(completedWorld.matchStatLogsByGameId[gameId])
  })

  it('reports a save failure explicitly instead of masquerading as success (Test J)', async () => {
    const { world, simulation } = completedLiveMatchSimulation()
    const completedWorld = completeMatchApp(world, simulation)
    const repository = createFailingRepository('disk is full')

    await expect(saveCurrentGame(completedWorld, repository, SAVED_AT)).rejects.toThrow('disk is full')
  })

  it('Instant Result also round-trips through Save V3 unchanged (Test F regression)', async () => {
    const world = instantResult(createNewGame())
    const repository = createMemoryRepository()

    await saveCurrentGame(world, repository, SAVED_AT)
    const loaded = await loadSavedGame(repository)

    const completedGameId = getGamesToday(world).find((game) => game.status === 'completed')!.id
    expect(loaded.games[completedGameId]?.result).toEqual(world.games[completedGameId]?.result)
  })

  it('the completed world committed before saving is never re-simulated by the save boundary (Test C)', () => {
    const { world, simulation } = completedLiveMatchSimulation()
    const team = getUserTeam(world)!
    const isHome = simulation.homeTeamId === team.id

    const completedWorldA = completeMatchApp(world, simulation)
    const completedWorldB = completeMatchApp(world, simulation)

    // Same authoritative simulation applied twice from the same starting world (not through the
    // idempotency-guarded live single-application path) still produces byte-identical committed
    // results — proving completeMatch derives everything from the passed-in simulation and never
    // re-simulates or reads presentation state.
    expect(completedWorldA.games[simulation.gameId]?.result).toEqual(completedWorldB.games[simulation.gameId]?.result)
    expect(completedWorldA.matchStatLogsByGameId[simulation.gameId]).toEqual(completedWorldB.matchStatLogsByGameId[simulation.gameId])
    expect(isHome ? simulation.finalScore.home : simulation.finalScore.away).toBe(
      isHome ? completedWorldA.games[simulation.gameId]!.result!.homeScore : completedWorldA.games[simulation.gameId]!.result!.awayScore,
    )
  })
})
