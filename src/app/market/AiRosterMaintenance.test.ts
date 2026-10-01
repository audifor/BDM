import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { releasePlayer } from './MarketService'
import { updateGameWorld } from '@/domain/world'
import { freeAgentDesirability, maintainAiTeamMinimumRosters } from './AiRosterMaintenance'

describe('AI roster maintenance', () => {
  it('repairs an AI minimum from affordable free agents deterministically and idempotently', () => {
    const base = createNewGame()
    const user = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!
    const ai = Object.values(base.teams).find((team) => team.id !== user.id)!
    const donor = Object.values(base.teams).find((team) => team.id !== user.id && team.id !== ai.id)!
    const released = releasePlayer(base, donor.id, donor.rosterPlayerIds[0]!)
    const short = updateGameWorld(released, {
      teams: Object.values(released.teams).map((team) => team.id === ai.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.slice(0, 4) } : team),
      teamFinances: Object.values(released.teamFinancesByTeamId).map((finance) => finance.teamId === ai.id ? { ...finance, playerSalaryBudget: 100_000_000 } : finance),
    })

    const result = maintainAiTeamMinimumRosters(short, { source: 'WORLD_REPAIR' })
    expect(result.world.teams[ai.id]!.rosterPlayerIds).toHaveLength(5)
    expect(result.world.teams[ai.id]!.rosterPlayerIds).toContain(released.players[donor.rosterPlayerIds[0]!]!.id)
    expect(result.world.teams[user.id]!.rosterPlayerIds).toEqual(short.teams[user.id]!.rosterPlayerIds)
    expect(result.unresolvedTeamIds).toEqual([])
    expect(result.reports.find((report) => report.targetEntity === ai.id)).toMatchObject({ classification: 'RECOVERABLE', sourceDomain: 'WORLD_REPAIR', worldChanged: true, userActionRequired: false })
    expect(Object.values(result.world.playerTransactionsById).filter((transaction) => transaction.toTeamId === ai.id && transaction.kind === 'signedFreeAgent')).toEqual([expect.objectContaining({ provenance: 'WORLD_REPAIR' })])

    const repeated = maintainAiTeamMinimumRosters(result.world, { source: 'WORLD_REPAIR' })
    expect(repeated.world).toEqual(result.world)
    expect(repeated.world.teams[ai.id]!.rosterPlayerIds).toHaveLength(5)
  })

  it('never auto-fills a user roster and reports manual Market action', () => {
    const world = createNewGame()
    const user = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!
    const short = updateGameWorld(world, { teams: Object.values(world.teams).map((team) => team.id === user.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.slice(0, 4) } : team) })
    const result = maintainAiTeamMinimumRosters(short, { source: 'WORLD_REPAIR' })

    expect(result.world.teams[user.id]!.rosterPlayerIds).toEqual(short.teams[user.id]!.rosterPlayerIds)
    expect(result.unresolvedTeamIds).toContain(user.id)
    expect(result.reports.find((report) => report.targetEntity === user.id)).toMatchObject({ classification: 'RECOVERABLE', worldChanged: false, userActionRequired: true })
  })

  it('reports an AI shortage unresolved when no free agent exists and creates no players', () => {
    const world = createNewGame()
    const ai = Object.values(world.teams)[1]!
    const short = updateGameWorld(world, { teams: Object.values(world.teams).map((team) => team.id === ai.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.slice(0, 3) } : team) })
    const playerIds = Object.keys(short.players)
    const result = maintainAiTeamMinimumRosters(short, { source: 'WORLD_REPAIR' })

    expect(result.unresolvedTeamIds).toContain(ai.id)
    expect(result.world.teams[ai.id]!.rosterPlayerIds).toHaveLength(3)
    expect(Object.keys(result.world.players)).toEqual(playerIds)
    expect(result.reports.find((report) => report.targetEntity === ai.id)).toMatchObject({ classification: 'UNRECOVERABLE', worldChanged: false, userActionRequired: false })
  })

  it('keeps contract cost objective and separate from talent valuation', () => {
    expect(freeAgentDesirability(70, 500_000)).toBeGreaterThan(freeAgentDesirability(70, 2_000_000))
  })
})
