import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { assessActiveContractRosterIntegrity } from '@/engine/market/RosterContractIntegrity'
import { loadSavedGame, saveCurrentGame } from './GameSaveService'
import type { GameSaveRepository } from './GameSaveRepository'

function repository(initial = ''): GameSaveRepository & { value: string } {
  return {
    value: initial,
    async save(value) { this.value = value },
    async load() { return this.value },
    async getInfo() { return null },
  }
}

describe('GameSaveService roster and contract integrity', () => {
  it('round-trips a valid world', async () => {
    const repo = repository()
    const world = createNewGame()
    await saveCurrentGame(world, repo, world.currentDate)
    const restored = await loadSavedGame(repo)
    expect(restored.contractsById).toEqual(world.contractsById)
    expect(Object.fromEntries(Object.entries(restored.teams).map(([id, team]) => [id, team.rosterPlayerIds]))).toEqual(Object.fromEntries(Object.entries(world.teams).map(([id, team]) => [id, team.rosterPlayerIds])))
    expect(assessActiveContractRosterIntegrity(restored, Object.values(restored.contractsById)[0]!.playerId)).toBe('VALID')
  })

  it('diagnoses an ambiguous saved active-contract relationship', async () => {
    const world = createNewGame()
    const contract = Object.values(world.contractsById)[0]!
    const otherTeam = Object.values(world.teams).find((team) => team.id !== contract.teamId)!
    const inconsistent = updateGameWorld(world, { contracts: Object.values(world.contractsById).map((item) => item.id === contract.id ? { ...item, teamId: otherTeam.id } : item) })
    const repo = repository(JSON.stringify(serializeGameWorldV4(inconsistent, world.currentDate)))
    await expect(loadSavedGame(repo)).rejects.toThrow(/unresolved roster\/contract integrity/i)
    await expect(saveCurrentGame(inconsistent, repository(), world.currentDate)).rejects.toThrow(/pass roster\/contract integrity repair/i)
  })
})
