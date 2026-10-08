import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { GameWorld } from '@/domain/world'
import { createNewGame } from './createNewGame'
import { advanceGameDayWithResult } from './advanceGameDay'

const injected = vi.hoisted(() => ({ mutate: undefined as ((world: GameWorld) => GameWorld) | undefined }))
vi.mock('./DailyWorldValidation', async original => {
  const actual = await original<typeof import('./DailyWorldValidation')>()
  return { ...actual, withDailyWorldValidation: (world: GameWorld, execute: (world: GameWorld) => GameWorld, mode: 'full' | 'incremental') => actual.withDailyWorldValidation(world, initial => injected.mutate!(execute(initial)), mode) }
})
let source: GameWorld
beforeAll(() => { source = createNewGame({ seed: 15015 }) })
const corruptions: Record<string, (world: GameWorld) => GameWorld> = {
  'duplicate roster ownership': world => {
    const [a, b] = Object.values(world.teams)
    return { ...world, teams: { ...world.teams, [b!.id]: { ...b!, rosterPlayerIds: [...b!.rosterPlayerIds, a!.rosterPlayerIds[0]!] } } }
  },
  'invalid contract ownership': world => {
    const contract = Object.values(world.contractsById)[0]!
    const other = Object.values(world.teams).find(team => team.id !== contract.teamId)!
    return { ...world, contractsById: { ...world.contractsById, [contract.id]: { ...contract, teamId: other.id } } }
  },
  'permanently exhausted NCAA roster': world => {
    const enrollment = Object.values(world.playerEnrollmentsById).find(item => item.status === 'active' && world.teams[item.teamId]?.rosterPlayerIds.includes(item.playerId))!
    const profile = Object.values(world.eligibilityProfilesById).find(item => item.playerId === enrollment.playerId)!
    return { ...world, eligibilityProfilesById: { ...world.eligibilityProfilesById, [profile.id]: { ...profile, seasonsUsed: 4 } } }
  },
  'dangling Player': world => {
    const playerId = Object.values(world.teams)[0]!.rosterPlayerIds[0]!
    const players = { ...world.players }; delete players[playerId]
    return { ...world, players }
  },
  'invalid lineup': world => {
    const team = Object.values(world.teams)[0]!
    return { ...world, lineupsByTeamId: { ...world.lineupsByTeamId, [team.id]: { ...world.lineupsByTeamId[team.id]!, starters: { PG: 'missing-player' as never } } } }
  },
}
for (const dailyValidationMode of ['full', 'incremental'] as const) for (const forceDetail of ['FULL', 'STANDARD', 'BACKGROUND'] as const) describe(`${dailyValidationMode}/${forceDetail} publication failures`, () => {
  for (const [name, mutate] of Object.entries(corruptions)) it(`fails the day atomically for ${name}`, () => {
    injected.mutate = mutate
    const result = advanceGameDayWithResult(source, () => 15015, ['userGame'], { dailyValidationMode, forceDetail })
    expect(result.status).toBe('FAILED')
    expect(result.failure?.phaseId).toBe('DAY_PUBLICATION')
    expect(result.failure?.kind).toBe('INVARIANT_VIOLATION')
    expect(result.world).toBe(source)
  })
})
