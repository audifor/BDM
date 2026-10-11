import { describe, expect, it } from 'vitest'
import { createGameWorld, updateGameWorld, getWorldValidationReport } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createNewGame } from './createNewGame'
import { withDailyWorldValidation } from './DailyWorldValidation'
import { addDays } from '@/domain/date'
import { createPlayerContract } from '@/domain/contract'
import { contractIdFromString } from '@/domain/ids'

for (const mode of ['full', 'incremental'] as const) describe(`daily publication ${mode}`, () => {
  const base = () => createGameWorld(createValidGameWorldInput())
  it('rejects duplicate roster ownership', () => {
    const world = base(); const [a, b] = Object.values(world.teams)
    expect(() => withDailyWorldValidation(world, initial => updateGameWorld(initial, { teams: Object.values(initial.teams).map(team => team.id === b!.id ? { ...team, rosterPlayerIds: [...team.rosterPlayerIds, a!.rosterPlayerIds[0]!] } : team) }), mode)).toThrow()
  })
  it('rejects dangling Players and invalid lineups', () => {
    const world = base(); const team = Object.values(world.teams)[0]!
    expect(() => withDailyWorldValidation(world, initial => updateGameWorld(initial, { players: [] }), mode)).toThrow()
    expect(() => withDailyWorldValidation(world, initial => updateGameWorld(initial, { lineupsByTeamId: { ...initial.lineupsByTeamId, [team.id]: { ...(initial.lineupsByTeamId[team.id] ?? {}), starters: { PG: 'missing-player' as never } } as never } }), mode)).toThrow()
  })
  it('rejects invalid active contract ownership and dangling contract references', () => {
    const world = base(); const [a, b] = Object.values(world.teams)
    const contract = createPlayerContract({ id: contractIdFromString('injected-invalid-contract'), playerId: a!.rosterPlayerIds[0]!, teamId: b!.id, kind: 'standard', term: { startsOn: world.currentDate, expiresOn: addDays(world.currentDate, 365) }, compensation: { annualSalary: 1000 } })
    expect(() => withDailyWorldValidation(world, initial => updateGameWorld(initial, { contracts: [contract] }), mode)).toThrow('ownership')
    expect(() => withDailyWorldValidation(world, initial => updateGameWorld(initial, { contracts: [{ ...contract, playerId: 'missing-player' as never }] }), mode)).toThrow()
  })
  it('rejects permanently exhausted NCAA roster state', () => {
    const world = createNewGame({ seed: 15015 }); const enrollment = Object.values(world.playerEnrollmentsById)[0]!
    expect(() => withDailyWorldValidation(world, initial => updateGameWorld(initial, { eligibilityProfiles: Object.values(initial.eligibilityProfilesById).map(item => item.playerId === enrollment.playerId ? { ...item, seasonsUsed: 4 } : item) }), mode)).toThrow('Permanently ineligible')
  })
})
it('uses actual dirty dependencies and keeps the old world immutable', () => {
  const initial = createGameWorld(createValidGameWorldInput())
  const next = withDailyWorldValidation(initial, world => updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) }))
  expect(getWorldValidationReport(next)?.mode).toBe('incremental')
  expect(getWorldValidationReport(next)?.dirtyCollections).toEqual(['currentDate'])
  expect(Object.values(getWorldValidationReport(next)!.blocks).some(block => block.reused)).toBe(true)
  expect(next.players).toBe(initial.players)
})
