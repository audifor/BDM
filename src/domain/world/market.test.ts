import { expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import { contractIdFromString } from '@/domain/ids'
import { createPlayerContract } from '@/domain/contract'
import { createNewGame } from '@/app/game/createNewGame'
import type { GameWorld } from './GameWorld'
import { getFreeAgents, isPlayerFreeAgent } from './market'

it('keeps retired, rostered and scheduled/active contract Players out of the free-agent query', () => {
  const base = createNewGame()
  const players = Object.values(base.players).slice(0, 5)
  const team = Object.values(base.teams)[0]!
  const contract = createPlayerContract({ id: contractIdFromString('contract:free-agent-query'), playerId: players[0]!.id, teamId: team.id, kind: 'standard', term: { startsOn: addDays(base.currentDate, 2), expiresOn: addDays(base.currentDate, 4) }, compensation: { annualSalary: 1000 } })
  const retired = { ...players[1]!, careerEnd: { endedOn: base.currentDate, reason: 'ageLimit' as const } }
  const world: GameWorld = { ...base, teams: Object.fromEntries(Object.values(base.teams).map(item => [item.id, { ...item, rosterPlayerIds: item.rosterPlayerIds.filter(id => !players.slice(0, 4).some(player => player.id === id)) }])), contractsById: { [contract.id]: contract }, players: { ...base.players, [retired.id]: retired } }
  for (const date of [base.currentDate, contract.term.startsOn, contract.term.expiresOn]) {
    const agents = getFreeAgents(world, date)
    expect(agents.map(player => player.id)).toEqual(Object.values(world.players).filter(player => isPlayerFreeAgent(world, player.id, date)).sort((a,b) => a.basketball.primaryPosition.localeCompare(b.basketball.primaryPosition) || a.lastName.localeCompare(b.lastName) || a.id.localeCompare(b.id)).map(player => player.id))
    expect(agents.some(player => player.id === retired.id)).toBe(false)
    expect(agents.some(player => player.id === players[4]!.id)).toBe(false)
    expect(agents.some(player => player.id === contract.playerId)).toBe(date >= contract.term.expiresOn)
    expect(agents.some(player => player.id === players[2]!.id)).toBe(true)
  }
})
