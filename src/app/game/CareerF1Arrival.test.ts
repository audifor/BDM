import { beforeAll, describe, expect, it } from 'vitest'

import { ACB_TEST_UNIVERSE_ID } from '@/data/acb2026'
import { getPendingFirstStaffMeeting, decideFirstStaffMeeting } from '@/app/coachLife'
import { createInlineMatchRunner } from '@/app/matchNext/MatchSimulationRunner'
import type { GameSaveRepository } from '@/app/save/GameSaveRepository'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { continueGameAsync } from './ContinueFlow'
import { createConfiguredGameAsync } from './createConfiguredGame'
import { instantResult } from './matchResolution'
import type { GameWorld } from '@/domain/world'

const coach = {
  firstName: 'Elena', lastName: 'F1', dateOfBirth: '1990-01-01', gender: 'female', nationalityCountryCode: 'ESP',
  background: 'rookie', ambition: 'firstTitle', coachingStyle: 'balanced', disposition: 'balanced', biography: 'F1 arrival certification coach.',
} as const

let initial: GameWorld

beforeAll(async () => {
  initial = await createConfiguredGameAsync({ universeId: ACB_TEST_UNIVERSE_ID, userTeamKey: 'ucm', userCoachCreation: coach })
}, 180_000)

function memoryRepository(): GameSaveRepository & { file: string } {
  const repository = { file: '', save: async (json: string) => { repository.file = json }, load: async () => repository.file, getInfo: async () => ({ savedAt: '2026-11-01T10:00:00.000Z' }) }
  return repository
}

describe('CAREER-F1 arrival continuity on canonical ACB data', () => {
  it('creates a persistent professional identity and receives the UCAM Murcia post', () => {
    expect(getUserTeam(initial)?.name).toBe('UCAM Murcia')
    expect(initial.seasons[initial.currentSeasonId]?.label).toBe('2026/27')
    expect(initial.coaches[initial.userCoachId]).toMatchObject({ firstName: 'Elena', lastName: 'F1' })
    expect(initial.coachEmploymentByCoachId[initial.userCoachId]?.status).toBe('employed')
    expect(Object.values(initial.coachCareerHistoryByCoachId[initial.userCoachId] ?? []).some((entry) => entry.kind === 'appointment')).toBe(true)
  })

  it('resolves the first professional decision, round-trips Save V4, and reaches a real match without repeating arrival', async () => {
    const pending = getPendingFirstStaffMeeting(initial)
    expect(pending).not.toBeNull()
    const meeting = decideFirstStaffMeeting(initial, pending!.assistantStaffId, 'seekInput')
    expect(meeting.status).toBe('APPLIED')
    if (meeting.status !== 'APPLIED') return

    const repository = memoryRepository()
    await saveCurrentGame(meeting.world, repository, '2026-11-01T10:00:00.000Z')
    const loaded = await loadSavedGame(repository)
    expect(JSON.parse(repository.file).schemaVersion).toBe(4)
    expect(getPendingFirstStaffMeeting(loaded)).toBeNull()
    expect(deserializeGameWorldV4(serializeGameWorldV4(loaded, '2026-11-01T10:00:00.000Z')).memoriesById).toEqual(loaded.memoriesById)

    let seed = 9000
    const arrived = (await continueGameAsync(loaded, createInlineMatchRunner(), 120, () => seed++)).world
    const next = getNextUserGame(arrived)
    expect(next).toBeDefined()
    const played = instantResult(arrived, undefined, 20260926)
    expect(played.games[next!.id]?.status).toBe('completed')
  }, 180_000)
})
